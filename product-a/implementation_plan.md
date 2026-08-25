# Riverside Books (Product A): Implementation Plan

Customer-facing catalog, reservation, and loyalty app. Search a title, see an honest stock
status, reserve a copy for pickup, and collect stamps toward a reward.

The build order below is driven by one judgment: the hard part of this product is not the UI,
it is telling the truth about a physical shelf. Phases are ordered so the parts that can be
wrong in ways a customer notices get built and tested first.

## Phase 0: Walking skeleton, deployed

**Goal.** One real title, read from the real database, rendered on a real URL. No search, no
auth, no styling worth defending.

- Next.js App Router project, TypeScript, Tailwind.
- Supabase project created, connected, one `books` row inserted by hand.
- Deployed to Vercel with the preview URL working from a phone.
- ESLint with `eslint-plugin-jsx-a11y`, Vitest configured, one passing test.
- CI: lint, then test, then deploy.

**Exit condition.** A CI run on `main` deployed a named commit to production — cite the run
number and the commit SHA, e.g. "run 214 deployed `f9935df` to production." A hand-run
`vercel deploy` does not satisfy this: it produces a working URL without proving the pipeline
behind it works. Then, on that deployed commit, a teammate opens the URL on their own phone and
sees the title.

Wire the deploy pipeline before the first manual deploy. A working hand-deployed URL removes all
pressure to check the automation behind it — which is how Product A's deploy job came to fail on
every run from `f9935df` until the token was re-minted, while this phase read as complete.

Nothing after this phase is allowed to break deployment. If a phase cannot ship, it gets split
rather than held.

## Phase 1: Data model and integrity

The most consequential phase. Everything downstream inherits whatever gets decided here, and
the two hardest bugs in this product are both prevented at this layer or not at all.

### Tables

```
books           id, isbn13 (unique), title, author, format,
                price_cents, published_on, created_at

inventory       book_id (pk, fk books), on_hand int not null default 0,
                reserved int not null default 0, counted_at timestamptz not null

customers       id (pk, = auth.uid()), display_name, member_code (unique),
                created_at

reservations    id, book_id, customer_id, status not null,
                created_at, expires_at, confirmed_at, picked_up_at

loyalty_stamps  id, customer_id, granted_by, request_id (unique),
                consumed_by_reward_id (nullable), granted_at

rewards         id, customer_id, redeemed_at, stamps_spent

staff           user_id (pk), role

events          id, title, author_guest, description, event_date,
                start_time, location, created_at
```

The full ownership/access matrix for these tables, including `events`, is published at
[`docs/schema.md`](../docs/schema.md) — that file is the copy other products should read from,
so this block and that one need to be kept in sync rather than letting either drift.

### The three constraints that matter

**1. Availability can never go negative.**

```sql
alter table inventory
  add constraint inventory_reserved_sane
  check (reserved >= 0 and reserved <= on_hand);
```

**2. Reservation status must be `not null`.** A nullable status makes every partial index and
every `where status = ...` predicate go null, and rows drop silently out of the queries meant to
catch them. Allowed values are `requested`, `confirmed`, `picked_up`, `expired`, `cancelled`,
enforced by a check constraint rather than by convention.

**3. `on_hand` and `reserved` are `not null default 0`.** Covered in the tech stack document.
Nullable columns here disable the availability check without producing an error anywhere.

### Row Level Security

Written in this phase, not later. The policies:

- `books` and `inventory`: readable by anyone, including anonymous visitors.
- `customers`: a customer reads and updates only the row where `id = auth.uid()`.
- `reservations`: a customer reads and creates only their own. Status transitions past
  `requested` are staff-only.
- `loyalty_stamps`: a customer may **read** their own and may never insert, update, or delete.
  There is no customer write path at all.
- `staff`: readable only by staff, and membership is never inferred from an email domain.

**Exit condition, and it blocks the phase.** A cross-account isolation test signs in as customer
A, requests customer B's reservations and stamp balance by id, and asserts an empty result. RLS
that has never been probed by a hostile session is an assumption, not a control. This runs in CI
from here on.

### Seed data

