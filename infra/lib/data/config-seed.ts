import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId
} from 'aws-cdk-lib/custom-resources';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface SeedRow {
  providerId: string;
  enabled: boolean;
  builtin?: boolean;
  secretArn?: string;
  quota?: { rpm: number; daily: number };
  timeoutMs?: number;
}

export interface ConfigSeedProps {
  table: ITable;
  providers: SeedRow[];
  kmsKey: IKey;
}

export class ConfigSeed extends Construct {
  constructor(scope: Construct, id: string, props: ConfigSeedProps) {
    super(scope, id);

    // Default quota and timeout values as documented in the plan:
    // rpm: 60, daily: 10000, timeoutMs: 8000
    const defaultQuota = { rpm: 60, daily: 10000 };
    const defaultTimeoutMs = 8000;

    // Prepare BatchWriteItem request items
    const requestItems = props.providers.map((row) => ({
      PutRequest: {
        Item: {
          pk: { S: 'provider' },
          sk: { S: row.providerId },
          enabled: { BOOL: row.enabled },
          ...(row.builtin && { builtin: { BOOL: row.builtin } }),
          ...(row.secretArn && { secretArn: { S: row.secretArn } }),
          quota: {
            M: {
              rpm: { N: (row.quota?.rpm ?? defaultQuota.rpm).toString() },
              daily: { N: (row.quota?.daily ?? defaultQuota.daily).toString() }
            }
          },
          timeoutMs: { N: (row.timeoutMs ?? defaultTimeoutMs).toString() }
        }
      }
    }));

    new AwsCustomResource(this, 'SeedResource', {
      onCreate: {
        service: 'dynamodb',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [props.table.tableName]: requestItems
          }
        },
        physicalResourceId: PhysicalResourceId.of('config-seed')
      },
      onUpdate: {
        service: 'dynamodb',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [props.table.tableName]: requestItems
          }
        },
        physicalResourceId: PhysicalResourceId.of('config-seed')
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['dynamodb:BatchWriteItem'],
          resources: [props.table.tableArn]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: [props.kmsKey.keyArn]
        })
      ]),
      installLatestAwsSdk: false,
      timeout: Duration.minutes(1)
    });
  }
}
