# Product B: Staff Inventory & Ops Dashboard — Orientation Notes

Captured from the kickoff conversation on 2026-08-18, before any planning docs or code exist.
This is a snapshot of context and decisions, not a spec — treat `implementation_plan.md` and
`tech_stack_recommendation.md` (once written, mirroring Product A's docs) as the authoritative
build plan.

## Brief (from `docs/Cycle 4_ Project briefs.md`)

Gives staff a live view of stock levels by title, flags titles that are low or out of stock, and
lists pending pre-orders that need to be prepared.

Example dashboard metrics called out by the owner:

- Books currently in stock
- Low-stock titles
- Out-of-stock titles
- Pending pre-orders
- Recently sold titles
- Most frequently requested books

## State as of kickoff

- `product-b/` did not exist. No docs, no scaffolding, no code.
- Owner: [@Cheewaiyip](https://github.com/Cheewaiyip), per `.github/CODEOWNERS`.
- Product A (`product-a/`) already has `tech_stack_recommendation.md`, `market_strategy.md`, and
  `implementation_plan.md`, but is itself unscaffolded — no `package.json`, no app code yet.

## Cross-team schema decision — agreed

Product A's implementation plan flagged the shared-Supabase-project question as blocking and
unresolved. **Confirmed with the team at kickoff: the shared-project approach is agreed.**

- **Product A owns and migrates** `books`, `inventory`, and `reservations`.
- **Product B reads** those tables and does **not** migrate them.
- **Product B needs a write path** to `inventory.on_hand` and `inventory.counted_at` —
  reconciling the physical count against the database is Product B's job, and Product A's
  stock-status honesty depends on B actually doing it.
- **The staff-role check must be shared** between A and B (a single `staff` table / role check,
  not two independently invented ones). **Confirmed** — the canonical `staff (user_id pk, role)`
  shape is now published in [`docs/schema.md`](../docs/schema.md#staff), which Product B reads
  from rather than defining a parallel table.
- Product B does **not** own any staff-side tables beyond that shared role check.

## Sales and demand data (resolved)

Two of the requested dashboard metrics had no backing table in Product A's schema:

- **Recently sold titles** — Product A's schema has no purchase/transaction table. Loyalty
  stamps (`loyalty_stamps`) record a grant, not a sale, and aren't a reliable proxy for "what
  sold." **Cut from scope** — inventing a `sales` table means staff double-entry at the register,
  which breaks the "must beat a paper log" speed requirement this product exists to satisfy. If a
  real POS integration happens later, this becomes buildable; until then it stays out.
- **Most frequently requested books** — **derived from `reservations`**, rolling 30-day window. A
  request that never converts still records demand, so this is free to build against data that
  already exists.

See [`implementation_plan.md` Phase 2](implementation_plan.md#phase-2-dashboard-reads) for the
built-out version of both decisions.

## Stack (inherited from Product A / CLAUDE.md, not yet confirmed for B specifically)

Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth), deployed on Vercel — same
project and deploy target as Product A, connecting to the same Supabase project per the schema
decision above.

## Next steps

- [x] Confirm the shared `staff` table / role check with @rhaeyyan before writing any auth code.
      Resolved — Product A's migration and RLS policies are merged, and the canonical shape
      matches `docs/schema.md#staff` exactly. See `implementation_plan.md` Phase 1.
- [x] Resolve the sales/demand-tracking gap. Settled by the cross-team recommended resolution:
      cut "recently sold titles," derive "most frequently requested" from `reservations`
      (30-day window) — see `implementation_plan.md` Phase 2.
- [x] Write `product-b/tech_stack_recommendation.md` and `product-b/implementation_plan.md`
      mirroring Product A's docs, phased with exit conditions.
- [ ] Phase 0 scaffold: Next.js project, connect to the shared Supabase project, one real metric
      rendered on a deployed URL.

`docs/assumptions.md` is also drafted (proposed default for the POS assumption and the store's
operating profile) — open for review by all four owners, not yet team-confirmed.