A fixture set of real titles and ISBNs, sourced and seeded as decided in
`tech_stack_recommendation.md` §6, labeled as fixture data wherever it appears. Roughly 150
titles is enough to make search behave like search, with a deliberate mix of in-stock,
out-of-stock, and stale-count rows so the status logic has something to show.

## Phase 2: Catalog search and honest stock display

### Search

`tsvector` over title and author with a GIN index, plus `pg_trgm` for near-miss matching. Server
Component rendering, query in the URL so a result page can be shared or reloaded.

### The stock status function

The status shown to a customer is **computed deterministically in one place**, not assembled ad
hoc in the components that display it. One pure function, one set of tests.

```
available = on_hand - reserved

available >= 1  and counted_at within 24h  ->  "On the shelf as of {time}"
available >= 1  and counted_at older       ->  "Likely on the shelf, last counted {date}"
available <= 0                             ->  "Not on the shelf right now"
```

Three rules attached, each of which came out of the market analysis:

- **No bare counts.** "3 copies left" is a stronger claim than the data supports.
- **The age is part of the status**, never hidden. Staleness is the product's main risk and the
  interface should say so rather than smooth it over.
- **Status is never carried by color alone.** A green dot is decoration. The text is the status.

### Tests

Table-driven tests over the boundaries, especially `available = 0` and the 24-hour edge, plus a
test that a stale in-stock row does not render the confident wording.

**Exit condition.** A misspelled author name returns the right book. A stale record visibly says
it is stale.

## Phase 3: Accounts and reservations

### Accounts

Supabase email one-time code. Browsing stays anonymous, and the account is only requested at the
point of reserving. The code field accepts a paste.

On first sign-in, create the `customers` row and generate a `member_code`, which is what a
bookseller enters at the register in Phase 4.

### Reserving

The write path is one atomic statement, wrapped in a Server Action:

```sql
update inventory
   set reserved = reserved + 1
 where book_id = $1
   and on_hand - reserved >= 1
returning book_id;
```

Zero rows back means the copy went while the customer was deciding, and the UI says exactly
that instead of a generic failure. The reservation row is inserted in the same transaction with
`status = 'requested'` and `expires_at = now() + 48 hours`.

### Expiry, which is the bug most likely to be missed

Nothing in the happy path releases a hold. Without a release, `reserved` only climbs, and a
title with two physical copies eventually reads as unavailable while both sit on the shelf. It
does not surface until several days in, which is after the demo and inside the real failure.

A scheduled job (Supabase cron, hourly) moves `requested` reservations past `expires_at` to
`expired` and decrements `reserved` in the same transaction. The job is idempotent, so running
it twice changes nothing.

### The language of a reservation

A reservation is a **request** until a bookseller confirms it. The confirmation email or screen
is the only place that says the book is behind the counter. The customer must not be told to
drive over on the strength of a database row.

### Tests

- **A concurrency test at the database**, two simultaneous transactions against one copy,
  asserting exactly one succeeds. Through the UI this test passes by luck.
- Expiry restores availability, and running the job twice does not double-decrement.
- A customer cannot transition their own reservation to `confirmed`.

**Exit condition.** Two browsers race for the last copy. One wins, one gets a clear message, and
`reserved` equals 1.

## Phase 4: Loyalty

### Granting

One staff-only screen: enter or scan a member code, one tap to grant. It has to beat a rubber
stamp on speed or booksellers stop using it in week two.

- Runs server-side, authenticated as staff. A customer session calling it is rejected.
- **Idempotent.** The client sends a `request_id` and a unique constraint makes the retry a
  no-op. Double taps and flaky signal at a register counter are normal, not edge cases.
- Every grant records which staff member granted it.

### Balance and redemption

Balance is the count of stamps where `consumed_by_reward_id is null`.

Redemption **consumes ten specific stamps** rather than resetting the balance to zero. A reset
silently destroys a surplus, and a customer sitting on twelve stamps who redeems and drops to
zero will notice and will be right. Redemption is a staff action for the same reason granting
is.

### The definition problem, decided here

"A stamp with each purchase" gets resolved differently by whoever implements it first, so it is
pinned now:

