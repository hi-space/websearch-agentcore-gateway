import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderDetail } from '../ProviderDetail.js';
import { ApiError } from '../../lib/api.js';

const row = { providerId: 'exa', enabled: false, hasSecret: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 };

const stubApi = {
  updateProvider: vi.fn(),
  putSecret: vi.fn(),
  revealSecret: vi.fn(),
  testProvider: vi.fn()
} as const;

function makeApi() {
  return {
    updateProvider: vi.fn().mockResolvedValue({ providerId: 'exa', enabled: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 }),
    putSecret: vi.fn().mockResolvedValue({ providerId: 'exa', versionId: 'v1' }),
    revealSecret: vi.fn().mockResolvedValue({ providerId: 'exa', value: 'sk' }),
    testProvider: vi.fn().mockResolvedValue({ ok: true, results: 1, lastVerify: { at: new Date().toISOString(), ok: true } })
  };
}

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

  it('reverts the Enabled toggle on VERIFICATION_FAILED', async () => {
    const api = makeApi();
    api.updateProvider = vi.fn().mockRejectedValue(
      Object.assign(new ApiError(400, 'VERIFICATION_FAILED'), {
        lastVerify: { at: new Date().toISOString(), ok: false, code: 'UPSTREAM_ERROR', error: '401' }
      })
    );
    const initial = {
      providerId: 'exa',
      enabled: false,
      hasSecret: true,
      quota: { rpm: 10, daily: 100 },
      timeoutMs: 8000
    };
    render(<ProviderDetail initial={initial} api={api} />);
    fireEvent.click(screen.getByRole('tab', { name: /Configuration/i }));
    const checkbox = screen.getByLabelText(/Enabled/i) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    await waitFor(() => expect(checkbox.checked).toBe(false));
    expect(api.updateProvider).toHaveBeenCalled();
  });

  it('surfaces the disabled-after-secret helper after Store new version', async () => {
    const api = makeApi();
    api.putSecret = vi.fn().mockResolvedValue({ providerId: 'exa', versionId: 'v2' });
    const initial = {
      providerId: 'exa',
      enabled: true,
      hasSecret: true,
      quota: { rpm: 10, daily: 100 },
      timeoutMs: 8000,
      lastVerify: { at: new Date().toISOString(), ok: true }
    };
    render(<ProviderDetail initial={initial} api={api} />);
    fireEvent.click(screen.getByRole('tab', { name: /Secret/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter new secret value/i), {
      target: { value: 'sk_new_key_123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Store new version/i }));
    await screen.findByText(/Verification reset and provider disabled/i);
  });
});
