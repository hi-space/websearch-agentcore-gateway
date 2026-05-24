import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { writeAudit } from '../audit/log';

export async function testProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string,
  ddb?: DynamoDBClient,
  auditTable?: string,
  actor?: string
): Promise<{ ok: boolean; results?: number; error?: string }> {
  const out = await lambda.send(
    new InvokeCommand({
      FunctionName: routerArn,
      Payload: Buffer.from(
        JSON.stringify({ toolName: `search_${providerId}`, arguments: { query: 'connectivity probe' } })
      )
    })
  );
  const body = JSON.parse(new TextDecoder().decode(out.Payload)) as
    | { results: unknown[] }
    | { error: { code: string } };
  const result = 'error' in body ? { ok: false, error: body.error.code } : { ok: true, results: body.results.length };

  // Write audit row if audit table and ddb client are provided
  if (ddb && auditTable && actor) {
    await writeAudit(ddb, auditTable, {
      actor,
      action: 'test_provider',
      target: `provider:${providerId}`,
      after: { providerId, ok: result.ok, error: result.error }
    });
  }

  return result;
}
