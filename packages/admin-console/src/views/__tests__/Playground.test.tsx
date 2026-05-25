import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Playground } from '../Playground';

describe('Playground', () => {
  it('runs unified search and renders merged results with provider attribution', async () => {
    const search = vi.fn().mockResolvedValue({
      query: 'rag eval',
      results: [
        { title: 'Paper A', url: 'https://a', snippet: 'snippet a', score: 0.123, source: 'arxiv' },
        { title: 'Paper B', url: 'https://b', snippet: 'snippet b' }
      ],
      providersUsed: ['arxiv', 'exa'],
      errors: [],
      latencyMs: 142
    });
    render(<Playground api={{ search }} />);

    fireEvent.change(screen.getByTestId('playground-query'), { target: { value: 'rag eval' } });
    fireEvent.click(screen.getByTestId('playground-submit'));

    await waitFor(() => expect(search).toHaveBeenCalledWith('rag eval', 10));

    expect(await screen.findByTestId('playground-results')).toBeInTheDocument();
    expect(screen.getByText('Paper A')).toBeInTheDocument();
    expect(screen.getByText('Paper B')).toBeInTheDocument();
    expect(screen.getByTestId('playground-providers')).toHaveTextContent('arxiv');
    expect(screen.getByTestId('playground-providers')).toHaveTextContent('exa');
    expect(screen.getByTestId('playground-latency')).toHaveTextContent('142 ms');
  });

  it('shows error message when search rejects', async () => {
    const search = vi.fn().mockRejectedValue(new Error('UPSTREAM_ERROR'));
    render(<Playground api={{ search }} />);

    fireEvent.change(screen.getByTestId('playground-query'), { target: { value: 'q' } });
    fireEvent.click(screen.getByTestId('playground-submit'));

    expect(await screen.findByTestId('playground-error')).toHaveTextContent('UPSTREAM_ERROR');
  });

  it('renders provider errors as badges alongside successful providers', async () => {
    const search = vi.fn().mockResolvedValue({
      query: 'q',
      results: [{ title: 'R', url: 'https://r' }],
      providersUsed: ['arxiv'],
      errors: [{ provider: 'perplexity', message: 'TIMEOUT' }],
      latencyMs: 87
    });
    render(<Playground api={{ search }} />);

    fireEvent.change(screen.getByTestId('playground-query'), { target: { value: 'q' } });
    fireEvent.click(screen.getByTestId('playground-submit'));

    const providers = await screen.findByTestId('playground-providers');
    expect(providers).toHaveTextContent('arxiv');
    expect(providers).toHaveTextContent('perplexity');
    expect(providers).toHaveTextContent('TIMEOUT');
  });
});
