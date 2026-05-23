import {
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';
import { writeAudit } from '../audit/log';

export const UpdateBody = z.object({
  enabled: z.boolean(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});
export type UpdateBody = z.infer<typeof UpdateBody>;

export async function updateProvider(
  ddb: DynamoDBClient,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string,
  body: unknown
) {
  const parsed = UpdateBody.parse(body);
  const before = await ddb.send(
    new GetItemCommand({ TableName: configTable, Key: marshall({ providerId }) })
  );
  if (!before.Item) throw new Error('NOT_FOUND');
  await ddb.send(
    new UpdateItemCommand({
      TableName: configTable,
      Key: marshall({ providerId }),
      UpdateExpression: 'SET enabled = :e, quota = :q, timeoutMs = :t',
      ExpressionAttributeValues: marshall({
        ':e': parsed.enabled,
        ':q': parsed.quota,
        ':t': parsed.timeoutMs
      })
    })
  );
  await writeAudit(ddb, auditTable, {
    actor,
    action: 'update_provider',
    target: `provider:${providerId}`,
    before: unmarshall(before.Item),
    after: { providerId, ...parsed }
  });
  return { providerId, ...parsed };
}
