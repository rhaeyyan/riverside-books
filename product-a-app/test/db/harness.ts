import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 2a — Postgres test harness.
//
// Talks to the REAL database of the Supabase CLI local stack (`supabase db
// start`), not a stand-in. Constraints, RLS policies, and transaction races
// are the things this product gets wrong in ways a customer notices, and none
// of them are observable against a fake: they are enforced by Postgres or not
// at all. This module is the shared substrate for Task 2 (constraints), Task 4
// (cross-account RLS isolation, a hard Phase 1 exit condition) and Phase 3
// Tasks 10/11 (reservation concurrency, expiry idempotency).
//
// There is deliberately no skip path in here. If the database is unreachable,
// every call throws and the suite goes red. A database test that quietly skips
// itself when the database is missing evaporates in exactly the environment
// (CI) it exists to protect.
// ---------------------------------------------------------------------------

/**
 * The database port of the Supabase CLI local stack, per
 * `product-a-app/supabase/config.toml` — `[db] port = 54322`. Note this is the
 * database, not the API gateway on 54321 and not the shadow database on 54320.
 */
const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

/**
 * Advisory lock key guarding `applyMigrations`, so two test files whose
 * `beforeAll` both call it cannot race to apply the same file twice.
 */
const MIGRATION_LOCK_KEY = 4_119_260_821;

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function unreachable(cause: unknown): Error {
  return new Error(
    `Cannot reach Postgres at ${databaseUrl()}. Start the Supabase local ` +
      'stack first (`supabase db start` from product-a-app/), or set ' +
      'DATABASE_URL. These tests fail rather than skip when the database is ' +
      `missing. Underlying error: ${(cause as Error)?.message ?? String(cause)}`,
    { cause },
  );
}

/**
 * Runs `fn` against a freshly connected `pg` client and always closes that
 * client afterwards — including when `fn` throws, and including when `fn`
 * leaves a transaction open. Closing the connection is what aborts a dangling
 * transaction, so a sloppy test cannot hold locks that deadlock the next one.
 *
 * One connection per call rather than a shared pool: `Client` is the type the
 * callback is handed, concurrent calls get genuinely separate backends (which
 * the Task 10 reservation race needs), and there is no pooled client whose
 * leftover session state leaks into an unrelated test.
 */
export async function withClient<T>(
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });

  try {
    await client.connect();
  } catch (cause) {
    throw unreachable(cause);
  }

  try {
    return await fn(client);
  } finally {
    // Never let a teardown failure mask the callback's own error.
    await client.end().catch(() => {});
  }
}

async function migrationFiles(): Promise<string[]> {
  let entries: string[];

  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch (cause) {
    throw new Error(
      `No migrations directory at ${MIGRATIONS_DIR}. The harness applies the ` +
        'real migration files; it does not carry its own copy of the schema.',
      { cause },
    );
  }

  // Filename order is migration order — the Supabase CLI's convention, and the
  // reason every file is timestamp-prefixed.
  const files = entries.filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    throw new Error(`No .sql migration files found in ${MIGRATIONS_DIR}.`);
  }

  return files;
}

/**
 * The version string the Supabase CLI records for a migration: the timestamp
 * prefix of the filename. Deriving it the same way the CLI does is what lets a
 * database provisioned by `supabase db start` and one provisioned by this
 * harness agree on what has already been applied.
 */
function versionOf(file: string): string {
  return path.basename(file, '.sql').split('_')[0];
}

/**
 * Applies every file in `supabase/migrations` that has not been applied yet,
 * in filename order, recording each in `supabase_migrations.schema_migrations`
 * — the same ledger the Supabase CLI writes. That ledger is what makes this
 * safe to call more than once per run, and what makes it a no-op when the CLI
 * already applied the migrations at `supabase db start` time.
 *
 * The harness never patches or rewrites a migration on the way in. If a
 * migration is wrong, it is wrong in CI and in production too, and that is a
 * finding rather than something to paper over here.
 */
export async function applyMigrations(): Promise<void> {
  const files = await migrationFiles();

  await withClient(async (c) => {
    await c.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    try {
      await c.query('create schema if not exists supabase_migrations');
      await c.query(
        `create table if not exists supabase_migrations.schema_migrations (
           version text primary key
         )`,
      );

      const { rows } = await c.query<{ version: string }>(
        'select version from supabase_migrations.schema_migrations',
      );
      const applied = new Set(rows.map((r) => r.version));

      for (const file of files) {
        const version = versionOf(file);

        if (applied.has(version)) {
          continue;
        }

        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

        // One transaction per file, matching how the CLI applies them: a
        // migration that fails halfway leaves no half-built schema behind and
        // no ledger row claiming it succeeded.
        await c.query('begin');

        try {
          await c.query(sql);
          await c.query(
            `insert into supabase_migrations.schema_migrations (version)
             values ($1)
             on conflict (version) do nothing`,
            [version],
          );
          await c.query('commit');
        } catch (cause) {
          await c.query('rollback').catch(() => {});
          throw new Error(`Migration ${file} failed to apply.`, { cause });
        }
      }
    } finally {
      await c.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  });
}

/**
 * Empties every base table in `public`, leaving the schema itself intact —
 * truncate, never drop. Tests get a clean slate without paying to rebuild the
 * database, and the constraints/policies under test survive the reset (a reset
 * that dropped them would quietly disarm the tests that matter most).
 *
 * The table list is read from the catalog rather than hardcoded, so a table
 * added by a later migration is cleaned up without anyone remembering to come
 * back here. `restart identity cascade` clears dependent rows and sequences in
 * one statement.
 */
export async function resetDb(): Promise<void> {
  await withClient(async (c) => {
    const { rows } = await c.query<{ qualified: string }>(
      `select format('%I.%I', schemaname, tablename) as qualified
         from pg_tables
        where schemaname = 'public'
        order by tablename`,
    );

    if (rows.length === 0) {
      return;
    }

    await c.query(
      `truncate table ${rows.map((r) => r.qualified).join(', ')}
       restart identity cascade`,
    );
  });
}
