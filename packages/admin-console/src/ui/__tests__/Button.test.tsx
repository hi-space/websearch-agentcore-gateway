import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button.js';

describe('Button', () => {
  it('primary variant uses brand purple background and rounded-md (DESIGN.md rule)', () => {
    render(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.className).toContain('bg-primary');
    expect(b.className).toContain('rounded-md');
  });

  it('disabled state has correct attrs', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('renders dark variant', () => {
    render(<Button variant="dark">Run</Button>);
    expect(screen.getByRole('button', { name: 'Run' }).className).toContain('bg-inkDeep');
  });
});
