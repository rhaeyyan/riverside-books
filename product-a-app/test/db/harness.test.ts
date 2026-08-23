import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, resetDb, withClient } from './harness';

// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 2a — Postgres test harness oracle.
//
// This file talks to a REAL Postgres (the Supabase CLI local stack, db port
// 54322 per product-a-app/supabase/config.toml). It is the shared oracle
// substrate for Task 2 (constraints), Task 4 (cross-account RLS isolation, a
// hard Phase 1 exit condition), and Phase 3 Tasks 10/11 (reservation
// concurrency, expiry idempotency).
//
// There is deliberately NO `describe.skipIf(!process.env.DATABASE_URL)` and no
// `it.skipIf(...)` anywhere in this file, and none must ever be added. A
// database test that skips itself when the database is missing is not an
// oracle — it is an oracle that silently evaporates in exactly the environment
// (CI) it exists to protect. If the stack is not up, these tests MUST fail and
// take the `ci-product-a` job red with them.
// ---------------------------------------------------------------------------

/**
 * The real migrations directory, resolved the same way the harness resolves it
 * — `test/db/` up two levels to `product-a-app/`.
 */
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

// The eight `books` columns fixed by docs/schema.md. Not a restatement of the
// migration — the migration is checked against this list, not the reverse.
const BOOKS_COLUMNS = [
  'author',
  'created_at',
  'format',
  'id',
  'isbn13',
  'price_cents',
  'published_on',
  'title',
] as const;

// Column types that cross a product boundary, per docs/schema.md "Types and
// conventions": uuid primary keys, `price_cents` as an integer of US cents
// (never a float, never a preformatted string), timestamps as timestamptz,
// `isbn13` as text (never an integer — a leading digit is never dropped).
const BOOKS_COLUMN_TYPES: Record<string, string> = {
  id: 'uuid',
  isbn13: 'text',
  title: 'text',
  author: 'text',
  format: 'text',
  price_cents: 'integer',
  published_on: 'date',
  created_at: 'timestamp with time zone',
};

const FIXTURE_BOOK = {
  isbn13: '9780000000017',
  title: 'Harness Fixture Title',
  author: 'Fixture Author',
  format: 'paperback',
  price_cents: 1899,
};

async function insertFixtureBook(): Promise<void> {
  await withClient(async (c) => {
    await c.query(
      `insert into public.books (isbn13, title, author, format, price_cents)
       values ($1, $2, $3, $4, $5)`,
      [
        FIXTURE_BOOK.isbn13,
        FIXTURE_BOOK.title,
        FIXTURE_BOOK.author,
        FIXTURE_BOOK.format,
        FIXTURE_BOOK.price_cents,
      ],
    );
  });
}

async function countBooks(): Promise<number> {
  return withClient(async (c) => {
    // `count(*)` is int8, which pg returns as a string — cast so the
    // assertion compares a number to a number.
    const { rows } = await c.query('select count(*)::int as n from public.books');
    return rows[0].n as number;
  });
}

beforeAll(async () => {
  await applyMigrations();
}, 120_000);

describe('db harness — connectivity', () => {
  it('opens a live connection and round-trips a trivial query', async () => {
    const value = await withClient(async (c) => {
      const { rows } = await c.query('select 1 as one');
      return rows[0].one as number;
    });

    expect(value).toBe(1);
  });

  it('is connected to a real Postgres, not an in-memory stand-in', async () => {
    const version = await withClient(async (c) => {
      const { rows } = await c.query('select version() as v');
      return rows[0].v as string;
    });

    expect(version).toMatch(/PostgreSQL/i);
  });
});

describe('db harness — migrations', () => {
  it('creates public.books with exactly the eight columns in docs/schema.md', async () => {
    const columns = await withClient(async (c) => {
      const { rows } = await c.query(
        `select column_name
           from information_schema.columns
          where table_schema = 'public' and table_name = 'books'
          order by column_name`,
      );
      return rows.map((r: { column_name: string }) => r.column_name);
    });

    expect(columns).toEqual([...BOOKS_COLUMNS]);
  });

  it('gives those columns the types docs/schema.md fixes across products', async () => {
    const types = await withClient(async (c) => {
      const { rows } = await c.query(
        `select column_name, data_type
           from information_schema.columns
          where table_schema = 'public' and table_name = 'books'`,
      );
      return Object.fromEntries(
        rows.map((r: { column_name: string; data_type: string }) => [
          r.column_name,
          r.data_type,
        ]),
      ) as Record<string, string>;
    });

    expect(types).toEqual(BOOKS_COLUMN_TYPES);
  });

  it('applies every file in supabase/migrations, not just the first', async () => {
    // The applied set must track the migrations DIRECTORY, not a hardcoded
    // file. The expectation is read off the filesystem here rather than
    // imported from the harness on purpose: importing the harness's own file
    // list would make this test blind to the harness filtering or sorting that
    // list wrongly, which is half the failure mode it exists to catch.
    const expected = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.basename(f, '.sql').split('_')[0])
      .sort();

    // More than one file has to be there for this assertion to mean anything;
    // with a single migration it degrades into the tautology it replaced.
    expect(expected.length).toBeGreaterThan(1);

    const ledger = await withClient(async (c) => {
      const { rows } = await c.query(
        `select version
           from supabase_migrations.schema_migrations
          order by version`,
      );
      return rows.map((r: { version: string }) => r.version);
    });

    expect(ledger).toEqual(expected);

    // The ledger row and the SQL land in one transaction, so a version present
    // above means that file's statements ran. Spot-checking a table from a
    // migration OTHER than the first is what makes "not just the first"
    // observable rather than inferred.
    const later = await withClient(async (c) => {
      const { rows } = await c.query('select to_regclass($1) as t', [
        'public.inventory',
      ]);
      return rows[0].t as string | null;
    });

    expect(later).toBe('inventory');
  });

  it('is safe to call applyMigrations() more than once in a run', async () => {
    // Edge case from the SPIKE: a second call must not blow up on
    // "relation already exists", and must leave the schema intact.
    await expect(applyMigrations()).resolves.not.toThrow();

    const stillThere = await withClient(async (c) => {
      const { rows } = await c.query('select to_regclass($1) as t', ['public.books']);
      return rows[0].t as string | null;
    });

    expect(stillThere).toBe('books');
  }, 120_000);
});

