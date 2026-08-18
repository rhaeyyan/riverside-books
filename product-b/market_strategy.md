# Riverside Books (Product B): Market and Feature Strategy

## Overview

Product B is the staff-facing half of the Riverside Books suite. It gives the owner and the two
part-time booksellers a live view of stock by title, flags what is low or out, and lists the
pending pre-orders that need to be pulled and set aside.

Where Product A's strategy is about winning a customer's trust in a stock number, Product B's is
about *producing* that number honestly in the first place. Product A's own market strategy names
this directly: the store has no accurate inventory data today, none of the four products creates
any on their own, and "the store needs a reconciliation path, which is Product B's job. Product B
is therefore not optional for Product A to be honest." Product B is not a nice-to-have dashboard
sitting alongside the customer app — it is the thing that makes the customer app's core promise
true or false.

That reframes what "market" means here. Product B is not competing for a customer's attention. It
is competing against the way two people currently keep track of a few thousand books, and it only
wins if it is faster than what it replaces. A dashboard nobody updates is worse than a paper log,
because a paper log's staleness is at least visible to the person holding it.

## Who this actually competes with

### 0. Memory and the paper log (the incumbent)

The brief states this plainly: staff "track inventory levels by memory or a paper log, so no one
notices a book is out of stock until a customer asks for it." That is the system Product B
replaces, and like Product A's phone call, it is a stronger incumbent than it looks.

A paper log costs nothing, needs no login, survives a power outage, and is updated by the person
standing at the shelf, which is the only place stock truth exists. It fails in one specific way
that matters: nothing surfaces a low or zero count until a customer asks, because nothing is
watching the numbers between updates. That is the exact wedge — Product B's job is to watch, not
to replace the physical count.

### 1. The basic spreadsheet

Also named directly in the brief, alongside memory and sticky notes. A spreadsheet is a real step
up from paper — it can sort, and a formula can flag a low count — but it has three specific
weaknesses for this store:

- **Nobody is looking at it unprompted.** A conditional-format cell only helps the person who has
  the sheet open. It does not push a "check this" signal to whoever is at the register.
- **It has no connection to what customers see.** A spreadsheet count and Product A's displayed
  stock status are two numbers that can silently disagree, and neither system knows the other
  exists.
- **It has no notion of a pending pre-order queue.** A spreadsheet tracks counts, not the list of
  reservations sitting in `requested` status that someone still needs to pull.

### 2. POS-integrated inventory (Square for Retail, Shopify POS, Clover)

General retail point-of-sale systems bundle inventory tracking and low-stock alerts as a
standard feature. If Riverside already runs one of these at the register, it is the most direct
competitor to Product B, for the same reason Square/Shopify loyalty add-ons are named as the most
direct competitor to Product A's loyalty half in that product's strategy doc.

**Whether Riverside runs a POS with inventory tracking today is unknown and unverified.** This is
the single most important fact to establish before building Product B, for the same reason it
matters for Product A's loyalty feature: if one already exists, Product B either integrates with
it or duplicates it, and duplicated inventory counts are worse than one wrong count, because now
staff must decide which system to believe. Feature depth and pricing for these platforms: **not
verified against a current pricing page and should not be quoted.**

### 3. Book-trade-specific inventory and POS systems (e.g. Bookmanager, Above the Treeline / Edelweiss, IndieCommerce's backend)

The book trade has its own category of inventory tools built specifically for independent
bookstores — title-level catalog data, ISBN lookups, and distributor integration in some cases.
These are the closest thing to a purpose-built competitor, the same role IndieCommerce plays
against Product A.

The wedge is the same shape as Product A's: these platforms are built to run a store's full
inventory and purchasing operation, which is a much bigger commitment than a single-location shop
with two part-time booksellers may want. Product B's bet is that a narrow, fast dashboard beats a
full inventory-management suite for a store this size. **Feature set, cost, and whether any
distributor integration is realistic for Riverside are all unverified** and should not be assumed
before someone checks.

### 4. Generic inventory-management SaaS (Sortly, inFlow, Zoho Inventory)

General-purpose small-business inventory tools exist outside the book trade entirely. They are
worth naming only to rule out: none of them know what a "pending pre-order" is in this store's
sense, because that concept only exists once Product A's `reservations` table exists. Any generic
tool would need Riverside to duplicate reservation data by hand, which defeats the purpose.

## The reconciliation problem

This is the strategic center of the product, and it is a data-integrity problem before it is a
UI problem, the same way Product A's stock-accuracy problem is.

