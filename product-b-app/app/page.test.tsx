import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInventoryRepository } from '../lib/inventory-repository';

// ---------------------------------------------------------------------------
// Fake Supabase client — implements only the `.from().select()` chain shape
// the repository is expected to call (a full-table sum needs no `.limit()`/
// `.maybeSingle()`, unlike product-a's single-row lookup). No live
// network/Postgres/Supabase call is ever made from this file.
// ---------------------------------------------------------------------------

interface FakeQueryResult {
  data: unknown;
  error: { message: string } | null;
}

function createFakeSupabaseClient(result: FakeQueryResult) {
  const calls: { from?: string; select?: string } = {};

  const select = vi.fn((columns: string) => {
    calls.select = columns;
    return Promise.resolve(result);
  });
  const from = vi.fn((table: string) => {
    calls.from = table;
    return { select };
  });

  return { client: { from }, calls };
}

describe('inventory-repository (unit, fake Supabase client)', () => {
  it('sums the on_hand column across all returned rows', async () => {
    const { client, calls } = createFakeSupabaseClient({
      data: [{ on_hand: 5 }, { on_hand: 12 }, { on_hand: 0 }],
      error: null,
    });

    const repo = createInventoryRepository(
      client as unknown as Parameters<typeof createInventoryRepository>[0],
    );
    const result = await repo.getTotalOnHand();

    expect(calls.from).toBe('inventory');
    expect(calls.select).toContain('on_hand');
    expect(result).toBe(17);
  });

  it('returns 0 (a real number, not null) when the table has zero rows — an empty inventory is a valid business state, distinct from "unable to load"', async () => {
    const { client, calls } = createFakeSupabaseClient({
      data: [],
      error: null,
    });

    const repo = createInventoryRepository(
      client as unknown as Parameters<typeof createInventoryRepository>[0],
    );
    const result = await repo.getTotalOnHand();

    expect(calls.from).toBe('inventory');
    expect(result).toBe(0);
    expect(result).not.toBeNull();
  });

  it('returns null (not a throw) when the client reports an error', async () => {
    const { client } = createFakeSupabaseClient({
      data: null,
      error: { message: 'RLS denied' },
    });

    const repo = createInventoryRepository(
      client as unknown as Parameters<typeof createInventoryRepository>[0],
    );

    await expect(repo.getTotalOnHand()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Home render tests — the repository dependency is substituted for a fake
// via vi.doMock (module-scoped, not hoisted, so it doesn't interfere with
// the real-module unit tests above). No live Supabase call is exercised
// through this path either.
// ---------------------------------------------------------------------------

async function renderHomeWith(getTotalOnHand: () => Promise<number | null>) {
  vi.resetModules();
  vi.doMock('../lib/inventory-repository', () => ({
    createSupabaseClient: vi.fn(() => ({})),
    createInventoryRepository: vi.fn(() => ({ getTotalOnHand })),
  }));

  const { default: Home } = await import('./page');
  return Home();
}

describe('Home', () => {
  afterEach(() => {
    vi.doUnmock('../lib/inventory-repository');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders the fetched stock total and drops the placeholder copy', async () => {
    const ui = await renderHomeWith(async () => 42);
    render(ui);

    expect(screen.getByText('Staff Dashboard')).toBeInTheDocument();
    const section = screen.getByLabelText('Total books in stock');
    expect(section).toHaveTextContent('42');
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not wired to supabase yet/i),
    ).not.toBeInTheDocument();
  });

  it('renders 0 as a real number, not the "unable to load" fallback, when the table is genuinely empty', async () => {
    const ui = await renderHomeWith(async () => 0);
    render(ui);

    const section = screen.getByLabelText('Total books in stock');
    expect(section).toHaveTextContent('0');
    expect(
      section.textContent,
    ).not.toMatch(/no stock total available|unable to load/i);
    expect(
      screen.queryByText(/not wired to supabase yet/i),
    ).not.toBeInTheDocument();
  });

  it('renders an honest fallback (not "0") when the repository resolves to null — e.g. a Supabase query error', async () => {
    const ui = await renderHomeWith(async () => null);
    render(ui);

    const section = screen.getByLabelText('Total books in stock');
    expect(section).toHaveTextContent(/no stock total available|unable to load/i);
    expect(
      screen.queryByText(/not wired to supabase yet/i),
    ).not.toBeInTheDocument();
  });

  it('renders an honest empty state instead of crashing when the repository throws', async () => {
    const ui = await renderHomeWith(async () => {
      throw new Error('missing SUPABASE_URL');
    });
    render(ui);

    const section = screen.getByLabelText('Total books in stock');
    expect(section.textContent).not.toMatch(/missing SUPABASE_URL/);
    expect(section).toHaveTextContent(/no stock total available|unable to load/i);
  });
});
