import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  ddb: DynamoDBClient,
  tableName: string,
  entry: AuditEntry
): Promise<void> {
  const ts = new Date().toISOString();
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(
        {
          actor: entry.actor,
          ts,
          action: entry.action,
          target: entry.target,
          before: entry.before ?? null,
          after: entry.after ?? null
        },
        { removeUndefinedValues: true }
      )
    })
  );
}
