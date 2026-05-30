import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { LastVerify } from '../lib/verify-status';

export type Clock = () => number;

export async function probeProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string,
  clock: Clock = Date.now
): Promise<LastVerify> {
  const at = new Date(clock()).toISOString();
  try {
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
      | { error: { code: string; message: string } };
    if ('error' in body) {
      return { at, ok: false, code: body.error.code, error: body.error.message };
    }
    return { at, ok: true };
  } catch (e) {
    return { at, ok: false, code: 'INVOKE_FAILED', error: (e as Error).message };
  }
}
