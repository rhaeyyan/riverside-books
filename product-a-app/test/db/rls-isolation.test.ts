import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Client, QueryResultRow } from 'pg';

import { applyMigrations, asAnon, asUser, resetDb, withClient } from './harness';

// ---------------------------------------------------------------------------
// Product A, Phase 1, Tasks 3+4 — cross-account RLS isolation (TDD red).
//
// THIS FILE IS THE PHASE 1 EXIT CONDITION. product-a/implementation_plan.md:
// "A cross-account isolation test signs in as customer A, requests customer B's
// reservations and stamp balance by id, and asserts an empty result. RLS that
// has never been probed by a hostile session is an assumption, not a control."
//
// INTEGRITY BOUNDARY — data-integrity form (Products A/B). Who may see or write
// a customer's reservations and stamps is decided by Postgres, in policies
// bound to `auth.uid()` and the `anon` / `authenticated` roles. It is never
// decided by an application-code `where customer_id = ...`, never inferred from
// an email domain, and never taken from a client-settable claim. Every
// assertion below is therefore executed AS one of those client roles against a
// real Postgres. The superuser connection appears in exactly two places, both
// deliberate: seeding fixtures, and re-reading a row afterwards to confirm a
// denied write really left the data alone.
//
// WHY EVERY TABLE IS TESTED IN BOTH DIRECTIONS — the point this file turns on.
// All seven tables are deny-all today (Task 2 enabled RLS with zero policies),
// so "customer A cannot see B's reservations" is ALREADY TRUE, and a test that
// asserted only emptiness would go green against a migration that adds nothing
// at all. It would prove the absence of a feature, not the presence of a
// control. So each table is asserted twice:
//
//   negative — B's row is invisible to A (0 rows, not an error), and
//   positive — A's OWN row IS visible to A, with the seeded values.
//
// The positive half is what fails today and what only a correct policy makes
// pass. It also proves the stack's table GRANTs to `authenticated` exist: RLS
// filters rows, but a missing grant errors with 42501 before any policy runs,
// and `selectAs` below names that case explicitly so the two are never
// confused. Same shape for the fixtures: B's rows are asserted to EXIST from
// the superuser connection first, so "A sees zero of them" can never pass
// because the table happened to be empty.
//
// WHY SQLSTATE CODES, NEVER MESSAGE TEXT: same rule as
// schema-constraints.test.ts. Postgres message wording is not stable across
// versions or locales; `code` is a structured field the driver surfaces.
// 42501 is the RLS `with check` rejection (and the missing-grant rejection);
// 42P17 is infinite recursion in a policy, the failure mode a `staff` policy
// that selects from `staff` without a self-row predicate produces.
//
// There is deliberately NO `skipIf`, no `.skip`, and no `.todo` in this file,
// and none must ever be added — same hard rule as the other two db files. If
// the Supabase local stack is not up, these tests MUST fail and take
// `ci-product-a` red with them.
// ---------------------------------------------------------------------------

// Deterministic fixture ids, in the same style as schema-constraints.test.ts:
// valid v4-shaped uuids whose tail is a readable label. Fixed rather than
// generated so the assertions can name a row directly instead of threading a
// value through.
const AUTH_CUSTOMER_A = '00000000-0000-4000-8000-0000000000a1';
const AUTH_CUSTOMER_B = '00000000-0000-4000-8000-0000000000b2';
const AUTH_STAFF = '00000000-0000-4000-8000-0000000000f3';
const BOOK_ID = '00000000-0000-4000-8000-0000000000bc';
const RESERVATION_A = '00000000-0000-4000-8000-00000000e5a1';
const RESERVATION_B = '00000000-0000-4000-8000-00000000e5b2';
const RESERVATION_NEW = '00000000-0000-4000-8000-00000000e5c3';
const STAMP_A = '00000000-0000-4000-8000-0000000057a1';
const STAMP_B = '00000000-0000-4000-8000-0000000057b2';
const STAMP_REQUEST_A = '00000000-0000-4000-8000-00000000c1a1';
const STAMP_REQUEST_B = '00000000-0000-4000-8000-00000000c1b2';
const STAMP_REQUEST_NEW = '00000000-0000-4000-8000-00000000c1c3';
const REWARD_A = '00000000-0000-4000-8000-00000000d0a1';
const REWARD_B = '00000000-0000-4000-8000-00000000d0b2';
const EVENT_ID = '00000000-0000-4000-8000-0000000000ee';

