import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLog } from '../AuditLog.js';

describe('AuditLog', () => {
  it('renders one row per entry', () => {
    render(
      <AuditLog
        rows={[
          { actor: 'u1', ts: '2026-05-23T10:00:00Z', action: 'reveal_secret', target: 'provider:exa' }
        ]}
      />
    );
    expect(screen.getByText('reveal_secret')).toBeInTheDocument();
  });
});
