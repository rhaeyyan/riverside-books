import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBooksRepository,
  type Book,
} from '../lib/books-repository';

// ---------------------------------------------------------------------------
// Fake Supabase client — implements only the `.from().select().limit()
// .maybeSingle()` chain shape the repository is expected to call. No live
// network/Postgres/Supabase call is ever made from this file.
// ---------------------------------------------------------------------------

interface FakeQueryResult {
  data: unknown;
  error: { message: string } | null;
}

function createFakeSupabaseClient(result: FakeQueryResult) {
  const calls: { from?: string; select?: string; limit?: number } = {};

  const maybeSingle = vi.fn(() => Promise.resolve(result));
  const limit = vi.fn((n: number) => {
    calls.limit = n;
    return { maybeSingle };
  });
  const select = vi.fn((columns: string) => {
    calls.select = columns;
    return { limit };
  });
  const from = vi.fn((table: string) => {
    calls.from = table;
    return { select };
  });

  return { client: { from }, calls };
}

const sampleRow = {
  id: '11111111-1111-1111-1111-111111111111',
  isbn13: '9780000000001',
  title: 'The Riverside Reader',
  author: 'Jane Novelist',
  format: 'paperback',
  price_cents: 1999,
  published_on: '2024-01-15',
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('books-repository (unit, fake Supabase client)', () => {
  it('queries the books table and maps a returned row to the Book type', async () => {
    const { client, calls } = createFakeSupabaseClient({
      data: sampleRow,
      error: null,
    });

    const repo = createBooksRepository(
      client as unknown as Parameters<typeof createBooksRepository>[0],
    );
    const result = await repo.getFeaturedBook();

    expect(calls.from).toBe('books');
    expect(result).not.toBeNull();
    expect(result).toEqual<Book>(sampleRow);
    expect(typeof result?.price_cents).toBe('number');
  });

  it('returns null (not a throw) when the table has zero rows', async () => {
    const { client, calls } = createFakeSupabaseClient({
      data: null,
      error: null,
    });

    const repo = createBooksRepository(
      client as unknown as Parameters<typeof createBooksRepository>[0],
    );
    const result = await repo.getFeaturedBook();

    expect(calls.from).toBe('books');
    expect(result).toBeNull();
  });

  it('returns null (not a throw) when the client reports an error', async () => {
    const { client } = createFakeSupabaseClient({
      data: null,
      error: { message: 'RLS denied' },
    });

    const repo = createBooksRepository(
      client as unknown as Parameters<typeof createBooksRepository>[0],
    );

    await expect(repo.getFeaturedBook()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Home render tests — the repository dependency is substituted for a fake
// via vi.doMock (module-scoped, not hoisted, so it doesn't interfere with
// the real-module unit tests above). No live Supabase call is exercised
// through this path either.
// ---------------------------------------------------------------------------

async function renderHomeWith(
  getFeaturedBook: () => Promise<Book | null>,
) {
  vi.resetModules();
  vi.doMock('../lib/books-repository', () => ({
    createSupabaseClient: vi.fn(() => ({})),
    createBooksRepository: vi.fn(() => ({ getFeaturedBook })),
  }));

  const { default: Home } = await import('./page');
  return Home();
}

describe('Home', () => {
  afterEach(() => {
    vi.doUnmock('../lib/books-repository');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders the fetched featured book title and drops the placeholder copy', async () => {
    const ui = await renderHomeWith(async () => sampleRow as Book);
    render(ui);

    expect(screen.getByText('Riverside Books')).toBeInTheDocument();
    const section = screen.getByLabelText('Featured title');
    expect(section).toHaveTextContent(sampleRow.title);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not wired to supabase yet/i),
    ).not.toBeInTheDocument();
  });

  it('renders an honest empty state when the table has zero rows', async () => {
    const ui = await renderHomeWith(async () => null);
    render(ui);

    const section = screen.getByLabelText('Featured title');
    expect(section).toHaveTextContent(/no featured title/i);
    expect(
      screen.queryByText(/not wired to supabase yet/i),
    ).not.toBeInTheDocument();
  });

  it('renders an honest empty state instead of crashing when the repository throws', async () => {
    const ui = await renderHomeWith(async () => {
      throw new Error('missing SUPABASE_URL');
    });
    render(ui);

    const section = screen.getByLabelText('Featured title');
    expect(section.textContent).not.toMatch(/missing SUPABASE_URL/);
    expect(section).toHaveTextContent(/no featured title|unable to load/i);
  });
});
