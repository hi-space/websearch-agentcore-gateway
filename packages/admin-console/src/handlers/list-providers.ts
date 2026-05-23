import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export interface ProviderRow {
  providerId: string;
  enabled: boolean;
  hasSecret: boolean;
  quota: { rpm: number; daily: number };
  timeoutMs: number;
}

export async function listProviders(ddb: DynamoDBClient, tableName: string): Promise<ProviderRow[]> {
  const out = await ddb.send(new ScanCommand({ TableName: tableName }));
  return (out.Items ?? []).map((i) => {
    const r = unmarshall(i) as { providerId: string; enabled: boolean; secretArn?: string; quota: { rpm: number; daily: number }; timeoutMs: number };
    return {
      providerId: r.providerId,
      enabled: r.enabled,
      hasSecret: !!r.secretArn,
      quota: r.quota,
      timeoutMs: r.timeoutMs
    };
  });
}
