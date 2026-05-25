import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { parseProviderConfig, type ProviderConfig } from '@search-gateway/shared';

export async function loadEnabledProviders(
  ddb: DynamoDBClient,
  tableName: string
): Promise<ProviderConfig[]> {
  const out = await ddb.send(new ScanCommand({ TableName: tableName }));
  return (out.Items ?? [])
    .map((i) => parseProviderConfig(unmarshall(i)))
    .filter((p) => p.enabled);
}
