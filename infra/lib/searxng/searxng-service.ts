import { Construct } from 'constructs';
import {
  Cluster,
  ContainerImage,
  ContainerInsights,
  FargateService,
  FargateTaskDefinition,
  LogDriver
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  TargetType,
  ApplicationProtocol
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Protocol } from 'aws-cdk-lib/aws-ecs';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';

export interface SearxngServiceProps {
  vpc: IVpc;
  desiredCount?: number;
}

export class SearxngService extends Construct {
  readonly service: FargateService;
  readonly endpoint: string;

  constructor(scope: Construct, id: string, props: SearxngServiceProps) {
    super(scope, id);

    const desiredCount = props.desiredCount ?? 2;

    // Create an ECS cluster
    const cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ContainerInsights.ENABLED
    });

    // Create a Fargate task definition
    const taskDef = new FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512
    });

    // Create CloudWatch log group
    const logGroup = new LogGroup(this, 'LogGroup', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // SearXNG default settings.yml enables only the html format, which makes
    // JSON API queries return 403. We materialize a minimal settings.yml at
    // /etc/searxng/settings.yml (the SEARXNG_SETTINGS_PATH default) before the
    // image's original entrypoint runs — entrypoint.sh keeps an existing file
    // and only copies the template when missing. We also generate a per-task
    // secret_key inline. Then we exec /usr/local/searxng/entrypoint.sh which
    // launches granian → searx.webapp:app on $GRANIAN_PORT (8080).
    const settingsYaml = [
      'use_default_settings: true',
      'server:',
      '  bind_address: "0.0.0.0"',
      '  port: 8080',
      '  secret_key: "__SEARXNG_SECRET__"',
      '  limiter: false',
      '  image_proxy: false',
      'search:',
      '  safe_search: 0',
      '  formats:',
      '    - html',
      '    - json'
    ].join('\n');
    const bootstrap = [
      'set -e',
      'mkdir -p /etc/searxng',
      'SECRET=$(head -c 24 /dev/urandom | base64 | tr -dc "a-zA-Z0-9")',
      `cat > /etc/searxng/settings.yml <<'YAML_EOF'\n${settingsYaml}\nYAML_EOF`,
      'sed -i "s|__SEARXNG_SECRET__|$SECRET|g" /etc/searxng/settings.yml',
      'chown -R searxng:searxng /etc/searxng',
      'exec /usr/local/searxng/entrypoint.sh'
    ].join('\n');

    // Add container
    taskDef.addContainer('SearXNG', {
      image: ContainerImage.fromRegistry('searxng/searxng:latest'),
      logging: LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'searxng'
      }),
      portMappings: [
        {
          containerPort: 8080,
          protocol: Protocol.TCP
        }
      ],
      entryPoint: ['sh', '-c'],
      command: [bootstrap]
    });

    // Create ALB
    const alb = new ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: false,
      loadBalancerName: 'searxng-internal'
    });

    // Create target group
    const targetGroup = new ApplicationTargetGroup(this, 'TG', {
      vpc: props.vpc,
      port: 8080,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      healthCheck: {
        path: '/healthz',
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(5)
      }
    });

    // Create Fargate service
    this.service = new FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      serviceName: 'searxng',
      circuitBreaker: { rollback: true },
      minHealthyPercent: 50,
      maxHealthyPercent: 200
    });

    // Attach to target group
    targetGroup.addTarget(this.service);

    // Add listener
    alb.addListener('Listener', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    });

    // Set the endpoint
    this.endpoint = `http://${alb.loadBalancerDnsName}:80`;
  }
}
