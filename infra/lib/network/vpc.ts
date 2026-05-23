import { Construct } from 'constructs';
import {
  IpAddresses,
  InterfaceVpcEndpointAwsService,
  GatewayVpcEndpointAwsService,
  SubnetType,
  Vpc,
  IVpc,
  FlowLog,
  FlowLogResourceType,
  FlowLogDestination
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

export class NetworkConstruct extends Construct {
  readonly vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, 'Vpc', {
      ipAddresses: IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'isolated', subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }
      ],
      restrictDefaultSecurityGroup: true
    });

    const flowLogGroup = new LogGroup(this, 'FlowLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN
    });
    new FlowLog(this, 'VpcFlowLog', {
      resourceType: FlowLogResourceType.fromVpc(this.vpc as IVpc),
      destination: FlowLogDestination.toCloudWatchLogs(flowLogGroup)
    });

    const ifaceServices: Array<[string, InterfaceVpcEndpointAwsService]> = [
      ['SecretsManager', InterfaceVpcEndpointAwsService.SECRETS_MANAGER],
      ['Kms', InterfaceVpcEndpointAwsService.KMS],
      ['Logs', InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS],
      ['Monitoring', InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING],
      ['Events', InterfaceVpcEndpointAwsService.EVENTBRIDGE],
      ['Sts', InterfaceVpcEndpointAwsService.STS]
    ];
    for (const [name, svc] of ifaceServices) {
      this.vpc.addInterfaceEndpoint(name, {
        service: svc,
        privateDnsEnabled: true
      });
    }
    this.vpc.addGatewayEndpoint('Dynamo', { service: GatewayVpcEndpointAwsService.DYNAMODB });
    this.vpc.addGatewayEndpoint('S3', { service: GatewayVpcEndpointAwsService.S3 });
  }
}
