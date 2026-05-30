import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { writeAudit } from '../audit/log';

export interface RevealSecretInput {
  ddb: DynamoDBClient;
  sm: SecretsManagerClient;
  configTable: string;
  auditTable: string;
  actor: string;
  providerId: string;
  reason: string;
}

export async function revealSecret(input: RevealSecretInput): Promise<{ providerId: string; value: string }> {
  const { ddb, sm, configTable, auditTable, actor, providerId, reason } = input;

  if (!reason || reason.trim().length < 4) throw new Error('INVALID_INPUT');

  const cfg = await ddb.send(
    new GetItemCommand({ TableName: configTable, Key: marshall({ pk: 'provider', sk: providerId }) })
  );
  const arn = cfg.Item?.secretArn?.S;
  if (!arn) throw new Error('NOT_FOUND');
  const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) throw new Error('NO_SECRET');

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'reveal_secret',
    target: `provider:${providerId}`,
    after: { reason: reason.trim() }
  });
  return { providerId, value: out.SecretString };
}
