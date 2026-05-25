import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderDetail } from '../ProviderDetail.js';

const row = { providerId: 'exa', enabled: false, hasSecret: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 };

const stubApi = {
  updateProvider: vi.fn(),
  putSecret: vi.fn(),
  revealSecret: vi.fn(),
  testProvider: vi.fn()
} as const;

describe('ProviderDetail', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('toggles enabled and calls updateProvider', async () => {
    const update = vi.fn().mockResolvedValue({ ...row, enabled: true });
    render(<ProviderDetail initial={row} api={{ ...stubApi, updateProvider: update }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    fireEvent.click(screen.getByLabelText(/enabled/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('exa', expect.objectContaining({ enabled: true })));
  });

  it('reveals secret only after MFA modal confirmation', async () => {
    const reveal = vi.fn().mockResolvedValue({ providerId: 'exa', value: 'sk_real' });
    render(<ProviderDetail initial={row} api={{ ...stubApi, revealSecret: reveal }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Secret' }));
    fireEvent.click(screen.getByRole('button', { name: /reveal current secret/i }));
    expect(screen.getByRole('dialog', { name: /reveal api credential/i })).toBeInTheDocument();
    expect(reveal).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/rotating shared API key/i), {
      target: { value: 'incident-482' }
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm reveal/i }));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith('exa'));
  });

  it('connectivity test pushes a result row', async () => {
    const test = vi.fn().mockResolvedValue({ ok: true, results: 3 });
    render(<ProviderDetail initial={row} api={{ ...stubApi, testProvider: test }} />);
    fireEvent.click(screen.getByRole('button', { name: /run connectivity test/i }));
    await waitFor(() => expect(test).toHaveBeenCalledWith('exa'));
  });
});
