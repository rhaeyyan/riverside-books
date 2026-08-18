# Riverside Books (Product A): Market and Feature Strategy

## Overview

Product A is the customer-facing half of the Riverside Books suite. It lets a customer search
the store's catalog, see whether a title is on the shelf right now, reserve a copy for pickup,
and collect loyalty stamps toward a reward.

The brief draws a hard line around it. The store wants to modernize "without turning into a
large e-commerce business," and customers "still shop primarily by walking in or calling
ahead." This is not a storefront that competes with Amazon on selection or delivery. It is a
thin digital layer over a physical store that people already visit. Every feature below is
judged against that line, and several are cut by it.

## Who this actually competes with

### 0. The phone call (the incumbent)

The brief says customers "call ahead to check stock." That is the product Product A replaces,
and it is far better than it looks on paper.

A phone call costs nothing, needs no signup, and works for every customer including the ones
who will never install anything. It returns an answer from a bookseller who can walk to the
shelf and look. That answer is correct in a way no database is, because the shelf is the source
of truth and a human is standing in front of it. The caller can also ask a vague question and
get a recommendation.

Its weaknesses are specific, and they are the wedge:

- It only works when the store is open and a bookseller is free. A customer deciding at 11pm
  gets nothing.
- It interrupts the register. The brief lists this directly: repeated questions "pull staff
  away from the register."
- It does not hold the book. A caller is told the book is there, drives over, and finds that
  someone bought it twenty minutes earlier.
- It leaves no record. Nothing accumulates, so the store learns nothing about who asked for
  what.

Product A beats the phone call on availability, on holding the book, and on memory. It does not
beat it on correctness. Pretending otherwise is the specific way this product fails, and it is
covered below.

### 1. Amazon

Wins on selection, price, and next-day delivery. It cannot put the book in your hands this
afternoon, and it cannot be the store three blocks away.

Riverside does not beat Amazon on any axis Amazon competes on, so the strategy is to not
compete there. A customer opening Product A has already decided to buy local. The product's job
is to remove friction from a decision the customer has already made, not to win the decision.

### 2. Bookshop.org

An online bookstore that directs a share of proceeds to independent bookstores. It is the
closest thing to an aligned competitor, because a customer who wants to support Riverside can
buy through it and Riverside gets a cut.

The order still ships from a warehouse. The customer never walks in, the store never gets the
browse or the conversation, and the ongoing relationship stays with Bookshop rather than
Riverside. Fulfillment model and revenue share terms: **Unverified.**

### 3. IndieCommerce and IndieLite (American Booksellers Association)

The ABA runs e-commerce platforms built for member bookstores. This is the most direct
competitor to Product A, because it is purpose-built for exactly this kind of store.

If Riverside is an ABA member, "why not just use IndieCommerce" is the first question anyone
will ask about this project, and the honest answer is that for a real store it may well be the
right choice. The wedge for Product A is narrow but real: those platforms exist to sell and
ship books online, which is the thing the brief explicitly rules out. Product A is built for
pickup and for the walk-in relationship. Feature set, membership requirement, and pricing:
**Unverified.**

### 4. Square and Shopify loyalty add-ons

Many independent retailers already run Square or Shopify at the register, and both sell loyalty
as an add-on.

If Riverside already has one of these at the point of sale, the loyalty half of Product A is
duplicated work. Worse, it is duplicated data: two stamp balances that will disagree, and a
customer who believes the higher one. This is the single most important fact to establish
before building the loyalty feature, and it is an open question rather than an assumption.
Pricing and feature detail: **Unverified.**

### 5. The paper punch card

The incumbent for loyalty. It costs a few cents, needs no signup, and works when the wifi is
down. It fails by being losable and by teaching the store nothing about who buys what.

The bar it sets is not technical. Product A's loyalty flow has to be at least as fast at the
register as a rubber stamp. If it takes a bookseller longer than a stamp does, staff stop doing
it in week two and the feature is dead with no error message anywhere.

## Feature comparison matrix

| | Phone call | Amazon | Bookshop.org | IndieCommerce | Square loyalty | **Product A** |
|---|---|---|---|---|---|---|
| Check stock before visiting | Yes, when open | N/A | N/A | Varies | No | **Yes, 24/7** |
| Answer is physically verified | Yes | N/A | N/A | No | N/A | **Only once confirmed** |
| Holds a copy for pickup | No | No | No | Varies | No | **Yes** |
| Works outside store hours | No | Yes | Yes | Yes | No | **Yes** |
| Same-day, in hand | Yes | No | No | No | N/A | **Yes** |
| Loyalty tied to this store | No | No | No | No | Yes | **Yes** |
| Works with no signup | Yes | No | No | No | Partly | **Browse yes, reserve no** |
| Cost to store | Staff time | N/A | Revenue share | Unverified | Unverified | Build + hosting |