/**
 * Well-formed, deliberately unused: the id customer A tries to move their own
 * `customers` row to. It belongs to no auth user, so the ONLY reason to reject
 * the update is the policy's `with check (id = auth.uid())`.
 */
const UNCLAIMED_ID = '00000000-0000-4000-8000-00000000dead';

/** The structured fields `pg` puts on a Postgres error. Never the message. */
type PgError = Error & {
  code?: string;
  constraint?: string;
  column?: string;
  table?: string;
};

/**
 * A client role as a browser reaches Postgres with. `userId` null means an
 * anonymous visitor — the `anon` role with no claims at all.
 */
type Persona = {
  label: string;
  role: 'anon' | 'authenticated';
  userId: string | null;
};

const CUSTOMER_A: Persona = {
  label: 'customer A',
  role: 'authenticated',
  userId: AUTH_CUSTOMER_A,
};

const STAFF: Persona = {
  label: 'staff member',
  role: 'authenticated',
  userId: AUTH_STAFF,
};

const ANON: Persona = { label: 'anonymous visitor', role: 'anon', userId: null };

/** What the disguise guard reads back out of an impersonated session. */
type SessionIdentity = {
  who: string;
  bypasses_rls: boolean;
  owns_public_tables: boolean;
  uid: string | null;
};

async function sessionIdentity(c: Client): Promise<SessionIdentity> {
  const { rows } = await c.query<SessionIdentity>(
    `select current_user::text as who,
            exists (
              select 1 from pg_roles
               where rolname = current_user
                 and (rolsuper or rolbypassrls)
            ) as bypasses_rls,
            exists (
              select 1 from pg_tables
               where schemaname = 'public' and tableowner = current_user
            ) as owns_public_tables,
            auth.uid()::text as uid`,
  );

  return rows[0];
}

/**
 * Opens a dedicated connection, disguises it as `persona`, PROVES the disguise
 * took, and only then runs `fn`.
 *
 * The guard is the inverse of schema-constraints.test.ts's: that file asserts
 * its connection IS privileged, so a rejected write there means a constraint
 * and not 42501. This one asserts the connection is genuinely NOT — not a
 * superuser, not `rolbypassrls`, and not the owner of any `public` table
 * (owners are exempt from RLS unless it is FORCEd, which would make every
 * assertion below pass while proving nothing). `auth.uid()` is checked too: a
 * session with the right role but no `sub` sees zero rows everywhere, which
 * would make the NEGATIVE half of every pair pass for the wrong reason.
 *
 * Running the guard here rather than only in its own test is what makes it
 * unskippable — there is no path into an impersonated query that bypasses it.
 * One `withClient` per call, per the harness note: `set role` cannot leak.
 */
async function withPersona<T>(
  persona: Persona,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  return withClient(async (c) => {
    if (persona.userId === null) {
      await asAnon(c);
    } else {
      await asUser(c, persona.userId);
    }

    let identity: SessionIdentity;

    try {
      identity = await sessionIdentity(c);
    } catch (cause) {
      const err = cause as PgError;
      throw new Error(
        `Could not read back the identity of the ${persona.label} session ` +
          `(SQLSTATE ${err.code ?? '(none)'}). If this is 42501 or 3F000, the ` +
          `\`${persona.role}\` role cannot reach \`auth.uid()\` — which means ` +
          'no policy written against auth.uid() can work either, and the fix ' +
          'is a grant on the auth schema, not a change to this test.',
        { cause },
      );
    }

    expect(
      identity,
      `The session claiming to be ${persona.label} is not disguised as ` +
        'expected, so nothing below it can be trusted. A privileged session ' +
        'bypasses RLS entirely and makes every assertion in this file green ' +
        'for the wrong reason.',
    ).toEqual({
      who: persona.role,
      bypasses_rls: false,
      owns_public_tables: false,
      uid: persona.userId,
    });

    return fn(c);
  });
}

