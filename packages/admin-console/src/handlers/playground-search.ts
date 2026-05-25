import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { writeAudit } from '../audit/log';

export interface PlaygroundResult {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  source?: string;
}

export interface PlaygroundResponse {
  query: string;
  results: PlaygroundResult[];
  providersUsed: string[];
  errors: Array<{ provider: string; message: string }>;
  latencyMs: number;
}

export async function playgroundSearch(
  lambda: LambdaClient,
  routerArn: string,
  query: string,
  topK: number | undefined,
  ddb?: DynamoDBClient,
  auditTable?: string,
  actor?: string
): Promise<PlaygroundResponse> {
  const start = Date.now();
  const out = await lambda.send(
    new InvokeCommand({
      FunctionName: routerArn,
      Payload: Buffer.from(
        JSON.stringify({
          toolName: 'search_unified',
          arguments: topK !== undefined ? { query, topK } : { query }
        })
      )
    })
  );
  const body = JSON.parse(new TextDecoder().decode(out.Payload)) as
    | { results: PlaygroundResult[]; providersUsed: string[]; errors?: Array<{ provider: string; message: string }> }
    | { error: { code: string; message: string } };

  const latencyMs = Date.now() - start;

  if ('error' in body) {
    if (ddb && auditTable && actor) {
      await writeAudit(ddb, auditTable, {
        actor,
        action: 'playground_search',
        target: 'search_unified',
        after: { query, ok: false, error: body.error.code }
      });
    }
    throw new Error(body.error.code);
  }

  const response: PlaygroundResponse = {
    query,
    results: body.results,
    providersUsed: body.providersUsed,
    errors: body.errors ?? [],
    latencyMs
  };

  if (ddb && auditTable && actor) {
    await writeAudit(ddb, auditTable, {
      actor,
      action: 'playground_search',
      target: 'search_unified',
      after: {
        query,
        topK,
        providersUsed: response.providersUsed,
        resultCount: response.results.length,
        errorCount: response.errors.length
      }
    });
  }

  return response;
}
