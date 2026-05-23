import { Construct } from 'constructs';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
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
    this.fn = new NodejsFunction(this, 'Fn', {
      entry: ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(12),
      tracing: Tracing.ACTIVE,
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
    this.fn.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: { StringEquals: { 'cloudwatch:namespace': 'SearchGateway' } }
    }));
  }
}