/**
 * A select run AS `persona`. An error here is never the expected outcome — RLS
 * denies by filtering rows, not by raising — so the two ways it can throw are
 * named in the message, because nobody can attach a debugger to a CI database.
 */
async function selectAs<R extends QueryResultRow>(
  persona: Persona,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return withPersona(persona, async (c) => {
    try {
      const result = await c.query<R>(sql, params);
      return result.rows;
    } catch (cause) {
      const err = cause as PgError;
      throw new Error(
        `Select failed as ${persona.label} with SQLSTATE ${err.code ?? '(none)'} ` +
          '— RLS is supposed to FILTER rows here, not raise. 42501 means the ' +
          `table's GRANT to \`${persona.role}\` is missing (a policy alone is ` +
          'not enough; the role needs the privilege too). 42P17 means a policy ' +
          'is self-recursive — a `staff` policy that selects from `staff` ' +
          'without a self-row predicate does this.\n' +
          sql,
        { cause },
      );
    }
  });
}

/**
 * Rows affected by a write run AS `persona`. A denied update or delete is 0
 * rows and NO error, which is why this returns a count rather than asserting.
 *
 * `?? -1` rather than `?? 0` on purpose: `rowCount` is typed nullable, and
 * defaulting a null to 0 would make every "the write was denied" assertion in
 * this file pass without the database having been consulted at all. -1 never
 * matches an expectation and says so in the diff.
 */
async function affectedAs(
  persona: Persona,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  return withPersona(persona, async (c) => {
    try {
      const result = await c.query(sql, params);
      return result.rowCount ?? -1;
    } catch (cause) {
      const err = cause as PgError;
      throw new Error(
        `Write failed as ${persona.label} with SQLSTATE ${err.code ?? '(none)'} ` +
          '— a write with no policy behind it should affect 0 rows silently, ' +
          'not raise. 42501 here means the table GRANT to ' +
          `\`${persona.role}\` is missing.\n${sql}`,
        { cause },
      );
    }
  });
}

/**
 * Runs a write that RLS is required to REJECT outright (an insert whose `with
 * check` fails, or an insert against a table with no insert policy at all) and
 * returns the error for assertion. A write that SUCCEEDS throws here with the
 * offending SQL: a missing or too-permissive policy must surface as a failure,
 * never as a silently skipped assertion.
 *
 * Every such write below is otherwise entirely valid — real foreign keys, no
 * null in a `not null` column, no check constraint violated — so the only
 * thing left to reject it is the policy. That is deliberate: a row that also
 * broke a constraint could be rejected for that reason instead and the
 * assertion would pass with RLS absent.
 */
async function rejectedAs(
  persona: Persona,
  sql: string,
  params: unknown[] = [],
): Promise<PgError> {
  return withPersona(persona, async (c) => {
    try {
      await c.query(sql, params);
    } catch (cause) {
      return cause as PgError;
    }

    throw new Error(
      `Expected RLS to REJECT this write as ${persona.label}, but it ` +
        'succeeded. The row is valid against every constraint, so only a ' +
        'policy could have stopped it — the policy is missing or too ' +
        `permissive:\n${sql}`,
    );
  });
}

/**
 * A select on the superuser connection. Used for exactly two things: asserting
 * a fixture really exists before asserting somebody cannot see it, and
 * re-reading a row on a FRESH connection after a denied write to confirm the
 * data is untouched. Never used to stand in for a client-role observation.
 */
async function asSuperuser<R extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return withClient(async (c) => {
    const result = await c.query<R>(sql, params);
    return result.rows;
  });
}

async function countAsSuperuser(
  table: string,
  where: string,
  params: unknown[] = [],
): Promise<number> {
  const [row] = await asSuperuser<{ n: number }>(
    `select count(*)::int as n from public.${table} where ${where}`,
    params,
  );

  return row.n;
}

