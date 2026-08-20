# Product B app — Staff Inventory & Ops Dashboard

The Product B app for Riverside Books: live stock by title, low/out-of-stock flags, and pending
pre-orders for staff to prepare. See [`../product-b/`](../product-b/) for the strategy, tech
stack, and phased implementation plan this app builds against.

## Current state

Phase 0 walking skeleton — scaffolding only. The dashboard page is not yet wired to the shared
Supabase project; the "total books in stock" stat is a placeholder. See
[`../product-b/implementation_plan.md`](../product-b/implementation_plan.md#phase-0-walking-skeleton-deployed)
for the exit condition this app hasn't met yet.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```
