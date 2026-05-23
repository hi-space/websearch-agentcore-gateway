import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { writeAudit } from '../audit/log';

export async function revealSecret(
  ddb: DynamoDBClient,
  sm: SecretsManagerClient,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string
): Promise<{ providerId: string; value: string }> {
  const cfg = await ddb.send(new GetItemCommand({ TableName: configTable, Key: marshall({ providerId }) }));
  const arn = cfg.Item?.secretArn?.S;
  if (!arn) throw new Error('NOT_FOUND');
  const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) throw new Error('NO_SECRET');
  await writeAudit(ddb, auditTable, {
    actor,
    action: 'reveal_secret',
    target: `provider:${providerId}`
  });
  return { providerId, value: out.SecretString };
}
