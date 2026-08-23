import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { QueryResultRow } from 'pg';

import { applyMigrations, resetDb, withClient } from './harness';

// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 2 — schema migration constraints (TDD red).
//
// This is the oracle for the seven remaining shared tables in docs/schema.md:
// inventory, customers, reservations, loyalty_stamps, rewards, staff, events.
// `books` already exists (Phase 0) and is not re-tested here beyond its use as
// a fixture — test/db/harness.test.ts already owns its catalog assertions.
//
// INTEGRITY BOUNDARY — data-integrity form (Products A/B). Every rule below is
// asserted as a REJECTED WRITE against a real Postgres, never as reasoning
// about what application code will do. The three rules that matter, per
// product-a/implementation_plan.md "The three constraints that matter":
//
//   1. `inventory_reserved_sane` — reserved >= 0 and reserved <= on_hand. The
//      constraint NAME is part of the cross-product contract (docs/PRD.md §5
//      FR6 and AGENTS.md name it; Product B's reconciliation error handling
//      matches on it), so the name is asserted, not just the code.
//   2. `on_hand` / `reserved` are `integer not null default 0`. A nullable
//      column here makes Task 10's `where on_hand - reserved >= 1` predicate
//      evaluate to null — every reservation fails silently and the check
//      constraint goes quiet the same way. Defaults are asserted with
//      `toBe(0)`, never a falsy check: `expect(x).toBeFalsy()` passes for null,
//      which is the exact trap.
//   3. `reservations.status` is `not null` AND check-constrained to the five
//      values. A nullable status drops rows out of every `where status = ...`
//      predicate, including Task 11's expiry job.
//
// WHY THESE ASSERT SQLSTATE CODES AND CONSTRAINT NAMES, NEVER MESSAGE TEXT:
// Postgres error message wording is not stable across versions or locales.
// `code` (23514 check, 23502 not-null, 23505 unique) and `constraint` /
// `column` are structured fields the driver surfaces, and they are what the
// contract is actually written in.
//
// WHY THIS CONNECTS AS THE OWNER ROLE (`postgres`), NOT `anon`/`authenticated`:
// this migration enables RLS on all seven tables with ZERO policies — the
// policies are Task 3. A non-owner connection would therefore be rejected with
// 42501 (insufficient privilege) BEFORE any constraint was ever evaluated, and
// every "the database rejected the bad write" assertion below would pass for
// the wrong reason: a green that proves nothing. The harness's connection
// string is the local stack's `postgres` superuser role, and the first test in
// this file asserts that the session really is exempt from RLS, so this cannot
// silently stop being true.
//
// There is deliberately NO `skipIf`, no `.skip`, and no `.todo` in this file,
// and none must ever be added — same rule as Task 2a. If the Supabase local
// stack is not up, these tests MUST fail and take `ci-product-a` red with them.
// ---------------------------------------------------------------------------

/** The seven tables this migration creates, in catalog sort order. */
const NEW_TABLES = [
  'customers',
  'events',
  'inventory',
  'loyalty_stamps',
  'reservations',
  'rewards',
  'staff',
] as const;

/**
 * The five reservation statuses, fixed by docs/schema.md ("`reservations.status`
 * is already fixed at requested, confirmed, picked_up, expired, cancelled").
 */
const RESERVATION_STATUSES = [
  'requested',
  'confirmed',
  'picked_up',
  'expired',
  'cancelled',
] as const;

// Deterministic fixture ids. See the auth.users note on `seedFixtures` for why
// these are fixed constants rather than freshly generated per run.
const AUTH_CUSTOMER_ID = '00000000-0000-4000-8000-00000000c001';
const AUTH_STAFF_ID = '00000000-0000-4000-8000-00000000f001';
const BOOK_ID = '00000000-0000-4000-8000-00000000b001';

/** The structured fields `pg` puts on a Postgres error. Never the message. */
type PgError = Error & {
  code?: string;
  constraint?: string;
  column?: string;
  table?: string;
};

async function rows<R extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return withClient(async (c) => {
    const result = await c.query<R>(sql, params);
    return result.rows;
  });
}

