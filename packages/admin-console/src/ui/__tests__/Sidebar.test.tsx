import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar.js';

describe('Sidebar', () => {
  it('renders the primary nav items', () => {
    render(<Sidebar active="providers" />);
    for (const label of ['Providers', 'Dashboard', 'Playground', 'Audit log', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active item with aria-current', () => {
    render(<Sidebar active="dashboard" />);
    const dashboardLink = screen.getAllByRole('link', { name: 'Dashboard' }).find((el) => el.getAttribute('aria-current') === 'page');
    expect(dashboardLink!).toHaveAttribute('aria-current', 'page');
  });
});
