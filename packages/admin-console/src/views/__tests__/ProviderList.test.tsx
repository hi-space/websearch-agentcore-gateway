import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProviderList } from '../ProviderList.js';

const rows = [
  { providerId: 'exa', enabled: true, hasSecret: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 },
  { providerId: 'you', enabled: false, hasSecret: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
];

describe('ProviderList', () => {
  it('shows enabled badge and "no secret" warning', () => {
    render(<ProviderList rows={rows} />);
    const table = screen.getByRole('table');
    const inTable = within(table);
    expect(inTable.getByText('exa')).toBeInTheDocument();
    expect(inTable.getByText('Enabled')).toBeInTheDocument();
    expect(inTable.getByText('Disabled')).toBeInTheDocument();
    expect(inTable.getByText(/no secret/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    render(<ProviderList rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText(/search providers/i), { target: { value: 'exa' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('exa')).toBeInTheDocument();
    expect(within(table).queryByText('you')).not.toBeInTheDocument();
  });

  it('filters to disabled via pill tab', () => {
    render(<ProviderList rows={rows} />);
    const tablist = screen.getByRole('tablist', { name: /Filter providers/i });
    fireEvent.click(within(tablist).getByRole('tab', { name: /Disabled/ }));
    const table = screen.getByRole('table');
    expect(within(table).queryByText('exa')).not.toBeInTheDocument();
    expect(within(table).getByText('you')).toBeInTheDocument();
  });

  it('renders the four verification badges based on lastVerify', () => {
    const isoNow = new Date().toISOString();
    const isoStale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <ProviderList
        rows={[
          { providerId: 'a', enabled: true, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoNow, ok: true } },
          { providerId: 'b', enabled: true, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoStale, ok: true } },
          { providerId: 'c', enabled: false, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoNow, ok: false, code: 'UPSTREAM_ERROR', error: '401' } },
          { providerId: 'd', enabled: false, hasSecret: false, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 }
        ]}
      />
    );
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Verification stale')).toBeInTheDocument();
    expect(screen.getByText('Verification failed')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });
});
