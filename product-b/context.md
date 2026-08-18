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
  not two independently invented ones). Product A's plan defines `staff (user_id pk, role)` —
  Product B should use that table, not create a parallel one, and this needs explicit
  confirmation with @rhaeyyan before Product B's auth work starts.
- Product B does own any staff-side tables beyond that shared role check.

## Open gap: no sales/demand data yet

Two of the requested dashboard metrics have no backing table in Product A's schema as currently
planned:

- **Recently sold titles** — Product A's schema has no purchase/transaction table. Loyalty
  stamps (`loyalty_stamps`) record a grant, not a sale, and aren't a reliable proxy for "what
  sold."
- **Most frequently requested books** — could plausibly be derived from `reservations` (a
  request that never converts) or from a separate demand-signal table, but this isn't decided.

This needs a decision, ideally owned by whoever's schema it extends: either Product B adds a
`sales` (or similar) table it owns and staff record sales into at the register, or this waits on
a POS integration that doesn't exist yet. Until resolved, "recently sold" and "most requested"
can't be built against real data.

## Stack (inherited from Product A / CLAUDE.md, not yet confirmed for B specifically)

Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth), deployed on Vercel — same
project and deploy target as Product A, connecting to the same Supabase project per the schema
decision above.

## Next steps (not yet started)

- [ ] Confirm the shared `staff` table / role check with @rhaeyyan before writing any auth code.
- [ ] Resolve the sales/demand-tracking gap (who owns the table, what triggers a write).
- [ ] Write `product-b/tech_stack_recommendation.md` and `product-b/implementation_plan.md`
      mirroring Product A's docs, phased with exit conditions.
- [ ] Phase 0 scaffold: Next.js project, connect to the shared Supabase project, one real metric
      rendered on a deployed URL.
