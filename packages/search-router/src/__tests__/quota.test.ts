import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ErrorCode } from '@search-gateway/shared';
import { createQuotaService } from '../quota.js';

const ddb = mockClient(DynamoDBDocumentClient);

describe('QuotaService', () => {
  beforeEach(() => { ddb.reset(); });

  it('increments rpm and daily counters and returns ok within limits', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { count: 1 } });
    const svc = createQuotaService({ tableName: 't', clock: () => new Date('2026-05-23T12:34:00Z') });
    await expect(svc.consume('arxiv', { rpm: 60, daily: 1000 })).resolves.toBeUndefined();
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(2);
  });

  it('throws RATE_LIMITED with retryAfterSec when conditional fails', async () => {
    const err = new Error('cond fail') as Error & { name: string };
    err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);
    const svc = createQuotaService({ tableName: 't', clock: () => new Date('2026-05-23T12:34:30Z') });
    await expect(svc.consume('arxiv', { rpm: 60, daily: 1000 })).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      retryAfterSec: 30
    });
  });
});
