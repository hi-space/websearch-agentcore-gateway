import { GetItemCommand, PutItemCommand, UpdateItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { KMSClient } from '@aws-sdk/client-kms';
import { writeAudit } from '../audit/log';
import { verifyMfaAssertion, assertionFingerprint } from '../auth/mfa-assertion';

const REVEAL_CAP_PER_HOUR = 5;
const FIVE_MIN_SEC = 5 * 60;
const TWO_HOUR_SEC = 2 * 60 * 60;

export interface RevealSecretInput {
  ddb: DynamoDBClient;
  sm: SecretsManagerClient;
  kms: KMSClient;
  configTable: string;
  auditTable: string;
  replayTable: string;
  mfaKeyId: string;
  actor: string;
  providerId: string;
  reason: string;
  assertion: { payload: string; signature: string };
  now?: number;
}

// Single-use replay guard: conditional Put on the assertion fingerprint.
// Errors map to STEP_UP_REQUIRED so callers can't distinguish replay from forgery.
async function consumeAssertion(
  ddb: DynamoDBClient,
  table: string,
  fingerprint: string,
  nowSec: number
): Promise<void> {
  try {
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: marshall({
        pk: `assertion#${fingerprint}`,
        sk: 'used',
        ttl: nowSec + FIVE_MIN_SEC
      }),
      ConditionExpression: 'attribute_not_exists(pk)'
    }));
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') throw new Error('STEP_UP_REQUIRED');
    throw e;
  }
}

// Hourly per-actor reveal counter via DDB conditional update.
// Atomic increment with ADD; we read back the post-update count and refuse if it exceeds the cap.
async function bumpHourlyCounter(
  ddb: DynamoDBClient,
  table: string,
  actor: string,
  nowSec: number
): Promise<number> {
  const hourBucket = Math.floor(nowSec / 3600);
  const out = await ddb.send(new UpdateItemCommand({
    TableName: table,
    Key: marshall({ pk: `reveal#${actor}#${hourBucket}`, sk: 'counter' }),
    UpdateExpression: 'ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)',
    ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
    ExpressionAttributeValues: marshall({ ':one': 1, ':ttl': nowSec + TWO_HOUR_SEC }),
    ReturnValues: 'UPDATED_NEW'
  }));
  const count = Number(out.Attributes?.count?.N ?? '0');
  return count;
}

export async function revealSecret(input: RevealSecretInput): Promise<{ providerId: string; value: string }> {
  const {
    ddb, sm, kms, configTable, auditTable, replayTable, mfaKeyId,
    actor, providerId, reason, assertion
  } = input;
  const nowMs = input.now ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  if (!reason || reason.trim().length < 4) throw new Error('INVALID_INPUT');

  await verifyMfaAssertion(kms, mfaKeyId, assertion, actor, nowMs);
  await consumeAssertion(ddb, replayTable, assertionFingerprint(assertion), nowSec);

  const count = await bumpHourlyCounter(ddb, replayTable, actor, nowSec);
  if (count > REVEAL_CAP_PER_HOUR) {
    await writeAudit(ddb, auditTable, {
      actor, action: 'reveal_blocked', target: `provider:${providerId}`,
      after: { reason: reason.trim(), hourlyCount: count }
    });
    throw new Error('RATE_LIMITED');
  }

  const cfg = await ddb.send(new GetItemCommand({ TableName: configTable, Key: marshall({ providerId }) }));
  const arn = cfg.Item?.secretArn?.S;
  if (!arn) throw new Error('NOT_FOUND');
  const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) throw new Error('NO_SECRET');

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'reveal_secret',
    target: `provider:${providerId}`,
    after: { reason: reason.trim(), hourlyCount: count }
  });
  return { providerId, value: out.SecretString };
}
