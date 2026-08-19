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
| `loyalty_stamps`  | A           | A, B (grant at register)                 | —         |
| `rewards`         | A           | A                                         | —         |
| `staff`           | A           | A                                         | B (role check) |
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

## Status

None of the SQL implied by these field lists has been executed — same unverified status
`product-a/implementation_plan.md` already carries for its own table definitions. Treat this as
the agreed shape, not a proven one.
