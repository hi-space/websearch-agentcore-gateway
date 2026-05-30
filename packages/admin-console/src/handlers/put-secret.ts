import {
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { PutSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { writeAudit } from '../audit/log';

export async function putSecret(
  ddb: DynamoDBClient,
  sm: SecretsManagerClient,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string,
  value: string
): Promise<{ providerId: string; versionId: string }> {
  if (!value || value.length < 8) throw new Error('INVALID_INPUT');
  const key = marshall({ pk: 'provider', sk: providerId });
  const cfg = await ddb.send(new GetItemCommand({ TableName: configTable, Key: key }));
  const arn = cfg.Item?.secretArn?.S;
  if (!arn) throw new Error('NOT_FOUND');
  const out = await sm.send(new PutSecretValueCommand({ SecretId: arn, SecretString: value }));

  await ddb.send(
    new UpdateItemCommand({
      TableName: configTable,
      Key: key,
      UpdateExpression: 'SET #enabled = :e REMOVE lastVerify',
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: marshall({ ':e': false })
    })
  );

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'put_secret',
    target: `provider:${providerId}`,
    after: { versionId: out.VersionId, enabled: false, lastVerifyCleared: true }
  });
  return { providerId, versionId: out.VersionId! };
}
