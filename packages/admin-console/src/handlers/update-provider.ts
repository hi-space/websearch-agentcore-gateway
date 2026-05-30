import {
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';
import { writeAudit } from '../audit/log';
import { probeProvider } from './probe-provider';
import type { LastVerify } from '../lib/verify-status';

export const UpdateBody = z.object({
  enabled: z.boolean(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});
export type UpdateBody = z.infer<typeof UpdateBody>;

export class VerificationFailedError extends Error {
  constructor(public lastVerify: LastVerify) {
    super('VERIFICATION_FAILED');
  }
}

export async function updateProvider(
  ddb: DynamoDBClient,
  lambda: LambdaClient,
  routerArn: string,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string,
  body: unknown
): Promise<{ providerId: string; enabled: boolean; quota: { rpm: number; daily: number }; timeoutMs: number; lastVerify?: LastVerify }> {
  const parsed = UpdateBody.parse(body);
  const key = marshall({ pk: 'provider', sk: providerId });
  const before = await ddb.send(new GetItemCommand({ TableName: configTable, Key: key }));
  if (!before.Item) throw new Error('NOT_FOUND');

  const wasEnabled = before.Item.enabled?.BOOL === true;
  const wantEnable = parsed.enabled === true && !wasEnabled;

  let lastVerify: LastVerify | undefined;
  let effectiveEnabled = parsed.enabled;
  if (wantEnable) {
    lastVerify = await probeProvider(lambda, routerArn, providerId);
    if (!lastVerify.ok) effectiveEnabled = false;
  }

  const expressionValues: Record<string, unknown> = {
    ':e': effectiveEnabled,
    ':q': parsed.quota,
    ':t': parsed.timeoutMs
  };
  let updateExpression = 'SET #enabled = :e, quota = :q, timeoutMs = :t';
  if (lastVerify) {
    expressionValues[':lv'] = lastVerify;
    updateExpression += ', lastVerify = :lv';
  }

  await ddb.send(
    new UpdateItemCommand({
      TableName: configTable,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: marshall(expressionValues)
    })
  );

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'update_provider',
    target: `provider:${providerId}`,
    before: unmarshall(before.Item),
    after: { providerId, ...parsed, enabled: effectiveEnabled, ...(lastVerify ? { lastVerify } : {}) }
  });

  if (wantEnable && lastVerify && !lastVerify.ok) {
    throw new VerificationFailedError(lastVerify);
  }

  return {
    providerId,
    enabled: effectiveEnabled,
    quota: parsed.quota,
    timeoutMs: parsed.timeoutMs,
    ...(lastVerify ? { lastVerify } : {})
  };
}
