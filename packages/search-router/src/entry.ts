import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { Adapter, SearchOpts, SearchResult } from '@search-gateway/shared';
import { createSecretsCache } from '@search-gateway/shared';
import { listAdapters } from '@search-gateway/adapters';
import { createHandler } from './handler.js';
import { createQuotaService, type QuotaLimits } from './quota.js';
import { loadEnabledProviders } from './config-store.js';
import { callGatewayBuiltin } from './gateway-client.js';

const TABLE = process.env.QUOTA_TABLE_NAME;
if (!TABLE) throw new Error('QUOTA_TABLE_NAME env var is required');

const CONFIG_TABLE = process.env.CONFIG_TABLE;
const GATEWAY_URL = process.env.GATEWAY_URL;
const GATEWAY_TOKEN_SSM_PARAM = process.env.GATEWAY_TOKEN_SSM_PARAM;
const UNIFIED_BUILTINS = process.env.UNIFIED_BUILTINS ?? '';

let adapters: Record<string, Adapter> = Object.fromEntries(
  listAdapters().map((a) => [a.name, a])
);
let limitsEnv: Record<string, QuotaLimits> = JSON.parse(process.env.QUOTA_LIMITS_JSON ?? '{}');
let secretArnsEnv: Record<string, string> = JSON.parse(process.env.SECRET_ARNS_JSON ?? '{}');
let providerOptsEnv: Record<string, SearchOpts> = {};

// Cold-start initialization from ConfigTable
if (CONFIG_TABLE) {
  const ddb = new DynamoDBClient({});
  const enabledProviders = await loadEnabledProviders(ddb, CONFIG_TABLE);

  // Build limits, secret ARNs, and provider opts from enabled providers
  limitsEnv = Object.fromEntries(
    enabledProviders.map((p) => [p.providerId, p.quota])
  );
  secretArnsEnv = Object.fromEntries(
    enabledProviders
      .filter((p) => p.secretArn)
      .map((p) => [p.providerId, p.secretArn!])
  );
  providerOptsEnv = Object.fromEntries(
    enabledProviders
      .map((p): [string, SearchOpts] => [
        p.providerId,
        {
          ...(p.baseUrl && { baseUrl: p.baseUrl }),
          topK: 10
        }
      ])
      .filter(([, opts]) => Object.keys(opts).length > 1) // Only include if has baseUrl or other options
  );
}

// Unified search is always enabled. When GATEWAY_URL + GATEWAY_TOKEN_SSM_PARAM are
// set, builtin tools (e.g. Tavily/Brave) join the fan-out via the AgentCore Gateway;
// otherwise unified runs over the lambda adapters alone.
const gatewayConfigured = Boolean(GATEWAY_URL && GATEWAY_TOKEN_SSM_PARAM);

const builtinTools = gatewayConfigured
  ? UNIFIED_BUILTINS.split(',').map((t) => t.trim()).filter(Boolean)
  : [];

const callBuiltin: (tool: string, query: string, topK?: number) => Promise<SearchResult[]> =
  gatewayConfigured
    ? (() => {
        const ssm = new SSMClient({});
        let cachedToken: string | undefined;
        return async (tool, query, topK) => {
          if (!cachedToken) {
            const param = await ssm.send(
              new GetParameterCommand({ Name: GATEWAY_TOKEN_SSM_PARAM, WithDecryption: true })
            );
            cachedToken = param.Parameter?.Value;
            if (!cachedToken) throw new Error('Failed to resolve Gateway token from SSM');
          }
          return callGatewayBuiltin({ gatewayUrl: GATEWAY_URL!, token: cachedToken, tool, query, topK });
        };
      })()
    : async () => {
        throw new Error('Gateway builtin invocation requested but GATEWAY_URL is not configured');
      };

const unifiedConfig = { builtinTools, callBuiltin };

export const handler = createHandler({
  adapters,
  quota: createQuotaService({ tableName: TABLE }),
  limits: limitsEnv,
  secrets: createSecretsCache(),
  secretArns: secretArnsEnv,
  providerOpts: providerOptsEnv,
  unified: unifiedConfig
});
