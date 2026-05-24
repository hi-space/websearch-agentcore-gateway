import { Construct } from 'constructs';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration, Stack } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ENTRY = resolve(here, '../../../packages/search-router/src/entry.ts');

export interface SearchRouterFnProps {
  vpc: IVpc;
  quotaTable: ITable;
  quotaLimits: Record<string, { rpm: number; daily: number }>;
}

export class SearchRouterFn extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: SearchRouterFnProps) {
    super(scope, id);

    // Create explicit role with only required permissions (no AWS-managed policies)
    const fnRole = new Role(this, 'FnRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'search-router Lambda function role with least-privilege permissions'
    });

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    // Add CloudWatch Logs permissions for Lambda execution
    fnRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/*`]
    }));

    // Add VPC permissions required for Lambda to run in VPC
    fnRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface'
      ],
      resources: ['*']
    }));

    // Add X-Ray permissions for tracing
    fnRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    // Add CloudWatch custom metrics
    fnRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: { StringEquals: { 'cloudwatch:namespace': 'SearchGateway' } }
    }));

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(12),
      tracing: Tracing.ACTIVE,
      role: fnRole,
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: true
      },
      environment: {
        QUOTA_TABLE_NAME: props.quotaTable.tableName,
        QUOTA_LIMITS_JSON: JSON.stringify(props.quotaLimits),
        SECRET_ARNS_JSON: '{}',
        NODE_OPTIONS: '--enable-source-maps'
      }
    });

    props.quotaTable.grantReadWriteData(this.fn);
  }
}