Per the agreed cross-team schema (see [`context.md`](context.md)), Product A owns and migrates
`books`, `inventory`, and `reservations`. Product B reads them and holds the **write path** to
`inventory.on_hand` and `inventory.counted_at`. That single write path is Product B's entire
reason to exist from Product A's point of view: every stock status Product A shows a customer is
only as fresh as the last time a bookseller reconciled it through Product B.

Three consequences follow, mirrored from Product A's own three rules but from the write side
rather than the read side:

1. **The reconciliation action has to be fast enough that staff actually do it.** Product A's
   loyalty grant has to beat a rubber stamp on speed or staff stop using it; Product B's count
   update has to beat crossing something off a paper log, or the paper log wins by default.
2. **`counted_at` must update every time `on_hand` does, in the same write.** A stock number with
   no timestamp is exactly the bare, unaged claim Product A's display logic is built to avoid
   showing. If Product B ever writes one without the other, it reintroduces the problem Product A
   solved.
3. **Product B is where "low stock" and "out of stock" get defined**, not Product A. Product A
   displays a binary-ish status to a customer; Product B is where a bookseller needs an actual
   threshold to act on, and that threshold is currently undefined by the brief (see Open
   questions).

## Pain point mapping

Of the brief's five pain points, Product B owns one outright and takes a share of a second.

**Owned: staff track inventory by memory or paper log, so nobody notices a book is out of stock
until a customer asks.** This is the product's entire reason to exist. A live dashboard with
low/out-of-stock flags and a pending pre-order list is a direct answer.

**Partial: repeated customer questions pull staff away from the register.** Indirectly, if
Product B makes a stock check fast enough that a bookseller can answer a walk-in's question in
five seconds while at the register, some of the interruption cost drops — but this is a side
effect, not Product B's core job, and Product C owns the actual customer-facing question-answering
surface.

**Not ours:** the other three pain points (no way to check stock before visiting, no loyalty
system, inconsistent social posting) belong to Products A, A, and D respectively.

## Scope: what Product B will not do

- **No customer-facing surface of any kind.** Product B is staff-only. A customer never sees this
  dashboard, directly or through an API Product B exposes.
- **No loyalty stamp granting or redemption.** That is Product A's staff-facing surface, and it
  exists there because Product A owns the loyalty schema.
- **No customer question-answering.** That is Product C.
- **No checkout, payment, or full point-of-sale replacement.** Product B reconciles stock counts;
  it does not ring up a sale. If Riverside has no POS at all, that gap stays out of scope rather
  than being absorbed here by default.
- **No financial or accounting reporting.** Sell-through, margin, and revenue reporting are a
  different product with a different data source (a real transaction ledger), not a side effect
  of an inventory dashboard.
- **No multi-location support.** The store is stated as single-location, same as Product A's
  scope decision.

## Open questions

- **Does Riverside already run a POS with inventory tracking (Square, Shopify, Clover, or a
  book-trade-specific system)?** This blocks the build-vs-integrate decision the same way it
  blocks Product A's loyalty feature, and should be resolved the same way: ask, don't assume.
- **What counts as "low stock"?** The brief says to flag titles that are low, but does not define
  a threshold. A fixed number (e.g. `on_hand - reserved <= 1`), a percentage of a par level, or a
  per-title custom threshold are all different features with different data requirements, and
  whoever builds first will pick one silently unless it is decided.
- **What produces "recently sold titles" and "most frequently requested books"?** Flagged already
  in [`context.md`](context.md): Product A's schema as currently planned has no sales/transaction
  table, and `loyalty_stamps` records a grant, not a sale. "Most requested" could plausibly be
  derived from `reservations` (a request that never converts) or from a distinct demand-signal
  table, but this is undecided. Until it is, these two metrics cannot be built against real data.
- **Who is the reconciliation step for, physically?** If it is the owner doing an evening count,
  the interaction can be a batch entry screen. If it is a bookseller updating counts throughout
  the day between customers, it needs to be closer to Product A's "one tap" loyalty grant in
  speed. These are different UIs, and the answer depends on how the store actually operates,
  which is not stated in the brief.
- **Is the shared `staff` role check (from Product A's `staff (user_id, role)` table) actually
  wired up and usable by Product B, or does Product B need its own interim auth while that gets
  built?** This blocks any work on who is allowed to see the dashboard or write a stock count.

## Verification status

Same standing rule as Products A and C: no competitor price or feature claim in this document is
quoted from memory as fact. Square, Shopify, Clover, Bookmanager, Above the Treeline, Sortly,
inFlow, and Zoho Inventory are named because they are the categories of tool a store like this
plausibly already uses or could adopt instead of Product B, not because their current pricing or
feature set has been checked. Whether Riverside runs any POS today is the load-bearing unverified
fact in this document — most of the competitive analysis above changes shape depending on the
answer.
