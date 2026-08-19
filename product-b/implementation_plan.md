# Riverside Books (Product B): Implementation Plan

Staff-facing inventory dashboard and reconciliation surface. Show what's on the shelf, flag what's
low or out, list what's waiting to be pulled for pickup, and give a bookseller a fast way to fix
a stock count when it's wrong.

The build order below is driven by the same judgment Product A's plan makes from the read side:
the hard part is not the UI, it is keeping the one write path to inventory truth honest. Phases
are ordered so the write that everything else depends on gets built and tested before the read
views that display its output.

## Phase 0: Walking skeleton, deployed

**Goal.** One real dashboard metric, read from the shared Supabase project, rendered on a real
URL.

- Next.js App Router project, TypeScript, Tailwind — separate Vercel deployment from Product A,
  same Supabase project (per [`tech_stack_recommendation.md`](tech_stack_recommendation.md) §2).
- Interim auth: any authenticated Supabase session, staff-role check deferred to Phase 1 pending
  the `staff` table confirmation below. Not exposed publicly — a preview URL is acceptable for a
  walking skeleton, but nothing beyond Phase 0 ships without the real staff check.
- One metric — total books in stock (`sum(on_hand)` across `inventory`) — rendered from a live
  query against Product A's existing tables.
- ESLint, Vitest configured, one passing test. CI: lint, then test, then deploy.

**Exit condition.** A teammate opens the preview URL and sees a real number that matches the
current seed data in the shared Supabase project.

Nothing after this phase is allowed to break deployment, per [`CLAUDE.md`](../CLAUDE.md).

## Phase 1: Staff auth and the write path

The most consequential phase — everything downstream, both read and write, depends on staff
identity being resolved correctly.

### Blocking dependency

