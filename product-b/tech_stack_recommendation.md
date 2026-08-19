# Tech Stack Recommendation: Riverside Books (Product B)

Product B is the staff-facing inventory dashboard and reconciliation surface. Two properties
drive the choices below, mirrored from Product A's own two but read from the write side.

First, **the users are trusted, and there are only three of them.** Unlike Product A, every
session is a known staff member, not an anonymous member of the public. That changes what needs
defending — there is no currency to steal — but it does not relax the correctness requirement on
the data itself.

Second, **Product B is the only write path to inventory truth.** Per the agreed cross-team
schema (see [`context.md`](context.md)), Product A owns and migrates `books`, `inventory`, and
`reservations`. Product B reads them and holds the sole write path to `inventory.on_hand` and
`inventory.counted_at`. Every stock status Product A shows a customer is only as fresh as the
last reconciliation through this app.

## 1. Framework: Next.js (App Router) on Vercel

Same choice as Product A, for a narrower reason: a trusted server is still needed to run the
reconciliation write authenticated as staff, and a second framework for a second internal tool
buys nothing. Server Components suit the dashboard's read path — mostly aggregate counts, mostly
cacheable for short windows.

**Separate Next.js project and Vercel deployment from Product A.** Same Supabase project, per
the schema decision, but a distinct app: a customer catalog and a staff dashboard have no reason
to share a deploy, a domain, or a bundle.

## 2. Database and auth: the shared Supabase project

Postgres with Row Level Security, plus Supabase Auth for staff identity — same project as
Product A, not a second one. Product B does not migrate `books`, `inventory`, or `reservations`.

