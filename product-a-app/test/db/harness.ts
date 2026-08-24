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
 * Resolves the `auth.users` truncate target, or null when this stack has no
 * auth schema at all (a bare postgres image, say).
 *
 * Throws rather than skipping when the table exists but this role cannot
 * truncate it: silently leaving auth rows behind is the exact condition this
 * function was added to remove, and Task 4's cross-account RLS isolation test —
 * a hard Phase 1 exit condition — has to start from genuinely empty auth state
 * rather than from whatever an earlier test file left. A loud error names the
 * missing grant; a skip would hand Task 4 a dirty database and call it clean.
 *
 * `has_table_privilege` is only reached when `to_regclass` found the table:
 * `case` short-circuits, and the function is `stable` rather than `immutable`,
 * so the planner does not constant-fold it into evaluation on a stack where
 * `auth.users` is absent.
 */
async function authUsersTarget(c: Client): Promise<string | null> {
  const { rows } = await c.query<{ truncatable: boolean | null }>(
    `select case
              when to_regclass('auth.users') is null then null
              else has_table_privilege('auth.users', 'truncate')
            end as truncatable`,
  );

  const truncatable = rows[0]?.truncatable ?? null;

  if (truncatable === null) {
    return null;
  }

  if (!truncatable) {
    throw new Error(
      'auth.users exists but the current role cannot truncate it, so ' +
        'resetDb() would leave auth rows behind — the state Task 4 must not ' +
        'inherit. Connect as the local stack\'s `postgres` role (the harness ' +
        'default), or grant truncate on auth.users to the role in ' +
        'DATABASE_URL. This is reported rather than skipped on purpose.',
    );
  }

  return 'auth.users';
}

/**
 * Empties every base table in `public` plus `auth.users`, leaving the schema
 * itself intact — truncate, never drop. Tests get a clean slate without paying
 * to rebuild the database, and the constraints/policies under test survive the
 * reset (a reset that dropped them would quietly disarm the tests that matter
 * most).
 *
 * The `public` table list is read from the catalog rather than hardcoded, so a
 * table added by a later migration is cleaned up without anyone remembering to
 * come back here. `cascade` clears dependent rows in one statement; see the
 * note at the truncate itself for why identity is deliberately not restarted.
 *
 * WHY `auth.users` IS IN THE LIST. `customers.id` and `staff.user_id` both
 * reference `auth.users(id)`, so no fixture can avoid the auth schema, and a
 * `public`-only truncate leaves those users behind for every later test to
 * inherit. Cleaning them here is what lets Task 4's cross-account isolation
 * test start from a known-empty auth state instead of from residue.
 *
 * WHY ONE STATEMENT, AND WHY `cascade`. `auth.users` goes into the same
 * `truncate` as the `public` tables so Postgres resolves the foreign-key
 * ordering itself and the whole reset is atomic. `cascade` is required, not
 * cosmetic: `truncate` does not run `on delete cascade` actions, so a table
 * referencing `auth.users` that was not named would abort the statement.
 * Cascade therefore also empties the auth schema's own dependents
 * (`auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`,
 * and anything else with a foreign key to `auth.users` on this stack) — which
 * is the intent: a user row without its identity row is not "empty auth state",
 * it is a different kind of residue. Naming a table twice is harmless;
 * `truncate` de-duplicates the list.
 *
 * Scope is unchanged in kind: this already emptied every `public` table, so it
 * was already a function to point only at a disposable local database. It now
 * empties local auth users too.
 */
export async function resetDb(): Promise<void> {
  await withClient(async (c) => {
    const { rows } = await c.query<{ qualified: string }>(
      `select format('%I.%I', schemaname, tablename) as qualified
         from pg_tables
        where schemaname = 'public'
        order by tablename`,
    );

    const targets = rows.map((r) => r.qualified);

    const authUsers = await authUsersTarget(c);

    if (authUsers !== null) {
      targets.push(authUsers);
    }

    if (targets.length === 0) {
      return;
    }

    // `cascade` but deliberately NOT `restart identity`: restarting identity
    // requires ownership of every sequence on every truncated table, and the
    // cascade reaches `auth.refresh_tokens`, whose `refresh_tokens_id_seq` is
    // owned by `supabase_auth_admin`, not `postgres` — which failed in CI with
    // `42501 must be owner of sequence refresh_tokens_id_seq`. Nothing needs
    // it: every table in `public` uses a uuid primary key, so there is no
    // sequence here whose value anything observes. Keeping it to one statement
    // keeps the reset atomic.
    await c.query(`truncate table ${targets.join(', ')} cascade`);
  });
}

// ---------------------------------------------------------------------------
// Product A, Phase 1, Tasks 3+4 — persona impersonation.
//
// Everything above this line runs as the local stack's `postgres` role, which
// is exempt from RLS by definition. That connection can therefore prove
// constraints (Task 2) but can prove NOTHING about policies: it never has a
// policy applied to it. The two helpers below are what let a test speak to
// Postgres as the roles a browser actually reaches it with — PostgREST's
// `anon` and `authenticated` — so an RLS assertion is a real observation
// rather than a restatement of the migration.
//
// HOW THIS MIRRORS SUPABASE. PostgREST verifies a JWT, stashes its claims in
// the `request.jwt.claims` GUC, and switches to the role named in the token.
// `auth.uid()` is a plain SQL function reading `sub` back out of that GUC —
// which is precisely why these two statements, in this order, reproduce a
// signed-in session without a running API gateway, a GoTrue token, or a
// network hop. Nothing is faked here except the token issuance: the role, the
// claims, the policies, and the planner are all the real ones.
//
// WHY SESSION SCOPE (`set_config(..., false)`) IS SAFE. `withClient` dedicates
// one connection per call and closes it in a `finally`, so a session setting
// dies with the connection it was set on. There is no pool for it to leak
// into. The rule that keeps it that way: every impersonated block gets its own
// `withClient` call, and no test may impersonate and then expect a later
// superuser query on the same connection to be privileged.
// ---------------------------------------------------------------------------

/**
 * Impersonates a signed-in Supabase Auth user: the `authenticated` role with
 * `auth.uid()` resolving to `userId`.
 *
 * `reset role` first so the helper is callable on a connection that is already
 * disguised — a non-superuser cannot `set role` its way back out, but
 * `reset role` (which returns to the session user) is always permitted.
 *
 * The claims are set BEFORE the role switch, while the session is still the
 * owner role, so the helper never depends on `authenticated` being allowed to
 * write a custom GUC.
 */
export async function asUser(c: Client, userId: string): Promise<void> {
  await c.query('reset role');
  await c.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query('set role authenticated');
}

/**
 * Impersonates an anonymous visitor: the `anon` role with NO claims, so
 * `auth.uid()` is null.
 *
 * The claims GUC is explicitly blanked rather than left alone. `auth.uid()`
 * maps empty string to null via `nullif`, and blanking is what makes this
 * helper correct even on a connection a previous call already gave claims to —
 * an anon session that inherited a `sub` would quietly test the wrong thing.
 */
export async function asAnon(c: Client): Promise<void> {
  await c.query('reset role');
  await c.query("select set_config('request.jwt.claims', '', false)");
  await c.query('set role anon');
}
