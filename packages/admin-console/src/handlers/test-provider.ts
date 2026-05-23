import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';

export async function testProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string
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
  if ('error' in body) return { ok: false, error: body.error.code };
  return { ok: true, results: body.results.length };
}
