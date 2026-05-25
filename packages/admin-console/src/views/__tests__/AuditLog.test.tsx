import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLog } from '../AuditLog.js';

const rows = [
  { actor: 'u1', ts: '2026-05-23T10:00:00Z', action: 'reveal_secret', target: 'provider:exa', after: { reason: 'rotation' } },
  { actor: 'u2', ts: '2026-05-23T09:00:00Z', action: 'update_provider', target: 'provider:exa' },
  { actor: 'u1', ts: '2026-05-23T08:00:00Z', action: 'mfa_step_up_issued', target: 'actor:u1' }
];

describe('AuditLog', () => {
  it('renders one row per entry', () => {
    render(<AuditLog rows={rows} />);
    expect(screen.getByText('reveal_secret')).toBeInTheDocument();
    expect(screen.getByText('update_provider')).toBeInTheDocument();
    expect(screen.getByText('mfa_step_up_issued')).toBeInTheDocument();
  });

  it('filters by pill tab', () => {
    render(<AuditLog rows={rows} />);
    fireEvent.click(screen.getByRole('tab', { name: /MFA & auth/ }));
    expect(screen.getByText('mfa_step_up_issued')).toBeInTheDocument();
    expect(screen.queryByText('update_provider')).not.toBeInTheDocument();
  });

  it('expands to show diff when row has before/after', () => {
    render(<AuditLog rows={rows} />);
    fireEvent.click(screen.getByText('Inspect'));
    expect(screen.getByText('After')).toBeInTheDocument();
  });
});
