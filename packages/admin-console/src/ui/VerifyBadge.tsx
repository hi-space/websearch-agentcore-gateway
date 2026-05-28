import React from 'react';
import { Badge } from './Badge';
import type { VerifyStatus } from '../lib/verify-status';

export function VerifyBadge({ status, reason }: { status: VerifyStatus; reason?: string | undefined }) {
  if (status === 'verified') return <Badge tone="success">Verified</Badge>;
  if (status === 'stale') return <Badge tone="warning">Verification stale</Badge>;
  if (status === 'failed')
    return (
      <Badge tone="error" title={reason}>
        Verification failed
      </Badge>
    );
  return <Badge tone="neutral">Unverified</Badge>;
}
