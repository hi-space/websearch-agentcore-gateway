import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../Dashboard.js';

describe('Dashboard', () => {
  it('renders one card per provider with p95 + error rate', () => {
    render(
      <Dashboard
        metrics={[
          { providerId: 'exa', p95LatencyMs: 310, errorRate: 0.012 },
          { providerId: 'tavily', p95LatencyMs: 180 }
        ]}
      />
    );
    expect(screen.getByText('exa')).toBeInTheDocument();
    expect(screen.getByText(/310/)).toBeInTheDocument();
    expect(screen.getByText('tavily')).toBeInTheDocument();
    expect(screen.getByText(/no error rate yet/i)).toBeInTheDocument();
  });
});
