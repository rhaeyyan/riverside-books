# Riverside Books: Stated Operating Assumptions

Riverside Books is a fictional store. No product in this repo has any user or staff research —
every competitor claim is desk research, and nothing here has been interviewed or observed. That
gap is unresolvable for a fictional store, but leaving it implied means each product invents its
own version silently. This document states the assumptions once, so all four products build
against the same store.

This resolves two items from [`TODO.md`](../TODO.md#cross-team--blocks-more-than-one-product):
the POS question, and the missing-research gap generally. Proposed by Product B, since B's
reconciliation UI and Product C's staleness threshold are the two designs most load-bearing on
these answers — open to amendment by any of the four owners.

## No POS exists

**Assumption: Riverside runs no point-of-sale system with inventory tracking or loyalty
support today.**

The brief states the store manages inventory, orders, and customer communication "through a mix
of memory, sticky notes, and a basic spreadsheet." A store running Square, Shopify, or Clover
with inventory and loyalty modules already has both problems these four products solve. Assuming
otherwise removes the reason for three of the four products to exist.

Consequence: no product should gate a feature on "if the store already has a POS." Product A's
loyalty grant and Product B's stock reconciliation are both first-party, staff-triggered writes,
not integrations.

## How the store operates

These are load-bearing for Product B's reconciliation UI (how fast does an update need to be)
and Product C's staleness threshold (how much can the count drift before it's misleading). Not
researched — stated once so they're reviewable rather than assumed differently by each product.

- **Staffing.** One owner plus two part-time booksellers. Typically one person is at the
  register at a time; the owner is not always on-site.
- **Catalog size.** A few thousand titles, per Product A's tech stack recommendation — a
  single-location shop, not a warehouse.
- **Stock movement.** Modest volume for an independent store: on the order of tens of sales a
  day, not hundreds. Most titles move slowly; a handful of frontlist and staff-pick titles move
  faster.
- **Who counts, and when.** No dedicated inventory shift. Reconciliation happens opportunistically
  — a bookseller updates a count when they notice a discrepancy (pulling a pre-order, restocking
  a shelf), not on a fixed schedule. There is no nightly close-out process today; the paper log
  is updated whenever someone remembers to.

## What this settles

- Product B's reconciliation interaction should optimize for a single opportunistic update, not
  a scheduled batch session — there is no evening count to design a batch UI around today.
- Product C's confidence threshold can assume counts go stale gradually (no POS driving
  real-time decrement), which supports a fixed staleness window rather than a tighter one.
- Any product that would need "hundreds of transactions per hour" throughput is over-building
  for this store.

## Open

This document does not resolve the sales/demand-data gap (`TODO.md` cross-team item 3) — that's
a schema decision, not an operating assumption, and is addressed separately in
[`product-b/implementation_plan.md`](../product-b/implementation_plan.md).