**Confirm the shared `staff (user_id pk, role)` table with [@rhaeyyan](https://github.com/rhaeyyan)
before writing any auth code in this phase.** This is listed as a blocking open item in
[`context.md`](context.md) and is still unresolved. If it is not confirmed by the time this phase
starts, Product B needs an explicit interim decision (a duplicate table, flagged as temporary) —
building against an assumed table Product A might not actually expose is the failure this
confirmation step exists to prevent.

### The reconciliation write

One atomic statement, per [`tech_stack_recommendation.md`](tech_stack_recommendation.md#3-the-reconciliation-write-solved-atomically):

```sql
update inventory
   set on_hand = $2,
       counted_at = now()
 where book_id = $1
returning on_hand, counted_at;
```

Wrapped in a Server Action, authenticated as staff. A non-staff or unauthenticated session is
rejected before the query runs, not filtered after.

### Row Level Security

- `inventory` write: staff-only, checked against `staff`, not against an email domain or a
  client-supplied claim.
- `reservations` read: staff-only read across all customers' reservations, needed for the pending
  pre-order queue and the most-requested count in Phase 2. This is a new policy on a table
  Product A owns — coordinate before merging, don't add it unilaterally.

### Tests

- A staff-only access test: an unauthenticated or non-staff session is rejected from the
  reconciliation write.
- An integration test asserting `on_hand` and `counted_at` always change together on a
  reconciliation write.

**Exit condition.** A staff session updates a stock count through the write path, and both
`on_hand` and `counted_at` change in the database. A non-staff session attempting the same write
is rejected.

## Phase 2: Dashboard reads

### Low stock and out of stock

The threshold function decided in
[`tech_stack_recommendation.md` §4](tech_stack_recommendation.md#4-dashboard-read-queries):
`available = on_hand - reserved`, fixed default threshold `available <= 2` for "low," `available
<= 0` for "out." One pure function, table-driven tests over the boundary the same way Product A
tests its stock-status function.

### Pending pre-orders

`reservations` where `status = 'requested'`, read-only. Product B never writes a reservation's
status.

### Most frequently requested books

`reservations` grouped by `book_id`, rolling 30-day window, per the cross-team resolution to
derive demand from `reservations` rather than inventing a `sales` table
(see [`TODO.md`](../TODO.md#recommended-resolutions)).

### Cut: recently sold titles

Not built. No sales/transaction table exists, and per the cross-team recommended resolution,
none will — inventing one means staff double-entry at the register, which breaks the "must beat
a paper log" requirement this whole product exists to satisfy. If a real POS integration happens
later, this metric becomes buildable; until then it stays out of scope rather than faked from a
proxy that doesn't mean the same thing.

### Tests

Table-driven tests over the low/out-of-stock boundary, plus a test that the most-requested query
respects the 30-day window (a request from 40 days ago does not count).

**Exit condition.** The dashboard shows accurate in-stock, low-stock, out-of-stock counts, a
pending pre-order list, and a most-requested list, all against the shared Supabase project's real
data — no mocked numbers.

## Phase 3: The reconciliation UI

One screen: search or scan a title, see its current `on_hand`, enter a new count, save.

- **One interaction, not two.** Per [`docs/assumptions.md`](../docs/assumptions.md), there is no
  scheduled evening count at this store today — reconciliation happens opportunistically. Building
  a separate batch-entry mode for a workflow that doesn't exist is speculative scope; a single
  fast single-title update serves both "I noticed this is wrong right now" and "I'm doing a
  deliberate walk of the shelf, one title at a time."
- **Has to beat crossing something off a paper log**, per
  [`market_strategy.md`](market_strategy.md#the-reconciliation-problem). One search field, one
  number field, one save action — no intermediate confirmation screen.
- Every write goes through the atomic statement from Phase 1. There is no code path in this UI
  that can update `on_hand` without `counted_at`.

**Exit condition.** A bookseller reconciles a title's count in under the time it takes to cross a
line off a paper log — measured informally, not benchmarked, since there's no real paper log to
race against.

## Phase 4: Demo readiness

- Mobile and tablet pass on the dashboard and the reconciliation screen — the plausible device at
  a register is a phone or tablet, not a desktop, per
  [`tech_stack_recommendation.md` §5](tech_stack_recommendation.md#5-ui-tailwind-no-headless-primitive-requirement).
- Seed data with a deliberate mix of in-stock, low-stock, out-of-stock, and stale-`counted_at`
  rows, reusing Product A's fixture set rather than inventing a second one.
- A written script showing a stale count getting caught and corrected through the reconciliation
  screen, then reflected in Product A's stock display — the strongest demo of why this product
  exists.

## Testing, throughout

| Test | Failure it prevents |
|---|---|
| Staff-only access (read and write) | A non-staff or anonymous session reaches inventory data or the write path |
| Atomic reconciliation write | `on_hand` and `counted_at` drift apart |
| Low/out-of-stock boundary | Off-by-one at the threshold misclassifies a title |
| Most-requested window | Stale demand data displaces what's actually popular now |

## Task decomposition

Each task touches at most five files.

| # | Task | Phase |
|---|---|---|
| 1 | Scaffold, lint, test, CI, deploy | 0 |
| 2 | Interim auth and one live metric | 0 |
| 3 | Confirm `staff` table with @rhaeyyan; staff-role check | 1 |
| 4 | Reconciliation write (Server Action) and RLS | 1 |
| 5 | Staff-only access test and atomic-write test | 1 |
| 6 | Low/out-of-stock threshold function and tests | 2 |
| 7 | Pending pre-order query | 2 |
| 8 | Most-requested query and window test | 2 |
| 9 | Dashboard UI | 2 |
| 10 | Reconciliation screen | 3 |
| 11 | Mobile/tablet pass and demo seed data | 4 |

## Open decisions

- **The `staff` table confirmation with @rhaeyyan** — blocks Phase 1, tracked in
  [`TODO.md`](../TODO.md#product-b--staff-inventory--ops-dashboard) as still open.
- **The fixed `available <= 2` low-stock threshold and the 30-day most-requested window** are
  both this plan's own calls, not settled with the store — see
  [`tech_stack_recommendation.md`](tech_stack_recommendation.md#open-items).
- **"Recently sold titles" stays cut** unless a real POS or transaction record shows up later.
- The `reservations` staff-read RLS policy needs Product A's sign-off before it merges, since
  Product A owns that table.

## Unverified

None of the SQL in this document has been executed, same standing caveat as Product A's
implementation plan. The reconciliation write statement is standard and untested against a real
Postgres instance.