**Staff identity: Product A's `staff (user_id pk, role)` table, not a parallel one.** Two
independently invented staff tables is the exact failure the cross-team schema decision exists
to prevent. This is still pending explicit confirmation with [@rhaeyyan](https://github.com/rhaeyyan)
per [`context.md`](context.md) and blocks any auth code — tracked as an open item below, not
assumed resolved by this document.

### Row Level Security

- `books` and `inventory`: read policy already exists from Product A (world-readable). Product B
  adds nothing here.
- `inventory` write: staff-only. A session must resolve to a row in `staff` with an authorized
  role before an update to `on_hand` or `counted_at` is accepted. No customer session can reach
  this path at all — it is not exposed by Product A's app.
- `reservations` read (for the pending pre-order queue and the most-requested count): staff-only
  read across all customers' reservations, which is a broader read than any policy Product A
  needs for its own customer-facing use. This is a new RLS policy on an existing table B does not
  own — written in coordination with Product A, not unilaterally.

**No cross-account isolation test is needed here the way Product A needs one.** There is no
customer-facing session that can reach this app at all; the boundary that matters is
staff-vs-anonymous, not staff-vs-staff. A test that an unauthenticated or non-staff session gets
rejected from both the read and write paths is the equivalent exit condition.

## 3. The reconciliation write, solved atomically

`on_hand` and `counted_at` must change in the same write, or a stock number goes back to being
the bare, unaged claim Product A's display logic exists to avoid. One statement enforces it by
construction:

```sql
update inventory
   set on_hand = $2,
       counted_at = now()
 where book_id = $1
returning on_hand, counted_at;
```

There is no code path that can write one column without the other, because there is no second
statement to skip.

**A recount can find fewer physical copies than are currently reserved, and that has to fail
loudly, not silently.** Product A's `inventory_reserved_sane` check constraint
(`reserved >= 0 and reserved <= on_hand`) already forbids writing an `on_hand` below the current
`reserved` count — the database rejects the statement above outright rather than accepting a
number that would say fewer books exist than are already promised to customers. That constraint
is the correctness backstop and stays authoritative, per the non-negotiable rule in
[`CLAUDE.md`](../CLAUDE.md). What's missing without this section is the caller's response: a raw
`23514` constraint-violation error is not something a bookseller should see. The write path reads
the current `reserved` value alongside `on_hand` before rendering the reconciliation screen, so
the UI can warn before the count is even submitted, and it also catches the constraint violation
as a hard backstop on save, translated to a specific message — "N copies are already reserved;
recount can't go below that until a reservation is fulfilled or expires" — rather than a generic
save failure. See [`implementation_plan.md`](implementation_plan.md#phase-1-staff-auth-and-the-write-path)
for where this lands in the build.

**Deliberately not building optimistic concurrency control for this write.** Product A's
reservation race needs a conditional update because two customers can race for one copy at the
same instant. Two booksellers overwriting each other's count is a different failure: the store
has two part-time booksellers, rarely both reconciling the same title at once, and the correct
resolution when it does happen is "the most recent physical count wins," which last-write-wins
already gives for free. Adding a version column or a conflict UI here is solving a problem this
store does not have — see [`docs/assumptions.md`](../docs/assumptions.md) on staffing.

## 4. Dashboard read queries

### Low stock and out of stock

Computed the same way Product A computes stock status — one pure function, not assembled ad hoc
per component:

```
available = on_hand - reserved

available <= 0            ->  out of stock
0 < available <= threshold ->  low stock
available > threshold      ->  in stock
```

**Threshold: a fixed default (`available <= 2`), not a per-title or par-level threshold, for the
MVP.** A per-title threshold is more accurate — a title that sells one copy a month and one that
sells one a week are not the same "low" — but it requires staff to set and maintain a
per-title value the store has never tracked before, which is a second new habit on top of the
reconciliation habit this product is already asking for. A fixed number ships something staff can
use immediately; a per-title override is a later addition once the flat threshold's false
positives (or misses) on fast- and slow-moving titles are visible in practice. This is Product B's
own call, not derived from the brief, and is worth confirming with the store owner if this were
real.

### Pending pre-orders

`reservations` where `status = 'requested'`, read-only from Product B's side — Product B never
transitions a reservation's status; that stays Product A's job per the schema decision.

### Most frequently requested books

Derived from `reservations`, following the *proposed* cross-team resolution to cut "recently sold
titles" (no sales table exists, and inventing one means staff double-entry at the register — see
[`TODO.md`](../TODO.md#recommended-resolutions)) and build "most requested" from `reservations`
instead, since every request already lands there regardless of whether it converts. That's
Product B's preferred default, not yet ratified by the other three owners — the cross-team TODO
item is still open for exactly that reason, and this section moves if the sync lands elsewhere.

**Window: rolling 30 days, not all-time.** An all-time count only ever surfaces old backlist
titles that accumulated requests over months; a rolling window tracks what is in demand now,
which is the more useful staff signal and the one that changes week to week. This is Product B's
own call and is flagged as such — nothing in the brief specifies a window.

## 5. UI: Tailwind, no headless-primitive requirement

Tailwind for styling, consistent with the rest of the stack. Unlike Product A's public combobox,
Product B has no complex interactive widget that needs a headless primitive — a search-and-filter
list and a numeric input are standard HTML form controls.

**Accessibility still applies.** This is a work tool three specific people use daily, and poor
accessibility here is a hiring and retention problem, not a hypothetical one. Status still carries
text, not color alone; tap targets still meet the 24 by 24 CSS pixel minimum, since the likely
device at a register is a phone or tablet, not a desktop.

## 6. Testing and tooling

- **Vitest and Testing Library** for the stock-threshold function and dashboard queries, same
  pattern as Product A's stock-status function.
- **An integration test for the atomic reconciliation write**, asserting `on_hand` and
  `counted_at` always change together — there is no code path to test for skipping one, but the
  test documents the invariant and catches a future refactor that adds one.
- **A staff-only access test**: an unauthenticated or non-staff session is rejected from both the
  dashboard read and the reconciliation write.
- **GitHub Actions**: lint, then test, then deploy, matching Product A's CI shape per
  [`CLAUDE.md`](../CLAUDE.md).

Deliberately not added: a reservation-concurrency-style test. There is no race condition on
this app's write path — see section 3.

## Summary

| Layer | Choice | One-line reason |
|---|---|---|
| Framework | Next.js App Router | Trusted server for the staff-only write |
| Hosting | Vercel, separate project from A | Distinct app, same Supabase backend |
| Database | Shared Supabase project | B reads A's tables, writes none of its own |
| Auth | Supabase Auth + A's `staff` table | One staff-role check, not two invented ones |
| Reconciliation write | Single atomic `update` | `on_hand` and `counted_at` cannot drift apart |
| Concurrency control | None (last-write-wins) | Two-person staff, no real race to solve |
| Low-stock threshold | Fixed default, `available <= 2` | Ships without a new per-title data entry habit |
| Most-requested query | `reservations`, rolling 30 days | Real signal that already exists, no new table |
| Styling | Tailwind, standard form controls | No widget here needs a headless primitive |

## Open items

- **The shared `staff` table is not yet confirmed with @rhaeyyan.** This blocks all auth and RLS
  work in Phase 1 of the implementation plan, not just a nice-to-have.
- **The fixed low-stock threshold and the 30-day request window are both this document's own
  calls**, not settled with the store. Flagged, not hidden, per the assumptions this store
  requires — see [`docs/assumptions.md`](../docs/assumptions.md).
- **The `reservations` read policy for staff is new and needs Product A's sign-off**, since
  Product A owns that table's RLS today.
- Nothing in this document has been run. The SQL is standard and unverified by execution, same
  standing caveat as Product A's tech stack document.