- **One stamp per transaction, not per item.** A single visit is one stamp regardless of basket
  size. This is a decision, not a reading of the brief, and it is the one most worth confirming
  with the store.
- **Any purchase counts**, including cards and gifts. Excluding them means booksellers making
  judgment calls at the register, which is exactly what kills adoption.
- **Event tickets do not grant a stamp in the MVP.** Product A doesn't sell tickets and has no
  transaction to grant a stamp against. This is a loyalty-semantics gap, not a data-ownership
  one: `docs/schema.md` now settles who owns the `events` table (A migrates it, B writes to it),
  but whether attending a ticketed event should count toward a reward is a separate question
  that still needs the store's input.
- **Returns do not revoke a stamp** in the MVP. Revocation needs a link from stamp to
  transaction, and there is no transaction record without a POS integration.

### Accessibility

The stamp card is the most visual thing in the app and the easiest to get wrong. Its accessible
name is "7 of 10 stamps earned," not ten images. Any celebration animation checks
`prefers-reduced-motion`.

**Exit condition.** A double-tapped grant produces one stamp. Redeeming at twelve leaves two.

## Phase 5: Not on the shelf

The path for a customer whose title is out of stock, which the phone call handles today and
which would otherwise be a dead end.

- "Tell me when it arrives" on any zero-availability title, writing to the same reservations
  table with a distinct status rather than a new one.
- A customer view of their own reservations and their status.
- Empty states throughout, since a search with no results is the most common first experience.

## Phase 6: Demo readiness

- Mobile first pass on every screen. The customer is standing up holding a phone.
- Full `axe-core` run, keyboard-only walkthrough, and a check of every tap target against the
  24 by 24 pixel minimum.
- Seed the demo data so all three stock states and a partially filled stamp card are visible
  without setup.
- A written script for the reservation race, because it is the most convincing thing to show and
  it needs two devices.

## Testing, throughout

Behavioral tests against public behavior rather than internals, so the implementation stays free
to change. Four tests are treated as non-negotiable, and each maps to a failure a customer would
personally experience:

| Test | Failure it prevents |
|---|---|
| Cross-account isolation | One customer reads another's data |
| Reservation concurrency | Two customers promised one copy |
| Expiry release and idempotency | Books permanently invisible while in stock |
| Stamp grant idempotency | Duplicate stamps from one purchase |

## Task decomposition

Each task touches at most five files.

| # | Task | Phase |
|---|---|---|
| 1 | Scaffold, lint, test, CI, deploy | 0 |
| 2 | Schema migration and constraints | 1 |
| 3 | RLS policies | 1 |
| 4 | Cross-account isolation test | 1 |
| 5 | Seed script and fixture data | 1 |
| 6 | Search query and index | 2 |
| 7 | Stock status function and tests | 2 |
| 8 | Search UI and result list | 2 |
| 9 | Auth and customer creation | 3 |
| 10 | Reserve action and concurrency test | 3 |
| 11 | Expiry job and tests | 3 |
| 12 | Staff grant screen and endpoint | 4 |
| 13 | Balance, redemption, stamp card | 4 |
| 14 | Notify-me and reservation list | 5 |
| 15 | Accessibility and mobile pass | 6 |

## The cross-team schema contract

**This blocks Phase 1 and it is the highest-risk open item in the project.**

Products A, B, and C all touch the same inventory data. Product A writes it. Product B reads
stock levels and the pending reservation queue. Product C answers "is this in stock right now,"
which is only possible against the same rows.

If each teammate stands up a separate Supabase project, B has nothing real to display and C
cannot do the thing its brief describes. That does not surface as an error. It surfaces on the
last afternoon before the demo, when the four products turn out to be four disconnected apps.

**Proposal to bring to the group:** one shared Supabase project. Product A owns and migrates
`books`, `inventory`, `reservations`, and now `events`. B and C read them and do not migrate
them. B owns any staff-side tables it needs, and D owns its own.

`events` was added to A's migration set to close cross-team TODO item 1 — see
[`docs/schema.md`](../docs/schema.md) for the field list and the reasoning. Product C's own
implementation plan had already stood up a provisional `events` shape while this was
unresolved; C should switch to reading the shared table once this lands rather than keeping its
own copy.

