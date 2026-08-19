import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders the support bot headline and quick prompts', () => {
    render(<Home />);

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
    expect(screen.getByText('Ask Riverside')).toBeInTheDocument();
    expect(screen.getByText(/Do you have The Left Hand of Darkness in stock\?/i)).toBeInTheDocument();
  });
});