Every price and revenue-share cell above is marked Unverified on purpose. See Verification
status at the end.

## The stock accuracy problem

This is a strategy problem before it is a technical one, so it belongs here rather than in the
implementation plan.

Product A's core promise is "see what is currently in stock." The brief says staff "track
inventory levels by memory or a paper log, so no one notices a book is out of stock until a
customer asks for it." The store has no accurate inventory data today.

Nothing in the four-product suite creates any. Products A, B, C, and D are a customer app, a
staff dashboard, a chatbot, and a caption generator. **None of them sits at the register.** When
a walk-in buys the last copy, no system anywhere finds out. Stock data starts stale on day one
and decays every hour the store is open.

A wrong stock display is worse than no stock display. Today a customer calls, a human looks at
the shelf, and the answer is right. If the app says "In stock" and the customer drives over to
an empty shelf, the product has taken a process that worked and broken it. The store absorbs
that failure, not the app.

Three consequences shape the whole build:

1. **Never show a bare count.** "3 copies left" is a claim the underlying data cannot support.
   Show a status carrying its own age: "On the shelf as of 9:15am."
2. **A reservation is a request until a bookseller confirms it.** The customer-facing wording
   has to say that plainly, before the customer gets in the car.
3. **The store needs a reconciliation path**, which is Product B's job. Product B is therefore
   not optional for Product A to be honest.

There is an upside hiding in this, and it is the real product. Once reservations exist, a
confirmed reservation means a bookseller physically pulled the book and set it behind the
counter. That is a much stronger promise than "yes, we have it." The phone call cannot make it.
Product A should be sold on that promise rather than on stock counts.

## Pain point mapping

The brief lists five pain points. Product A owns two outright and takes a bite out of a third.

**Owned: no way to check stock or pre-order online.** This is the product's reason to exist.
Search plus an honest stock status plus reserve-for-pickup covers it end to end.

**Owned: no loyalty system, so regulars have no reason to track purchases here.** Stamps, a
visible balance, and a reward. The hard part is not the balance. It is capturing the in-store
purchase, which is covered in the implementation plan.

**Partial: repeated questions pull staff from the register.** Self-serve stock lookup absorbs
the most common call. Hours, returns, and event questions belong to Product C.

**Not ours: staff not noticing out-of-stock titles** goes to Product B. **Inconsistent social
posting** goes to Product D.

## The pre-order ambiguity

"Pre-order" means two different things in this brief, and they are different features with
different data models. Whoever builds first will pick one silently, so it gets decided here.

The Product A line reads "search the catalog, see what is currently in stock, place a pre-order
for pickup." Read in sequence, that means reserving a copy sitting on the shelf now. That is
click-and-collect. In bookselling, "pre-order" conventionally means ordering a title that has
not been published yet.

They differ in every way that matters. Reserving an in-stock copy decrements availability
immediately and races against walk-in customers. Pre-ordering an unpublished title has no stock
to decrement, needs a publication date, and makes a promise stretching weeks out.

**Decision: build reserve-for-pickup on in-stock titles.** Add "notify me when it arrives" for
out-of-stock titles as a cheap second path that reuses the same table. True pre-order of
unpublished titles is out of scope and flagged as an open question rather than quietly dropped.
The reasoning is that the brief's own sequence points at reservation, and reservation is the
feature that collides with the stock accuracy problem, which is where the genuine difficulty
lives.

## Scope: what Product A will not do

- **No shipping.** Pickup only. The brief rules out becoming an e-commerce business.
- **No event ticket sales.** The business model section mentions ticket revenue, but Product A's
  own definition does not list tickets. Flagged as an open question rather than silently added
  or silently dropped.
- **No recommendation engine.** Nothing in the brief asks for one.
- **No multi-location support.** The store is stated as single-location.
- **No staff inventory management screens.** That is Product B, and building a second one
  guarantees the two disagree.

## Open questions

- Does Riverside already run a POS with a loyalty add-on? This blocks the loyalty feature.
- Is the store an ABA member with IndieCommerce access? This changes the competitive answer.
- Does a stamp require a book, or do cards, gifts, and event tickets count?
- Who owns the inventory schema across the four products? Products B and C both read it.
- Are online payments required for the MVP, or is pay-at-pickup acceptable?

## Verification status

Standing rule carried forward from the Cycle 3 review: **no competitor price is written from
memory.** Every price cell reads Unverified until someone opens the pricing page and records
the date checked. Feature claims about named competitors are kept general for the same reason.
The competitor set itself is drawn from the brief and from general knowledge of the category,
not from a market survey, and no figure in this document should be quoted as researched.
