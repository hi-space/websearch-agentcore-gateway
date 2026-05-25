export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';
import { issueStepUp } from '../../../../src/handlers/issue-mfa';

const ddb = new DynamoDBClient({});
const kms = new KMSClient({});

export async function POST(req: NextRequest) {
  if (req.headers.get('x-auth-role') !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub');
  if (!actor) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!process.env.MFA_KMS_KEY_ID) {
    return NextResponse.json({ error: 'MFA_NOT_CONFIGURED' }, { status: 503 });
  }
  try {
    const out = await issueStepUp(kms, ddb, process.env.MFA_KMS_KEY_ID, process.env.AUDIT_TABLE!, actor);
    const res = NextResponse.json(out);
    res.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch {
    return NextResponse.json({ error: 'STEP_UP_FAILED' }, { status: 500 });
  }
}