async function exec(sql: string, params: unknown[] = []): Promise<void> {
  await withClient(async (c) => {
    await c.query(sql, params);
  });
}

/**
 * Runs a write that the database is required to reject, and returns the error
 * for assertion. If the write SUCCEEDS, this throws with the offending SQL —
 * a missing constraint must surface as a failure here, never as a silently
 * skipped assertion.
 */
async function rejected(sql: string, params: unknown[] = []): Promise<PgError> {
  return withClient(async (c) => {
    try {
      await c.query(sql, params);
    } catch (cause) {
      return cause as PgError;
    }

    throw new Error(
      'Expected the database to REJECT this write, but it succeeded — the ' +
        `constraint is missing:\n${sql}`,
    );
  });
}

/**
 * Seeds the rows every constraint test needs: two `auth.users`, one `books`
 * row, one `customers` row, one `staff` row.
 *
 * `customers.id` and `staff.user_id` both reference `auth.users(id)`, so these
 * fixtures cannot avoid the auth schema. `resetDb()` truncates `auth.users`
 * alongside the `public` tables, so each `beforeEach` starts from genuinely
 * empty auth state and this seed rebuilds both users from scratch.
 *
 * Deterministic ids plus `on conflict (id) do nothing` are kept anyway: they
 * cost nothing, they keep the seed idempotent if it is ever called twice within
 * one test, and they are what makes the ids above usable as stable references
 * in the assertions rather than values that have to be threaded through.
 */
async function seedFixtures(): Promise<void> {
  await withClient(async (c) => {
    await c.query(
      `insert into auth.users (id, email)
       values ($1, $2), ($3, $4)
       on conflict (id) do nothing`,
      [
        AUTH_CUSTOMER_ID,
        'task2-customer@fixture.invalid',
        AUTH_STAFF_ID,
        'task2-staff@fixture.invalid',
      ],
    );

    await c.query(
      `insert into public.books (id, isbn13, title, author, format, price_cents)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        BOOK_ID,
        '9780000000116',
        'Constraint Fixture Title',
        'Fixture Author',
        'paperback',
        1899,
      ],
    );

    await c.query(
      `insert into public.customers (id, display_name, member_code)
       values ($1, $2, $3)`,
      [AUTH_CUSTOMER_ID, 'Fixture Customer', 'RB-FIXTURE-0001'],
    );

    await c.query(
      `insert into public.staff (user_id, role) values ($1, 'bookseller')`,
      [AUTH_STAFF_ID],
    );
  });
}

/** A valid inventory row for the tests that mutate an existing one. */
async function insertValidInventory(
  onHand: number,
  reserved: number,
): Promise<void> {
  await exec(
    `insert into public.inventory (book_id, on_hand, reserved, counted_at)
     values ($1, $2, $3, now())`,
    [BOOK_ID, onHand, reserved],
  );
}

beforeAll(async () => {
  await applyMigrations();
}, 120_000);

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

describe('schema migration — the connection these assertions depend on', () => {
  it('runs as a role exempt from RLS, so a rejected write means a constraint and not 42501', async () => {
    // RLS is enabled on all seven tables with zero policies until Task 3. If
    // this session were `anon` or `authenticated`, every bad write below would
    // be rejected with 42501 before its constraint was ever evaluated, and the
    // whole file would be green for the wrong reason.
    const [role] = await rows<{ who: string; bypasses_rls: boolean }>(
      `select current_user as who,
              exists (
                select 1 from pg_roles
                 where rolname = current_user
                   and (rolsuper or rolbypassrls)
              ) as bypasses_rls`,
    );

    const owners = await rows<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner
         from pg_tables
        where schemaname = 'public' and tablename = any($1)`,
      [[...NEW_TABLES]],
    );

    const ownsEveryTable =
      owners.length === NEW_TABLES.length &&
      owners.every((o) => o.tableowner === role.who);

    expect(role.bypasses_rls || ownsEveryTable).toBe(true);
  });
});

