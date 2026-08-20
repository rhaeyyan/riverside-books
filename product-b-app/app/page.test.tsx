import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders the staff dashboard heading and stock stat', () => {
    render(<Home />);

    expect(screen.getByText('Staff Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Total books in stock')).toBeInTheDocument();
  });
});
