# Tech Stack Recommendation: Riverside Books (Product A)

Product A is a customer-facing catalog, reservation, and loyalty app for a single-location
bookstore. Two properties drive almost every choice below.

First, **the users are untrusted.** Unlike an internal tool, every visitor is an anonymous
member of the public, and the app holds a currency (loyalty stamps) that is worth cheating for.
Anything that mints value has to run somewhere the customer cannot reach.

Second, **the app makes promises about physical objects.** A reserved book is a book somebody
expects to find behind the counter. Two customers cannot be promised the same copy. That is a
correctness requirement, not a nicety, and it decides where the reservation logic lives.

## 1. Framework: Next.js (App Router) on Vercel

**Recommendation: Next.js App Router, not a client-only single-page app.**

This is a deliberate change from the approach used on the previous assignment, which put a Vite
SPA in front of Supabase and let the browser talk to Postgres directly with the anon key. That
pattern is fine when every user is a paying business with its own tenant. It is the wrong shape
here.

Granting a loyalty stamp and confirming a reservation both need to run with privileges the
customer must never hold. In a client-only app there is nowhere to put that code. Bolting on a
separate serverless function later means a second deployment target and a second auth story for
one assignment. Next.js gives a trusted server in the same project and the same deploy, through
Server Actions and Route Handlers.

Server Components also suit the read path. Catalog search and stock display are mostly read,
mostly cacheable, and want to render fast on a phone with one bar of signal.

## 2. Database and auth: Supabase (PostgreSQL)

Postgres with Row Level Security, plus Supabase Auth for customer identity.

The data is relational and small. A single-location bookstore has a few thousand titles, not
millions. Nothing here justifies anything exotic.

**Auth method: email one-time code, not magic link.** Both are built in. Magic links break in a
common real-world way, which is that the link opens in the mail app's browser rather than the
one the customer started in, and the session lands in the wrong place. A six-digit code typed
into the tab already open avoids that. It also keeps the accessible-authentication requirement
satisfiable, because the code field must accept a paste rather than forcing manual
transcription.

**Browsing does not require an account.** Search and stock lookup are anonymous. An account is
only required to reserve a copy or hold stamps. Forcing signup before a stock check would
reintroduce exactly the friction the phone call does not have.

### Row Level Security, and what it needs behind it

RLS is only as good as the identity mapping under it. The policies needed:

- A customer may read and update only their own `customer` row, their own reservations, and
  their own loyalty balance.
- A customer may **never** write to `loyalty_stamps`. Not with a policy that looks safe. No
  insert path at all from a customer session.
- Staff are a separate role, checked against a `staff` table rather than inferred from an email
  domain or a claim the client can set.
- Catalog and stock are world-readable, since the whole point is anonymous browsing.

**A cross-account isolation test is an exit condition for the data phase, not a hardening pass
later.** RLS that has never been queried by a hostile session is an assumption rather than a
control. The test is concrete: sign in as customer A, request customer B's reservations and
stamp balance by id, and assert an empty result rather than an error.

## 3. The reservation race, solved in the database

Two customers tapping "reserve" on the last copy at the same moment is the defining correctness
problem in this product. A check in the browser or in application code cannot solve it, because
both requests read "1 available" before either writes.

The fix is one atomic statement:

```sql
update inventory
   set reserved = reserved + 1
 where book_id = $1
   and on_hand - reserved >= 1
returning id;
```

Zero rows returned means no copy was available, and the caller shows "just went out of stock"
rather than a confirmation. Postgres row locking makes the read and the write a single step, so
there is no window between them. A `check (reserved >= 0 and reserved <= on_hand)` constraint
sits behind it as a backstop.

**Two traps to name now, because both fail silently.**

`on_hand` and `reserved` must be `not null default 0`. If either is nullable, the arithmetic in
that `where` clause evaluates to null, the predicate is never true, and every reservation fails
with no error anywhere. The check constraint goes quiet the same way.

**Reservations must expire.** If nothing ever releases a hold, `reserved` only ever climbs, and
a title with two physical copies eventually shows as unavailable forever while both sit on the
shelf. Every reservation needs an expiry (48 hours is a reasonable opening guess for a
bookstore) and a scheduled job that releases the count. This is the bug most likely to be
missed, because it does not appear until several days into using the system.

## 4. Loyalty stamps: server-granted, idempotent, staff-triggered

Most purchases happen in person at the register. The customer app cannot observe them, so the
stamp has to be granted by a bookseller.

**The flow:** the customer shows a member code from the app. A bookseller opens a single
staff-only screen, enters or scans the code, and taps once to grant a stamp.

Three requirements fall out:

- **The grant runs server-side, authenticated as staff.** A customer session calling it is
  rejected. If stamps can be minted from the browser, they will be.
- **The grant is idempotent.** A double tap or a network retry must not produce two stamps.
  The client sends a request id, and a unique constraint on it makes the second write a no-op.