describe('schema migration — the seven tables', () => {
  it('creates every table docs/schema.md assigns to Product A', async () => {
    const present = await rows<{ tablename: string }>(
      `select tablename
         from pg_tables
        where schemaname = 'public' and tablename = any($1)
        order by tablename`,
      [[...NEW_TABLES]],
    );

    expect(present.map((r) => r.tablename)).toEqual([...NEW_TABLES]);
  });

  it('enables RLS on all seven with zero policies — the policies are Task 3', async () => {
    // Catalog introspection rather than a write, because no write from THIS
    // connection can observe RLS: the owner role is exempt by definition. The
    // rule is "RLS is armed and deny-by-default until Task 3 adds policies",
    // and the catalog is the only place that is visible from here.
    const state = await rows<{
      relname: string;
      rls_enabled: boolean;
      policy_count: number;
    }>(
      `select c.relname,
              c.relrowsecurity as rls_enabled,
              (select count(*)::int
                 from pg_policy p
                where p.polrelid = c.oid) as policy_count
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)
        order by c.relname`,
      [[...NEW_TABLES]],
    );

    expect(state).toEqual(
      NEW_TABLES.map((relname) => ({
        relname,
        rls_enabled: true,
        policy_count: 0,
      })),
    );
  });

  it('gives events.start_time a bare time, docs/schema.md\'s one exception to timestamptz', async () => {
    // A stored value cannot distinguish this from timestamptz cleanly, and the
    // exception is explicit in the shared contract ("a bare `time` in
    // store-local time, meaningless without events.event_date beside it"),
    // which Products C and D both read.
    const [column] = await rows<{ data_type: string }>(
      `select data_type
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'events'
          and column_name = 'start_time'`,
    );

    expect(column?.data_type ?? null).toBe('time without time zone');
  });
});

