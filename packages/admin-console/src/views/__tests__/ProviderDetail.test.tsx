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
  afterEach(() => vi.clearAllMocks());
  it('toggles enabled and calls updateProvider', async () => {
    const update = vi.fn().mockResolvedValue({ ...row, enabled: true });
    render(<ProviderDetail initial={row} api={{ ...stubApi, updateProvider: update }} />);
    fireEvent.click(screen.getByLabelText(/enabled/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('exa', expect.objectContaining({ enabled: true })));
  });

  it('reveals secret only after confirmation', async () => {
    const reveal = vi.fn().mockResolvedValue({ providerId: 'exa', value: 'sk_real' });
    render(<ProviderDetail initial={row} api={{ ...stubApi, revealSecret: reveal }} />);
    const revealButtons = screen.getAllByRole('button', { name: /reveal/i });
    fireEvent.click(revealButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });
  });

  it('test button shows result', async () => {
    const test = vi.fn().mockResolvedValue({ ok: true, results: 3 });
    render(<ProviderDetail initial={row} api={{ ...stubApi, testProvider: test }} />);
    const buttons = screen.getAllByRole('button', { name: 'Test' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByText(/3 results/i)).toBeInTheDocument());
  });
});
