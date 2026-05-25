import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../Dashboard.js';

const providers = [
  { providerId: 'exa', enabled: true, hasSecret: true },
  { providerId: 'tavily', enabled: true, hasSecret: false }
];

describe('Dashboard', () => {
  it('renders one tile per provider with p95 latency', () => {
    render(
      <Dashboard
        providers={providers}
        metrics={[
          { providerId: 'exa', p95LatencyMs: 310, errorRate: 0.012 },
          { providerId: 'tavily', p95LatencyMs: 180 }
        ]}
      />
    );
    expect(screen.getByText('exa')).toBeInTheDocument();
    expect(screen.getByText('tavily')).toBeInTheDocument();
    expect(screen.getByText(/310 ms/)).toBeInTheDocument();
  });

  it('shows missing-secret count in stat row', () => {
    render(
      <Dashboard
        providers={providers}
        metrics={[{ providerId: 'exa' }, { providerId: 'tavily' }]}
      />
    );
    expect(screen.getByText('1 missing')).toBeInTheDocument();
  });
});