/**
 * Two customers with a reservation, a stamp and a reward each; one staff
 * member; one book with inventory; one event.
 *
 * Customer B's rows are the whole point — every "A sees nothing of B's" claim
 * is only worth something because B's row demonstrably exists. `rewards` and
 * `events` get rows for the same reason: they stay deny-all after this task,
 * and a deny-all assertion against an empty table is a tautology.
 */
async function seedFixtures(): Promise<void> {
  await withClient(async (c) => {
    await c.query(
      `insert into auth.users (id, email)
       values ($1, $2), ($3, $4), ($5, $6)`,
      [
        AUTH_CUSTOMER_A,
        'rls-a@fixture.invalid',
        AUTH_CUSTOMER_B,
        'rls-b@fixture.invalid',
        AUTH_STAFF,
        'rls-staff@fixture.invalid',
      ],
    );

    await c.query(
      `insert into public.customers (id, display_name, member_code)
       values ($1, 'Customer A', 'RB-RLS-A'), ($2, 'Customer B', 'RB-RLS-B')`,
      [AUTH_CUSTOMER_A, AUTH_CUSTOMER_B],
    );

    await c.query(
      `insert into public.staff (user_id, role) values ($1, 'bookseller')`,
      [AUTH_STAFF],
    );

    await c.query(
      `insert into public.books (id, isbn13, title, author, format, price_cents)
       values ($1, '9780000000123', 'RLS Fixture Title', 'Fixture Author',
               'paperback', 1899)`,
      [BOOK_ID],
    );

    await c.query(
      `insert into public.inventory (book_id, on_hand, reserved, counted_at)
       values ($1, 3, 1, now())`,
      [BOOK_ID],
    );

    await c.query(
      `insert into public.reservations (id, book_id, customer_id, status)
       values ($1, $3, $4, 'requested'), ($2, $3, $5, 'requested')`,
      [
        RESERVATION_A,
        RESERVATION_B,
        BOOK_ID,
        AUTH_CUSTOMER_A,
        AUTH_CUSTOMER_B,
      ],
    );

    await c.query(
      `insert into public.rewards (id, customer_id, stamps_spent)
       values ($1, $3, 6), ($2, $4, 6)`,
      [REWARD_A, REWARD_B, AUTH_CUSTOMER_A, AUTH_CUSTOMER_B],
    );

    await c.query(
      `insert into public.loyalty_stamps (id, customer_id, granted_by, request_id)
       values ($1, $3, $5, $6), ($2, $4, $5, $7)`,
      [
        STAMP_A,
        STAMP_B,
        AUTH_CUSTOMER_A,
        AUTH_CUSTOMER_B,
        AUTH_STAFF,
        STAMP_REQUEST_A,
        STAMP_REQUEST_B,
      ],
    );

    await c.query(
      `insert into public.events (id, title, event_date, start_time)
       values ($1, 'Fixture Reading', current_date, '19:00')`,
      [EVENT_ID],
    );
  });
}

beforeAll(async () => {
  await applyMigrations();
}, 120_000);

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

