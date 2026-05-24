import { Construct } from 'constructs';
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  TargetType,
  Protocol
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
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
      containerInsights: true
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
          protocol: 'tcp'
        }
      ]
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
      protocol: Protocol.HTTP,
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
      serviceName: 'searxng'
    });

    // Attach to target group
    targetGroup.addTarget(this.service);

    // Add listener
    alb.addListener('Listener', {
      port: 80,
      protocol: Protocol.HTTP,
      defaultTargetGroups: [targetGroup]
    });

    // Set the endpoint
    this.endpoint = `http://${alb.loadBalancerDnsName}:80`;
  }
}
