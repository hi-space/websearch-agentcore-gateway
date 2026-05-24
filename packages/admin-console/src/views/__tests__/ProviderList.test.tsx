import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderList } from '../ProviderList.js';

const rows = [
  { providerId: 'exa', enabled: true, hasSecret: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 },
  { providerId: 'you', enabled: false, hasSecret: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
];

describe('ProviderList', () => {
  it('shows enabled badge and "missing secret" warning', () => {
    render(<ProviderList rows={rows} />);
    expect(screen.getByText('exa')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText(/no secret/i)).toBeInTheDocument();
  });
});