describe('the sessions and fixtures these assertions depend on', () => {
  it('disguises customer A as a genuinely unprivileged authenticated session', async () => {
    const identity = await withPersona(CUSTOMER_A, (c) => sessionIdentity(c));

    // Restated as its own test, not just as withPersona's internal guard, so
    // the disguise has a named failure of its own rather than surfacing as a
    // confusing failure inside an unrelated isolation assertion.
    expect(identity).toEqual({
      who: 'authenticated',
      bypasses_rls: false,
      owns_public_tables: false,
      uid: AUTH_CUSTOMER_A,
    });
  });

  it('disguises an anonymous visitor as anon with no auth.uid() at all', async () => {
    const identity = await withPersona(ANON, (c) => sessionIdentity(c));

    expect(identity).toEqual({
      who: 'anon',
      bypasses_rls: false,
      owns_public_tables: false,
      uid: null,
    });
  });

  it('seeds customer B rows that really exist, so "A sees none of them" means something', async () => {
    // Without this, every isolation assertion in the file would also pass
    // against an empty database — the cheapest possible false green.
    const present = {
      reservations: await countAsSuperuser('reservations', 'customer_id = $1', [
        AUTH_CUSTOMER_B,
      ]),
      loyalty_stamps: await countAsSuperuser(
        'loyalty_stamps',
        'customer_id = $1',
        [AUTH_CUSTOMER_B],
      ),
      customers: await countAsSuperuser('customers', 'id = $1', [
        AUTH_CUSTOMER_B,
      ]),
      rewards: await countAsSuperuser('rewards', 'customer_id = $1', [
        AUTH_CUSTOMER_B,
      ]),
    };

    expect(present).toEqual({
      reservations: 1,
      loyalty_stamps: 1,
      customers: 1,
      rewards: 1,
    });
  });
});

describe('inventory and books — readable by anyone, including anonymously', () => {
  it('lets an anonymous visitor read the inventory row', async () => {
    // The public read half of the Phase 2 stock display: a shopper who has
    // never signed in still sees what is on the shelf.
    const rows = await selectAs<{
      book_id: string;
      on_hand: number;
      reserved: number;
    }>(ANON, 'select book_id, on_hand, reserved from public.inventory');

    expect(rows).toEqual([{ book_id: BOOK_ID, on_hand: 3, reserved: 1 }]);
  });

  it('lets a signed-in customer read the inventory row too', async () => {
    // `to anon, authenticated` — a policy naming only `anon` would pass the
    // test above and break the signed-in catalog.
    const rows = await selectAs<{ book_id: string }>(
      CUSTOMER_A,
      'select book_id from public.inventory',
    );

    expect(rows.map((r) => r.book_id)).toEqual([BOOK_ID]);
  });

  it('leaves the Phase 0 books_public_read policy working', async () => {
    // books already has its policy from 20260821144028_create_books_table.sql.
    // Asserted from an anon session because nothing ever has been: Phase 0
    // wrote the policy and no test has probed it from the role it names.
    const rows = await selectAs<{ id: string }>(
      ANON,
      'select id from public.books',
    );

    expect(rows.map((r) => r.id)).toEqual([BOOK_ID]);
  });
});

describe('customers — a customer sees and edits only their own row', () => {
  it('returns A their own row, with the seeded values', async () => {
    const rows = await selectAs<{
      id: string;
      display_name: string | null;
      member_code: string;
    }>(
      CUSTOMER_A,
      'select id, display_name, member_code from public.customers',
    );

    // No `where` clause on purpose: the filtering under test is the policy's,
    // and adding an application-side predicate here would hide its absence —
    // exactly the mistake the Integrity Boundary forbids in product code.
    expect(rows).toEqual([
      {
        id: AUTH_CUSTOMER_A,
        display_name: 'Customer A',
        member_code: 'RB-RLS-A',
      },
    ]);
  });

  it('returns nothing when A asks for B by id — empty, not an error', async () => {
    const rows = await selectAs<{ id: string }>(
      CUSTOMER_A,
      'select id from public.customers where id = $1',
      [AUTH_CUSTOMER_B],
    );

    expect(rows).toEqual([]);
  });

  it('lets A update their own display name', async () => {
    const affected = await affectedAs(
      CUSTOMER_A,
      'update public.customers set display_name = $1 where id = $2',
      ['Renamed By A', AUTH_CUSTOMER_A],
    );

    expect(affected).toBe(1);

    const [row] = await asSuperuser<{ display_name: string | null }>(
      'select display_name from public.customers where id = $1',
      [AUTH_CUSTOMER_A],
    );

    expect(row.display_name).toBe('Renamed By A');
  });

  it("denies A an edit of B's display name, and leaves B's row untouched", async () => {
    const affected = await affectedAs(
      CUSTOMER_A,
      'update public.customers set display_name = $1 where id = $2',
      ['Vandalised', AUTH_CUSTOMER_B],
    );

    expect(affected).toBe(0);

    const [row] = await asSuperuser<{ display_name: string | null }>(
      'select display_name from public.customers where id = $1',
      [AUTH_CUSTOMER_B],
    );

    expect(row.display_name).toBe('Customer B');
  });

  it('rejects A moving their own row to an id that is not their auth.uid()', async () => {
    // The `with check` half. A policy written with `using` alone passes every
    // other assertion in this block: `using` decides which rows A may touch,
    // `with check` decides what the row is allowed to look like afterwards.
    // Without it, A can update themselves out of their own policy's reach.
    const err = await rejectedAs(
      CUSTOMER_A,
      'update public.customers set id = $1 where id = $2',
      [UNCLAIMED_ID, AUTH_CUSTOMER_A],
    );

    expect(err.code).toBe('42501');

    expect(
      await countAsSuperuser('customers', 'id = $1', [AUTH_CUSTOMER_A]),
    ).toBe(1);
  });
});

