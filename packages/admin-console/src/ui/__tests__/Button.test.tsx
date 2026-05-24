import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button.js';

describe('Button', () => {
  it('renders primary variant by default with the brand purple', () => {
    render(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.className).toContain('bg-primary');
  });

  it('disabled state has correct attrs', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });
});
