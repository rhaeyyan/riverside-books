import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders the catalog heading and featured title placeholder', () => {
    render(<Home />);

    expect(screen.getByText('Riverside Books')).toBeInTheDocument();
    expect(screen.getByText('Featured title')).toBeInTheDocument();
  });
});
