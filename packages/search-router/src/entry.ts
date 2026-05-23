import type { Adapter } from '@search-gateway/shared';
import { createSecretsCache } from '@search-gateway/shared';
import { listAdapters } from '@search-gateway/adapters';
import { createHandler } from './handler.js';
import { createQuotaService, type QuotaLimits } from './quota.js';

const TABLE = process.env.QUOTA_TABLE_NAME;
if (!TABLE) throw new Error('QUOTA_TABLE_NAME env var is required');

const adapters: Record<string, Adapter> = Object.fromEntries(
  listAdapters().map((a) => [a.name, a])
);
const limitsEnv = JSON.parse(process.env.QUOTA_LIMITS_JSON ?? '{}') as Record<string, QuotaLimits>;
const secretArnsEnv = JSON.parse(process.env.SECRET_ARNS_JSON ?? '{}') as Record<string, string>;

export const handler = createHandler({
  adapters,
  quota: createQuotaService({ tableName: TABLE }),
  limits: limitsEnv,
  secrets: createSecretsCache(),
  secretArns: secretArnsEnv
});
