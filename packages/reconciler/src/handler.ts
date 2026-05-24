import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { diffTargets } from './diff.js';

export interface HandlerDeps {
  ddb: DynamoDBClient;
  configTable: string;
  gatewayId: string;
  listGatewayTargets: (gatewayId: string) => Promise<string[]>;
  emitMetric: (name: string, value: number) => void;
  log: { info: (m: string, ctx?: unknown) => void; warn: (m: string, ctx?: unknown) => void };
}

export function createHandler(deps: HandlerDeps) {
  return async function handler() {
    const out = await deps.ddb.send(new ScanCommand({ TableName: deps.configTable }));
    const ddbTools = (out.Items ?? [])
      .map((i) => unmarshall(i) as { providerId: string; enabled: boolean })
      .filter((r) => r.enabled)
      .map((r) => `search_${r.providerId}`);
    const gwTools = await deps.listGatewayTargets(deps.gatewayId);
    const diff = diffTargets({ ddb: ddbTools, gateway: gwTools });
    const total = diff.missing.length + diff.extra.length;
    deps.emitMetric('ReconcilerDrift', total);
    if (total > 0) deps.log.warn('reconciler.drift', diff);
    else deps.log.info('reconciler.clean');
    return diff;
  };
}