describe('db harness — Supabase auth schema', () => {
  it('has auth.users, which Tasks 3/4 need and a bare postgres image would not provide', async () => {
    const table = await withClient(async (c) => {
      const { rows } = await c.query('select to_regclass($1) as t', ['auth.users']);
      return rows[0].t as string | null;
    });

    expect(table).not.toBeNull();
  });

  it('exposes auth.uid(), the function every RLS policy in Phase 1 is written against', async () => {
    const fnExists = await withClient(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'auth' and p.proname = 'uid'`,
      );
      return rows[0].n as number;
    });

    expect(fnExists).toBeGreaterThan(0);
  });
});

describe('db harness — resetDb isolation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('starts from an empty books table', async () => {
    await expect(countBooks()).resolves.toBe(0);
  });

  it('removes rows written during the same test', async () => {
    await insertFixtureBook();
    await expect(countBooks()).resolves.toBe(1);

    await resetDb();

    await expect(countBooks()).resolves.toBe(0);
  });

  it('leaves a row behind for the next test to prove it is cleaned up', async () => {
    await insertFixtureBook();
    await expect(countBooks()).resolves.toBe(1);
  });

  it('sees none of the previous test rows (resetDb left nothing behind)', async () => {
    // Paired with the test above, in declaration order. If resetDb() is a
    // no-op or misses a table, this is where it shows up.
    await expect(countBooks()).resolves.toBe(0);
  });

  it('keeps the schema after a reset — resetDb truncates data, it does not drop tables', async () => {
    const table = await withClient(async (c) => {
      const { rows } = await c.query('select to_regclass($1) as t', ['public.books']);
      return rows[0].t as string | null;
    });

    expect(table).toBe('books');
  });
});

describe('db harness — connection hygiene', () => {
  it('releases a connection whose callback left a transaction open', async () => {
    // Edge case from the SPIKE: a test that leaves `begin` uncommitted must not
    // hold locks that deadlock the next test. withClient owns the lifecycle.
    await withClient(async (c) => {
      await c.query('begin');
      await c.query(
        `insert into public.books (isbn13, title, author, format, price_cents)
         values ($1, $2, $3, $4, $5)`,
        ['9780000000024', 'Uncommitted', 'Ghost Author', 'hardcover', 2500],
      );
      // Deliberately no commit and no rollback.
    });

    // If the connection above leaked, resetDb()'s truncate blocks on its locks
    // and this test times out rather than hanging the whole run.
    await resetDb();
    await expect(countBooks()).resolves.toBe(0);
  }, 20_000);

  it('releases a connection whose callback threw', async () => {
    await expect(
      withClient(async (c) => {
        await c.query('begin');
        await c.query(
          `insert into public.books (isbn13, title, author, format, price_cents)
           values ($1, $2, $3, $4, $5)`,
          ['9780000000031', 'Thrown Away', 'Ghost Author', 'hardcover', 2500],
        );
        throw new Error('callback exploded');
      }),
    ).rejects.toThrow('callback exploded');

    await resetDb();
    await expect(countBooks()).resolves.toBe(0);

    // And the pool still works after the throw.
    await expect(
      withClient(async (c) => {
        const { rows } = await c.query('select 1 as one');
        return rows[0].one as number;
      }),
    ).resolves.toBe(1);
  }, 20_000);

  it('supports two concurrent clients, which the Task 10 reservation race needs', async () => {
    const [a, b] = await Promise.all([
      withClient(async (c) => {
        const { rows } = await c.query('select pg_backend_pid() as pid');
        return rows[0].pid as number;
      }),
      withClient(async (c) => {
        const { rows } = await c.query('select pg_backend_pid() as pid');
        return rows[0].pid as number;
      }),
    ]);

    expect(typeof a).toBe('number');
    expect(typeof b).toBe('number');
  }, 20_000);
});
