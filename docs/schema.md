# Shared data schema

Single shared contract for the tables that cross product boundaries. Resolves `TODO.md`
cross-team items 1 (assign ownership of event data) and 4 (publish the shared schema field
list).

**Product A owns and migrates every table here**, per the cross-team schema contract in
[`product-a/implementation_plan.md`](../product-a/implementation_plan.md#the-cross-team-schema-contract).
Products B, C, and D should reference this file rather than restating field lists in their own
docs — restating is exactly how the schema drifted before this file existed: three
independently-invented `events` shapes existed across Products A, C, and D before this table was
added here.

## Ownership and access

| Table            | Migrated by | Written by                              | Read by   |
| ---------------- | ----------- | ---------------------------------------- | --------- |
| `books`           | A           | A                                         | B, C, D   |
| `inventory`       | A           | A (`reserved`, via reservations), B (`on_hand` + `counted_at` together, via reconciliation) | B, C |
| `customers`       | A           | A                                         | —         |
| `reservations`    | A           | A                                         | B         |
| `loyalty_stamps`  | A           | A                                         | —         |
| `rewards`         | A           | A                                         | —         |
| `staff`           | A           | A                                         | B, D (role checks) |
| `events`          | A           | A, B (staff writes)                      | C, D      |

## Tables

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

The `books` through `staff` definitions mirror `product-a/implementation_plan.md` exactly — that
file is where the migrations and constraint reasoning (the `inventory_reserved_sane` check,
`not null` on `status`, and so on) actually live. This file is the field-list contract other
products read from, not a restatement of that reasoning.

## Types and conventions

The field lists above name columns but not their types. These are the type decisions that cross
product boundaries — settled here so all four products encode and parse the same values, rather
than each inferring a type from an example row.

- **Every primary key is a `uuid`.** No `serial` or `bigint` ids in any table above. `customers.id`
  and `staff.user_id` are uuids by definition (they are `auth.uid()`); `books.id`,
  `reservations.id`, `loyalty_stamps.id`, `rewards.id`, and `events.id` match them rather than
  introducing a second id style. A foreign key is always the same uuid as the row it points at.
- **`price_cents` is an integer of US cents.** The store prices in USD; `1899` is $18.99. Never a
  float, and never a pre-formatted currency string crossing a product boundary — each product
  renders the `$` itself. This is why the column is `price_cents` and not `price`.
- **Timestamps are `timestamptz`, serialized as ISO 8601 UTC.** The one exception is
  `events.start_time`, which is a bare `time` in store-local time and is meaningless without
  `events.event_date` beside it.
- **`books.isbn13` is a 13-character string, no hyphens.** Not an integer — a leading digit is
  never dropped, and ISBN-10 sources are converted before insert (see
  `product-a/tech_stack_recommendation.md` §6), never truncated.

Two check-constrained value sets are still Product A's to define and are not yet written down
anywhere: `books.format` and `staff.role`. `reservations.status` is already fixed at
`requested`, `confirmed`, `picked_up`, `expired`, `cancelled`.

## `events`

Resolves cross-team TODO item 1. The shape here is adopted from Product C's provisional schema
(`product-c/implementation_plan.md`), which already matched Product D's workbook field list
(`id, title, author/guest, date, time, description`), plus `location` and `created_at` for
consistency with the tables above.

- **Product A owns and migrates the table.** This reuses the split already agreed for
  `inventory`: A owns and migrates shared tables, B holds the staff-facing write path.
- **Product B is the write surface.** Creating and editing events is an operations task, not a
  customer-facing one.
- **Products C and D read.** C surfaces event info in support answers; D generates event
  promotion content from the same record. Both stop inventing their own shape once they read
  from here.
- **This does not reopen Product A's ticket-sales scope decision.** Owning the table is not
  selling tickets — Product A's market strategy explicitly excludes ticket sales (see
  [`product-a/market_strategy.md`](../product-a/market_strategy.md), "Scope: what Product A will
  not do"). Whether a ticketed event should grant a loyalty stamp is a separate, still-open
  question — see `product-a/implementation_plan.md`'s loyalty section.

## `staff`

Resolves the "confirm shared staff role check" dependency for every consumer, not just Product B
— crystalwatson-art flagged that Product D needs the same check for `requireStaff` and staff-only
`content_drafts` RLS, and the row above listing only B's reads wasn't enough for D to build
against.

- **Shape.** `user_id` is the primary key and maps directly to `auth.users.id` / `auth.uid()` —
  there is no separate staff identity, a staff member is a Supabase Auth user with a
  corresponding row here. `role` is `not null`, with allowed values constrained by a check
  constraint (Product A defines the set).
- **Enforcement.** Staff membership is a database-side check — an RLS policy or a server-side
  `exists (select 1 from staff where user_id = auth.uid())` query — never a client-set claim or
  cookie value.
- **Read by B and D.** B gates its dashboard and reconciliation writes on it. D gates
  `requireStaff` and `content_drafts` RLS on the same table rather than inventing a parallel
  authorization system.

## `loyalty_stamps`

**Written by A only.** An earlier version of the table above listed B as a co-writer ("grant at
register"); that was wrong and contradicted two docs that already agreed on this boundary —
`product-a/tech_stack_recommendation.md` §4 ("the one staff-facing surface inside Product A...
because Product A owns the loyalty schema") and `product-b/market_strategy.md` ("No loyalty
stamp granting or redemption. That is Product A's staff-facing surface"). Granting happens
inside Product A's own staff-facing screen; Product B never writes to this table.

## Status

None of the SQL implied by these field lists has been executed — same unverified status
`product-a/implementation_plan.md` already carries for its own table definitions. Treat this as
the agreed shape, not a proven one.
