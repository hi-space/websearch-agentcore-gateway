import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ErrorCode, SearchError } from '@search-gateway/shared';

export interface QuotaLimits {
  rpm: number;
  daily: number;
}

export interface QuotaService {
  consume(provider: string, limits: QuotaLimits): Promise<void>;
}

export interface QuotaServiceOptions {
  tableName: string;
  client?: DynamoDBDocumentClient;
  clock?: () => Date;
}

export function createQuotaService(opts: QuotaServiceOptions): QuotaService {
  const ddb = opts.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const clock = opts.clock ?? (() => new Date());

  async function increment(provider: string, window: 'rpm' | 'daily', bucket: string, limit: number, ttl: number) {
    try {
      await ddb.send(new UpdateCommand({
        TableName: opts.tableName,
        Key: { pk: `provider#${provider}`, sk: `window#${window}#${bucket}` },
        UpdateExpression: 'ADD #c :one SET #t = if_not_exists(#t, :ttl)',
        ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
        ExpressionAttributeNames: { '#c': 'count', '#t': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':limit': limit, ':ttl': ttl }
      }));
    } catch (e) {
      if ((e as { name?: string }).name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw e;
    }
    return true;
  }

  return {
    async consume(provider, limits) {
      const now = clock();
      const minBucket = now.toISOString().slice(0, 16);
      const dayBucket = now.toISOString().slice(0, 10);
      const minTtl = Math.floor(now.getTime() / 1000) + 120;
      const dayTtl = Math.floor(now.getTime() / 1000) + 86_400 * 2;

      const rpmOk = await increment(provider, 'rpm', minBucket, limits.rpm, minTtl);
      if (!rpmOk) {
        const retryAfterSec = 60 - now.getUTCSeconds();
        throw new SearchError(ErrorCode.RATE_LIMITED, `RPM exceeded for ${provider}`, {
          provider, retryAfterSec
        });
      }
      const dailyOk = await increment(provider, 'daily', dayBucket, limits.daily, dayTtl);
      if (!dailyOk) {
        const retryAfterSec = 86_400 -
          (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
        throw new SearchError(ErrorCode.RATE_LIMITED, `Daily quota exceeded for ${provider}`, {
          provider, retryAfterSec
        });
      }
    }
  };
}
