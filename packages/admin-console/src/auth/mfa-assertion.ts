import { SignCommand, VerifyCommand, type KMSClient } from '@aws-sdk/client-kms';
import { createHash, randomBytes } from 'node:crypto';

const FIVE_MIN_MS = 5 * 60 * 1000;

export interface MfaAssertionPayload {
  sub: string;
  nonce: string;
  iat: number;
}

export interface SignedAssertion {
  payload: string;
  signature: string;
  expiresAt: number;
}

const enc = (s: string) => Buffer.from(s).toString('base64url');
const dec = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export async function issueMfaAssertion(
  kms: KMSClient,
  keyId: string,
  sub: string,
  now: number = Date.now()
): Promise<SignedAssertion> {
  const payload: MfaAssertionPayload = { sub, nonce: randomBytes(16).toString('hex'), iat: now };
  const payloadStr = JSON.stringify(payload);
  const out = await kms.send(new SignCommand({
    KeyId: keyId,
    Message: Buffer.from(payloadStr),
    MessageType: 'RAW',
    SigningAlgorithm: 'RSASSA_PSS_SHA_256'
  }));
  if (!out.Signature) throw new Error('KMS_SIGN_FAILED');
  return {
    payload: enc(payloadStr),
    signature: Buffer.from(out.Signature).toString('base64url'),
    expiresAt: now + FIVE_MIN_MS
  };
}

export async function verifyMfaAssertion(
  kms: KMSClient,
  keyId: string,
  assertion: { payload: string; signature: string },
  expectedSub: string,
  now: number = Date.now()
): Promise<MfaAssertionPayload> {
  let payload: MfaAssertionPayload;
  try {
    payload = JSON.parse(dec(assertion.payload));
  } catch {
    throw new Error('STEP_UP_REQUIRED');
  }
  if (payload.sub !== expectedSub) throw new Error('STEP_UP_REQUIRED');
  if (now - payload.iat > FIVE_MIN_MS || now < payload.iat) throw new Error('STEP_UP_REQUIRED');

  const out = await kms.send(new VerifyCommand({
    KeyId: keyId,
    Message: Buffer.from(dec(assertion.payload)),
    MessageType: 'RAW',
    Signature: Buffer.from(assertion.signature, 'base64url'),
    SigningAlgorithm: 'RSASSA_PSS_SHA_256'
  }));
  if (!out.SignatureValid) throw new Error('STEP_UP_REQUIRED');
  return payload;
}

export function assertionFingerprint(assertion: { payload: string; signature: string }): string {
  return createHash('sha256').update(`${assertion.payload}.${assertion.signature}`).digest('hex');
}