describe('reservations — the customer direction', () => {
  it("returns A their own reservation and none of B's", async () => {
    // Both directions in one assertion: the seeded pair goes in, exactly one
    // row comes back, and it is A's. Asserting only `[]` for B would pass
    // today, against zero policies.
    const rows = await selectAs<{
      id: string;
      customer_id: string;
      status: string;
    }>(
      CUSTOMER_A,
      'select id, customer_id, status from public.reservations order by id',
    );

    expect(rows).toEqual([
      {
        id: RESERVATION_A,
        customer_id: AUTH_CUSTOMER_A,
        status: 'requested',
      },
    ]);
  });

  it("returns nothing when A asks for B's reservation by id", async () => {
    // The exit condition's literal wording: "signs in as customer A, requests
    // customer B's reservations ... by id, and asserts an empty result".
    const rows = await selectAs<{ id: string }>(
      CUSTOMER_A,
      'select id from public.reservations where customer_id = $1',
      [AUTH_CUSTOMER_B],
    );

    expect(rows).toEqual([]);
  });

  it('lets A create a reservation for themselves in the requested status', async () => {
    const affected = await affectedAs(
      CUSTOMER_A,
      `insert into public.reservations (id, book_id, customer_id, status)
       values ($1, $2, $3, 'requested')`,
      [RESERVATION_NEW, BOOK_ID, AUTH_CUSTOMER_A],
    );

    expect(affected).toBe(1);

    const [row] = await asSuperuser<{ customer_id: string; status: string }>(
      'select customer_id, status from public.reservations where id = $1',
      [RESERVATION_NEW],
    );

    expect(row).toEqual({ customer_id: AUTH_CUSTOMER_A, status: 'requested' });
  });

  it('rejects A creating a reservation that starts already confirmed', async () => {
    // `confirmed` is a legal status per the check constraint, so the ONLY
    // thing that can reject this row is the insert policy's `with check`.
    // Self-confirming is the whole attack: it reserves a copy without a member
    // of staff ever having taken it off the shelf.
    const err = await rejectedAs(
      CUSTOMER_A,
      `insert into public.reservations (id, book_id, customer_id, status)
       values ($1, $2, $3, 'confirmed')`,
      [RESERVATION_NEW, BOOK_ID, AUTH_CUSTOMER_A],
    );

    expect(err.code).toBe('42501');

    expect(
      await countAsSuperuser('reservations', 'id = $1', [RESERVATION_NEW]),
    ).toBe(0);
  });

  it("rejects A creating a reservation in B's name", async () => {
    const err = await rejectedAs(
      CUSTOMER_A,
      `insert into public.reservations (id, book_id, customer_id, status)
       values ($1, $2, $3, 'requested')`,
      [RESERVATION_NEW, BOOK_ID, AUTH_CUSTOMER_B],
    );

    expect(err.code).toBe('42501');

    expect(
      await countAsSuperuser('reservations', 'customer_id = $1', [
        AUTH_CUSTOMER_B,
      ]),
    ).toBe(1);
  });

  it('denies A confirming their OWN reservation — status transitions are staff-only', async () => {
    // The subtle one. A owns this row and can read it, so a policy set that
    // granted update alongside select would look reasonable and quietly let a
    // customer mark their own book as ready for collection. There must be no
    // customer update policy on this table at all: 0 rows, no error.
    const affected = await affectedAs(
      CUSTOMER_A,
      `update public.reservations set status = 'confirmed', confirmed_at = now()
        where id = $1`,
      [RESERVATION_A],
    );

    expect(affected).toBe(0);

    // Re-read on a FRESH superuser connection, per the SPEC: proves the row on
    // disk is unchanged, not merely that the write reported nothing.
    const [row] = await asSuperuser<{
      status: string;
      confirmed_at: Date | null;
    }>('select status, confirmed_at from public.reservations where id = $1', [
      RESERVATION_A,
    ]);

    expect(row).toEqual({ status: 'requested', confirmed_at: null });
  });

  it('denies A deleting their own reservation', async () => {
    // Cancelling is a status transition, not a delete — the row is a record of
    // a commitment the store made and has to survive.
    const affected = await affectedAs(
      CUSTOMER_A,
      'delete from public.reservations where id = $1',
      [RESERVATION_A],
    );

    expect(affected).toBe(0);

    expect(
      await countAsSuperuser('reservations', 'id = $1', [RESERVATION_A]),
    ).toBe(1);
  });
});