describe('inventory — inventory_reserved_sane (Integrity Boundary)', () => {
  it('rejects an insert reserving more copies than are on hand', async () => {
    const err = await rejected(
      `insert into public.inventory (book_id, on_hand, reserved, counted_at)
       values ($1, 0, 1, now())`,
      [BOOK_ID],
    );

    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('inventory_reserved_sane');
  });

  it('rejects a negative reserved count', async () => {
    // The `reserved >= 0` half of the constraint. Without it, a double-release
    // in Task 11's expiry job would drive reserved below zero and manufacture
    // availability that does not exist.
    const err = await rejected(
      `insert into public.inventory (book_id, on_hand, reserved, counted_at)
       values ($1, 5, -1, now())`,
      [BOOK_ID],
    );

    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('inventory_reserved_sane');
  });

  it('allows reserved to equal on_hand — the bound is <=, not <', async () => {
    // The last copy in the shop being reserved is a legal state, not an error.
    // Without this, a too-tight constraint would pass every rejection test
    // above while breaking the ordinary path.
    await insertValidInventory(3, 3);

    const [row] = await rows<{ on_hand: number; reserved: number }>(
      'select on_hand, reserved from public.inventory where book_id = $1',
      [BOOK_ID],
    );

    expect(row.on_hand).toBe(3);
    expect(row.reserved).toBe(3);
  });

  it('rejects a reconciliation update that drops on_hand below reserved', async () => {
    // The UPDATE direction, PRD §5 FR6: Product B recounts the shelf and finds
    // fewer copies than are already spoken for. A different code path from the
    // insert above — a constraint declared only as a column-level check on
    // insert, or enforced in application code, passes the insert test and
    // fails here.
    await insertValidInventory(1, 1);

    const err = await rejected(
      'update public.inventory set on_hand = 0 where book_id = $1',
      [BOOK_ID],
    );

    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('inventory_reserved_sane');
  });

  it('defaults on_hand and reserved to 0, asserted as 0 rather than as falsy', async () => {
    await exec(
      'insert into public.inventory (book_id, counted_at) values ($1, now())',
      [BOOK_ID],
    );

    const [row] = await rows<{ on_hand: number; reserved: number }>(
      'select on_hand, reserved from public.inventory where book_id = $1',
      [BOOK_ID],
    );

    // toBe(0), deliberately: a nullable column with no default would give null
    // here, and null is falsy. `toBeFalsy()` would pass and hide the exact
    // failure mode rule 2 exists to prevent.
    expect(row.on_hand).toBe(0);
    expect(row.reserved).toBe(0);
  });

  it('rejects setting on_hand to null', async () => {
    await insertValidInventory(2, 1);

    const err = await rejected(
      'update public.inventory set on_hand = null where book_id = $1',
      [BOOK_ID],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('on_hand');
  });

  it('rejects setting reserved to null', async () => {
    await insertValidInventory(2, 1);

    const err = await rejected(
      'update public.inventory set reserved = null where book_id = $1',
      [BOOK_ID],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('reserved');
  });

  it('rejects setting counted_at to null', async () => {
    await insertValidInventory(2, 1);

    const err = await rejected(
      'update public.inventory set counted_at = null where book_id = $1',
      [BOOK_ID],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('counted_at');
  });

  it('rejects an insert that omits counted_at — the column must have no default', async () => {
    // Deliberate: `default now()` would make a never-counted row render as
    // "counted just now", the exact dishonesty Phase 2's status ladder exists
    // to prevent. Without this assertion nothing stops a default being added
    // later, and the lie would be silent.
    const err = await rejected(
      'insert into public.inventory (book_id, on_hand, reserved) values ($1, 1, 0)',
      [BOOK_ID],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('counted_at');
  });
});

describe('reservations — status is not null and check-constrained', () => {
  it.each([...RESERVATION_STATUSES])('accepts the %s status', async (status) => {
    await exec(
      `insert into public.reservations (book_id, customer_id, status)
       values ($1, $2, $3)`,
      [BOOK_ID, AUTH_CUSTOMER_ID, status],
    );

    const [row] = await rows<{ status: string }>(
      'select status from public.reservations where customer_id = $1',
      [AUTH_CUSTOMER_ID],
    );

    expect(row.status).toBe(status);
  });

  it('rejects a status outside the five docs/schema.md fixes', async () => {
    const err = await rejected(
      `insert into public.reservations (book_id, customer_id, status)
       values ($1, $2, 'pending')`,
      [BOOK_ID, AUTH_CUSTOMER_ID],
    );

    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('reservations_status_allowed');
  });

  it('rejects a null status', async () => {
    // A nullable status makes every `where status = ...` predicate go null and
    // drops the row silently out of Task 11's expiry sweep — the book stays
    // invisible while sitting on the shelf.
    const err = await rejected(
      `insert into public.reservations (book_id, customer_id, status)
       values ($1, $2, null)`,
      [BOOK_ID, AUTH_CUSTOMER_ID],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('status');
  });
});

describe('loyalty_stamps — idempotency key and grant attribution', () => {
  it('rejects a second stamp with the same request_id', async () => {
    // Stamp grant idempotency, one of the four non-negotiable tests in
    // product-a/implementation_plan.md: a retried request at the register must
    // not become two stamps. The unique index name is not pinned by the SPEC,
    // so only the SQLSTATE and the surviving row count are asserted.
    const requestId = '00000000-0000-4000-8000-00000000e001';

    await exec(
      `insert into public.loyalty_stamps (customer_id, granted_by, request_id)
       values ($1, $2, $3)`,
      [AUTH_CUSTOMER_ID, AUTH_STAFF_ID, requestId],
    );

    const err = await rejected(
      `insert into public.loyalty_stamps (customer_id, granted_by, request_id)
       values ($1, $2, $3)`,
      [AUTH_CUSTOMER_ID, AUTH_STAFF_ID, requestId],
    );

    expect(err.code).toBe('23505');

    const [count] = await rows<{ n: number }>(
      'select count(*)::int as n from public.loyalty_stamps where request_id = $1',
      [requestId],
    );

    expect(count.n).toBe(1);
  });

  it('rejects a stamp with no granting staff member', async () => {
    const err = await rejected(
      `insert into public.loyalty_stamps (customer_id, granted_by, request_id)
       values ($1, null, $2)`,
      [AUTH_CUSTOMER_ID, '00000000-0000-4000-8000-00000000e002'],
    );

    expect(err.code).toBe('23502');
    expect(err.column).toBe('granted_by');
  });
});

describe('staff and rewards — the remaining pinned check constraints', () => {
  it('rejects a staff role outside the allowed set', async () => {
    // Products B and D both gate authorization on this table (docs/schema.md,
    // "staff"), so an unconstrained free-text role is an authorization hole,
    // not a cosmetic one.
    const err = await rejected(
      `insert into public.staff (user_id, role) values ($1, 'manager')`,
      [AUTH_CUSTOMER_ID],
    );

    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('staff_role_allowed');
  });

  it('rejects a redemption that spends no stamps', async () => {
    const err = await rejected(
      `insert into public.rewards (customer_id, stamps_spent) values ($1, 0)`,
      [AUTH_CUSTOMER_ID],
    );

    expect(err.code).toBe('23514');
  });
});

describe('foreign keys — what deliberately does NOT cascade', () => {
  // Both rules below are enforced only by the ABSENCE of an `on delete` clause
  // in the migration, which is invisible: adding `on delete cascade` in a later
  // task would silently reverse a decision the migration argues for at length.
  // The `counted_at` test above exists for exactly this reason — an omission
  // that matters needs an assertion, or it can be undone quietly. These are the
  // other two.

  it('refuses to delete a book that a customer is holding', async () => {
    // reservations.book_id does not cascade: deleting a book with live
    // reservations must error, not silently drop commitments the store told
    // customers it would honour.
    await exec(
      `insert into public.reservations (book_id, customer_id, status)
       values ($1, $2, 'confirmed')`,
      [BOOK_ID, AUTH_CUSTOMER_ID],
    );

    const err = await rejected('delete from public.books where id = $1', [
      BOOK_ID,
    ]);

    expect(err.code).toBe('23503');
    expect(err.table).toBe('reservations');

    const [count] = await rows<{ n: number }>(
      'select count(*)::int as n from public.reservations where book_id = $1',
      [BOOK_ID],
    );

    expect(count.n).toBe(1);
  });

  it('refuses to delete a staff member whose grants are on the record', async () => {
    // loyalty_stamps.granted_by does not cascade: every stamp keeps its
    // attribution. Note the consequence this pins, which is stronger than
    // "the record survives" — the staff row cannot be deleted at all while
    // grants reference it, and because staff.user_id cascades from
    // auth.users, deleting that auth user fails the same way.
    await exec(
      `insert into public.loyalty_stamps (customer_id, granted_by, request_id)
       values ($1, $2, $3)`,
      [AUTH_CUSTOMER_ID, AUTH_STAFF_ID, '00000000-0000-4000-8000-00000000e003'],
    );

    const err = await rejected('delete from public.staff where user_id = $1', [
      AUTH_STAFF_ID,
    ]);

    expect(err.code).toBe('23503');
    expect(err.table).toBe('loyalty_stamps');

    const [count] = await rows<{ n: number }>(
      'select count(*)::int as n from public.loyalty_stamps where granted_by = $1',
      [AUTH_STAFF_ID],
    );

    expect(count.n).toBe(1);
  });

  it('declares both as NO ACTION in the catalog, not RESTRICT or CASCADE', async () => {
    // The behavioural tests above would also pass under RESTRICT, and the
    // difference is load-bearing elsewhere: NO ACTION defers its check to the
    // end of the statement, which is what lets deleting a customer cascade
    // through rewards and loyalty_stamps in one statement without tripping
    // consumed_by_reward_id. RESTRICT fires immediately and would break it.
    const declared = await rows<{
      child: string;
      column_name: string;
      on_delete: string;
    }>(
      `select rel.relname as child,
              att.attname as column_name,
              con.confdeltype as on_delete
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace nsp on nsp.oid = rel.relnamespace
         join pg_attribute att
           on att.attrelid = con.conrelid
          and att.attnum = con.conkey[1]
        where con.contype = 'f'
          and array_length(con.conkey, 1) = 1
          and nsp.nspname = 'public'
          and (rel.relname, att.attname) in (
                ('reservations', 'book_id'),
                ('loyalty_stamps', 'granted_by')
              )
        order by rel.relname`,
    );

    // 'a' is NO ACTION; 'c' would be CASCADE and 'r' RESTRICT.
    expect(declared).toEqual([
      { child: 'loyalty_stamps', column_name: 'granted_by', on_delete: 'a' },
      { child: 'reservations', column_name: 'book_id', on_delete: 'a' },
    ]);
  });
});
