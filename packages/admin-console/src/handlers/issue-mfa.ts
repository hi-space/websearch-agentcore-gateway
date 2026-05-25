import type { KMSClient } from '@aws-sdk/client-kms';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { issueMfaAssertion } from '../auth/mfa-assertion';
import { writeAudit } from '../audit/log';

export async function issueStepUp(
  kms: KMSClient,
  ddb: DynamoDBClient,
  keyId: string,
  auditTable: string,
  actor: string,
  now: number = Date.now()
): Promise<{ payload: string; signature: string; expiresAt: number }> {
  const assertion = await issueMfaAssertion(kms, keyId, actor, now);
  await writeAudit(ddb, auditTable, {
    actor,
    action: 'mfa_step_up_issued',
    target: `actor:${actor}`,
    after: { expiresAt: assertion.expiresAt }
  });
  return assertion;
}