- **It has to be faster than a rubber stamp**, or staff stop doing it. One screen, one field,
  one tap, no navigation.

This is the one staff-facing surface inside Product A, and it exists here rather than in
Product B because Product A owns the loyalty schema. That boundary needs agreement with the
teammate building B before either of you starts.

## 5. Search: Postgres full-text search plus trigram matching

`tsvector` with a GIN index over title and author, plus the `pg_trgm` extension for fuzzy
matching.

Trigrams matter more than they sound. Customers misspell author names constantly, and a search
that returns nothing for a near-miss reads as "the store doesn't have it." Both are built into
Postgres and need no extra service.

**Deliberately not used:** no Algolia, no Elasticsearch, no vector database, no embeddings. A
few thousand rows does not justify a second datastore or a sync process that can drift out of
date. This is worth stating because a semantic search layer is the kind of thing that sounds
impressive in a demo and adds a whole failure mode for nothing.

## 6. Catalog data

The catalog is the set of titles the store knows about. Stock is a number attached to some of
them. Keeping those separate is what makes "we can order that for you" expressible.

For the build, seed a fixture set of real titles with real ISBNs from a public bibliographic
source such as Open Library. Two rules attached to that:

- **The seed set is fixture data and gets labeled as such** everywhere it is presented. It is
  not Riverside's real inventory, because Riverside's real inventory does not exist in machine
  form yet.
- **No claimed integration with book wholesalers.** Live distributor feeds are a real thing in
  this industry and this project will not have one. Saying otherwise in a demo is a fabricated
  capability.

## 7. UI: Tailwind CSS with headless primitives

Tailwind for styling, consistent with the rest of the stack.

For interactive widgets, use headless primitives (Radix or React Aria) rather than hand-rolling.
The search box with suggestions is a combobox, and the accessible combobox pattern is genuinely
difficult to implement correctly from scratch. Keyboard interaction, focus management, and the
live-region announcements are where hand-written versions fail.

**Accessibility requirements specific to this product:**

- **Stock status must never be carried by color alone.** A green dot is not a status. Every
  status carries text, including its timestamp.
- **The stamp card needs a text equivalent.** Ten stamp graphics announce as ten images. The
  accessible name is "7 of 10 stamps earned."
- **Any stamp-earned animation respects `prefers-reduced-motion`,** including the celebratory
  one that will be tempting to add.
- **Tap targets meet the 24 by 24 CSS pixel minimum.** Customers are on phones in a store.
- **The one-time code field accepts a paste.** Blocking paste fails accessible authentication
  and annoys everyone else.

## 8. Payments

**Recommendation: pay at pickup for the MVP. No online payment.**

The brief says pre-orders can be paid online, so this is a real deferral rather than an
oversight. The reasoning is that taking cards pulls in a payment provider, refunds, failed
payment states, and a class of money bugs, in an assignment whose hard part is already inventory
truth. Pay-at-pickup also matches a store whose customers walk in, and it removes the question
of whether a refund revokes a loyalty stamp.

If online payment turns out to be required, use a hosted checkout (Stripe Checkout) with a
redirect, so no card details ever pass through this app. Do not build a card form.

## 9. Testing and tooling

- **Vitest and Testing Library** for component and integration tests.
- **Playwright** for the end-to-end reservation flow.
- **A dedicated concurrency test** for the reservation race, driven at the database with two
  simultaneous transactions rather than through the UI. Testing it through the browser will pass
  by luck.
- **axe-core** in the test run, **eslint-plugin-jsx-a11y** in lint.
- **GitHub Actions**: lint, then test, then deploy preview.

Deliberately not added: a Lighthouse budget gate in CI. It earns its place on a larger
frontend with a real performance budget, and here it would be CI weight with nothing to catch.

## Summary

| Layer | Choice | One-line reason |
|---|---|---|
| Framework | Next.js App Router | Needs a trusted server for stamps and confirmations |
| Hosting | Vercel | Same deploy target, preview URLs per branch |
| Database | Supabase Postgres | Relational, small, RLS built in |
| Auth | Supabase email one-time code | No broken-link handoff, paste-friendly |
| Search | Postgres FTS + pg_trgm | Typo tolerance without a second datastore |
| Reservations | Atomic conditional update | Only correct place to resolve the race |
| Styling | Tailwind + headless primitives | Combobox accessibility is not worth hand-rolling |
| Payments | None in MVP | Deferred on purpose, hosted checkout if forced |
| Testing | Vitest, Playwright, axe-core | Includes a DB-level concurrency test |

## Open items

- Nothing in this document has been run. The SQL is standard, and it is unverified by execution.
- The shared-schema decision across Products A, B, and C is unresolved and blocks the data phase.
- Whether the store has an existing POS with loyalty is unknown, and it could remove section 4.
- Reservation expiry is set at 48 hours as a guess, not from anything the brief states.
