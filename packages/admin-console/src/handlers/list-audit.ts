import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export interface AuditRow {
  actor: string;
  ts: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
}

export async function listAudit(ddb: DynamoDBClient, tableName: string, limit: number): Promise<AuditRow[]> {
  const out = await ddb.send(new ScanCommand({ TableName: tableName, Limit: limit }));
  return (out.Items ?? [])
    .map((i) => unmarshall(i) as AuditRow)
    .sort((a, b) => b.ts.localeCompare(a.ts));
}