describe('reservations — the staff direction', () => {
  it("lets a staff member read both customers' reservations", async () => {
    const rows = await selectAs<{ id: string }>(
      STAFF,
      'select id from public.reservations order by id',
    );

    // Sorted in TS rather than assumed, so the assertion does not depend on
    // how Postgres happens to order these two uuids.
    expect(rows.map((r) => r.id)).toEqual(
      [RESERVATION_A, RESERVATION_B].sort(),
    );
  });

  it("lets a staff member confirm a customer's reservation", async () => {
    const affected = await affectedAs(
      STAFF,
      `update public.reservations set status = 'confirmed', confirmed_at = now()
        where id = $1`,
      [RESERVATION_A],
    );

    expect(affected).toBe(1);

    const [row] = await asSuperuser<{ status: string }>(
      'select status from public.reservations where id = $1',
      [RESERVATION_A],
    );

    expect(row.status).toBe('confirmed');
  });
});

describe('loyalty_stamps — read your own, and there is no customer write path', () => {
  it("returns A their own stamp and none of B's", async () => {
    const rows = await selectAs<{ id: string; customer_id: string }>(
      CUSTOMER_A,
      'select id, customer_id from public.loyalty_stamps order by id',
    );

    expect(rows).toEqual([{ id: STAMP_A, customer_id: AUTH_CUSTOMER_A }]);
  });

  it("returns nothing when A asks for B's stamp balance by id", async () => {
    // The other half of the exit condition: "requests customer B's ... stamp
    // balance by id, and asserts an empty result".
    const rows = await selectAs<{ id: string }>(
      CUSTOMER_A,
      'select id from public.loyalty_stamps where customer_id = $1',
      [AUTH_CUSTOMER_B],
    );

    expect(rows).toEqual([]);
  });

  it('rejects A granting themselves a stamp', async () => {
    // Every column is valid — real customer, real granting staff member, fresh
    // idempotency key — so nothing but the ABSENCE of an insert policy can
    // stop this. Stamps are granted at the register by staff; a customer who
    // can insert one has minted store credit.
    const err = await rejectedAs(
      CUSTOMER_A,
      `insert into public.loyalty_stamps (customer_id, granted_by, request_id)
       values ($1, $2, $3)`,
      [AUTH_CUSTOMER_A, AUTH_STAFF, STAMP_REQUEST_NEW],
    );

    expect(err.code).toBe('42501');

    expect(
      await countAsSuperuser('loyalty_stamps', 'customer_id = $1', [
        AUTH_CUSTOMER_A,
      ]),
    ).toBe(1);
  });

  it('denies A marking their own stamp as spent', async () => {
    const affected = await affectedAs(
      CUSTOMER_A,
      'update public.loyalty_stamps set consumed_by_reward_id = $1 where id = $2',
      [REWARD_A, STAMP_A],
    );

    expect(affected).toBe(0);

    const [row] = await asSuperuser<{ consumed_by_reward_id: string | null }>(
      'select consumed_by_reward_id from public.loyalty_stamps where id = $1',
      [STAMP_A],
    );

    expect(row.consumed_by_reward_id).toBeNull();
  });

  it('denies A deleting their own stamp', async () => {
    const affected = await affectedAs(
      CUSTOMER_A,
      'delete from public.loyalty_stamps where id = $1',
      [STAMP_A],
    );

    expect(affected).toBe(0);

    expect(await countAsSuperuser('loyalty_stamps', 'id = $1', [STAMP_A])).toBe(
      1,
    );
  });
});

