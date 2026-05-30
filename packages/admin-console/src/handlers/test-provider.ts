import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { UpdateItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { writeAudit } from '../audit/log';
import type { LastVerify } from '../lib/verify-status';
import type { Clock } from './probe-provider';

export async function testProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string,
  ddb?: DynamoDBClient,
  configTable?: string,
  auditTable?: string,
  actor?: string,
  clock: Clock = Date.now
): Promise<{ ok: boolean; results?: number; error?: string; lastVerify: LastVerify }> {
  const at = new Date(clock()).toISOString();
  let body: { results?: unknown[]; error?: { code: string; message: string } };
  let lastVerify: LastVerify;

  try {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: routerArn,
        Payload: Buffer.from(
          JSON.stringify({ toolName: `search_${providerId}`, arguments: { query: 'connectivity probe' } })
        )
      })
    );
    body = JSON.parse(new TextDecoder().decode(out.Payload));
    if (body.error) {
      lastVerify = { at, ok: false, code: body.error.code, error: body.error.message };
    } else {
      lastVerify = { at, ok: true };
    }
  } catch (e) {
    body = { error: { code: 'INVOKE_FAILED', message: (e as Error).message } };
    lastVerify = { at, ok: false, code: 'INVOKE_FAILED', error: (e as Error).message };
  }

  if (ddb && configTable) {
    await ddb.send(
      new UpdateItemCommand({
        TableName: configTable,
        Key: marshall({ pk: 'provider', sk: providerId }),
        UpdateExpression: 'SET lastVerify = :lv',
        ExpressionAttributeValues: marshall({ ':lv': lastVerify })
      })
    );
  }
  if (ddb && auditTable && actor) {
    await writeAudit(ddb, auditTable, {
      actor,
      action: 'test_provider',
      target: `provider:${providerId}`,
      after: { providerId, lastVerify }
    });
  }

  if (lastVerify.ok) {
    return { ok: true, results: body.results?.length ?? 0, lastVerify };
  }
  return { ok: false, ...(lastVerify.code ? { error: lastVerify.code } : {}), lastVerify };
}