Two things must be agreed alongside it. Product B needs a write path to `inventory.on_hand` and
`counted_at`, because reconciling the physical count is B's job and A's honesty depends on it.
And the staff role check has to be shared, or A and B will each invent one.

## Open decisions

- ~~**Shared Supabase project or four separate ones.**~~ **Resolved.** One shared project; `docs/schema.md` is the contract and Product A owns and migrates every table in it. The seven core tables and their RLS policies are migrated and enforced in CI, so this no longer blocks anything.

### Phase 1 hardening, carried out of the Tasks 3+4 RLS audit

Four items the cross-account isolation work surfaced. The first is live now, not gated behind a future task — `reservations_customer_insert` merged in the same migration this audit covers, so there is no app UI standing between it and a real request. The other three are hardening, cheap while the surface is small.

- **`expires_at` is client-settable on `reservations_customer_insert`, and this is current priority, not Task-10-gated.** The policy's `with check` constrains only `customer_id` and `status`, so a customer inserting their own reservation may also set `expires_at`, `confirmed_at`, and `picked_up_at`. `expires_at` is the sharp one: it decides how long a scarce copy is held, and it is the expiry sweep's input. Reservation state taken from client input is exactly what the data-integrity form of the Integrity Boundary forbids. The policy is merged now, and per `SECURITY.md` ("the anon key is safe to expose client-side by design — RLS is what makes it safe"), Postgres is the actual boundary here, the same way it is for the `anon` SELECT grants below — a client with a valid session can reach this via Supabase's REST API directly, with no Next.js route required. Fix by extending the `with check` to require those three columns be null, or by setting `expires_at` from a database default, before Task 10 builds the real insert flow on top of it — closing it later means retrofitting onto a policy something else may already depend on.
- **Three grants are backed by no policy**: `update`/`delete` on `loyalty_stamps` and `delete` on `reservations`, all to `authenticated`. They exist because the denial tests assert "zero rows affected" and would otherwise see a `42501` raised instead. Inert as written, but a grant that pre-authorizes a table-wide write is one line of a future migration away from being live. Fix from the test side first: accept either a zero-row result or a `42501` as a valid denial, then drop the grants.
- **The absent write grants are unpinned, because `42501` is ambiguous.** Postgres returns `42501` for both "permission denied for table" and "new row violates row-level security policy", so `rejects A granting themselves a stamp` would still pass if someone later added `grant insert on loyalty_stamps`. The same blindness covers `staff`, which has no write test at all — the privilege-escalation path (insert yourself into `staff`, then read every reservation) is held shut by an absent grant that nothing observes. Pin the whole absent-write matrix with `has_table_privilege` assertions.
- **Any future policy on the six private tables must name its roles explicitly.** `anon` holds SELECT on all of them — required, since it is what makes them answer "zero rows" rather than raising — so a policy written without a `to` clause applies to PUBLIC and opens the table in one line. The anon test block catches this for SELECT; it does not catch a `to`-less INSERT policy paired with a write grant. This constrains `events` in particular, which Products C and D read.

- **Does the store already run a POS with loyalty?** If so, Phase 4 changes shape or disappears.
- **One stamp per transaction or per item**, and whether event tickets count.
- **Is online payment required?** This plan assumes pay at pickup and says so in the UI.
- **48-hour reservation expiry** is a guess. A real bookstore may want the end of the next day.
- **True pre-order of unpublished titles** is out of scope and needs confirming, since the brief
  uses the word "pre-order" in a way that reads as reservation.

## Unverified

The schema and RLS SQL is no longer unverified: the seven core tables, their constraints, and the nine policies in `20260824121500_rls_policies.sql` are applied against a real Postgres by `ci-product-a` on every push, and 79 database tests run against them. What remains unverified here is any SQL still only described in prose in this document — the Phase 2 search index and the Phase 3 reservation and expiry statements — which has not been executed and should be treated as unverified until it is.

Four findings here are carried forward from the previous cycle's review rather than rediscovered:
enforcing correctness at the database instead of the client, `not null` on any column a partial
predicate depends on, pinning ambiguous business definitions before implementation, and refusing
to write competitor pricing from memory.