describe('staff — self-row only, and never recursive', () => {
  it('lets a staff member read their own row', async () => {
    const rows = await selectAs<{ user_id: string; role: string }>(
      STAFF,
      'select user_id, role from public.staff',
    );

    expect(rows).toEqual([{ user_id: AUTH_STAFF, role: 'bookseller' }]);
  });

  it('shows a customer nothing in staff, and does not raise 42P17 doing it', async () => {
    // Two failures at once. A missing policy hides the roster (fine) but so
    // does a policy that recurses — `using (exists (select 1 from staff where
    // ...))` on staff ITSELF is infinite recursion, 42P17, which selectAs
    // reports by name. The self-row predicate is what avoids it, and the
    // reservations staff policies depend on this table staying queryable.
    const rows = await selectAs<{ user_id: string }>(
      CUSTOMER_A,
      'select user_id from public.staff',
    );

    expect(rows).toEqual([]);
  });
});

describe('rewards and events — deliberately still deny-all after this task', () => {
  // Both tables keep zero policies for now, and both have seeded rows, so
  // these assertions describe a real closed door rather than an empty room.
  // They are here to catch a policy added by accident — a blanket
  // `using (true)` swept across every table would go unnoticed otherwise.

  it("hides A's own reward from A", async () => {
    const rows = await selectAs<{ id: string }>(
      CUSTOMER_A,
      'select id from public.rewards',
    );

    expect(rows).toEqual([]);

    expect(await countAsSuperuser('rewards', 'id = $1', [REWARD_A])).toBe(1);
  });

  it('hides events from a signed-in customer', async () => {
    const rows = await selectAs<{ id: string }>(
      CUSTOMER_A,
      'select id from public.events',
    );

    expect(rows).toEqual([]);

    expect(await countAsSuperuser('events', 'id = $1', [EVENT_ID])).toBe(1);
  });
});

describe('an anonymous visitor sees nothing that belongs to a customer', () => {
  const PRIVATE_TABLES = [
    'customers',
    'reservations',
    'loyalty_stamps',
    'rewards',
    'staff',
    'events',
  ] as const;

  it.each(PRIVATE_TABLES)(
    'returns zero rows from %s for an anonymous session',
    async (table) => {
      // Every one of these tables is seeded, so a zero here is RLS filtering a
      // populated table — the closed door, not an empty room. `anon` carries
      // no claims, so `auth.uid()` is null and every `= auth.uid()` predicate
      // is null, which is not true: the row is filtered out.
      const rows = await selectAs<{ n: number }>(
        ANON,
        `select count(*)::int as n from public.${table}`,
      );

      expect(rows).toEqual([{ n: 0 }]);
    },
  );

  it('has something to hide in every one of those tables', async () => {
    // The control for the block above. If a table were empty, its zero would
    // prove nothing at all.
    const counts: Record<string, number> = {};

    for (const table of PRIVATE_TABLES) {
      counts[table] = await countAsSuperuser(table, 'true');
    }

    expect(counts).toEqual({
      customers: 2,
      reservations: 2,
      loyalty_stamps: 2,
      rewards: 2,
      staff: 1,
      events: 1,
    });
  });
});
