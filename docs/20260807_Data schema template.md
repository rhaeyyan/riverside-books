**Data Schema Template**

| HOW TO USE THIS TEMPLATE Make a copy of this document and fill it out together as a team, before anyone opens a code editor. Your team's four products only work together if they all read and write the exact same shape of data. Agree on every shared column now, using the same name, format, and meaning across all four products. You can use AI as a thought partner while you work through this as a team. The final decisions you write down should be in your own words. |
| :---- |

Filled from the agreed contract in [`docs/schema.md`](schema.md), which stays the authoritative copy — this document is the assignment-form view of it. Where the two ever disagree, `schema.md` wins and this file gets corrected.

## **Team & Project Info**

| Team Name | Client Scenario / Business | Date |
| :---- | :---- | :---- |
| Team 13 | Direct-to-Consumer Retail — Riverside Books, a single-location independent bookstore (new books, cards, gifts, occasional author events) | 2026-08-19 |

## **Your Shared Columns**

*List every column your four products need to share. For each one, write the column name, a description of the data it represents, its format, and an example value. Add as many rows as you need.*

Columns are written table-qualified because the same bare name means different things in different tables (`id`, `created_at`). **Product A owns and migrates every table below**; the "who writes" split is in the ownership matrix further down. Columns marked † are proposed here and not yet pinned down in `docs/schema.md` — see "Still to confirm".

| Column Name | Description | Format | Example Value |
| :---- | :---- | :---- | :---- |
| books.id | Primary key for a book edition. Every other product references a book by this, never by title | uuid (string) | 7c9e6f3a-4b21-4d8e-9f10-2a5b6c7d8e90 |
| books.isbn13 | ISBN-13 of the edition. Unique. ISBN-10 sources are converted (978 prefix, recomputed check digit) before insert, never truncated | string, exactly 13 digits, no hyphens | 9780306406157 |
| books.title | Title as printed on the edition | string | The Bee Sting |
| books.author | Primary author as printed. One string, not a list — this is an edition-level record, not a bibliographic one | string | Paul Murray |
| books.format | Physical format of the edition | string, one of: hardcover \| paperback \| other † | paperback |
| books.price_cents | Retail price in **US cents**, as an integer. Never a float, never a formatted string — each product formats for display itself | integer, US cents (USD) | 1899 (= $18.99) |
| books.published_on | Publication date of this edition | date (YYYY-MM-DD) | 2023-06-08 |
| books.created_at | When the row was created in our database (not a fact about the book) | timestamp (ISO 8601, UTC) | 2026-08-19T09:14:02Z |
| inventory.book_id | Primary key of the inventory row and foreign key to `books.id`. One inventory row per book edition | uuid (string), fk books.id | 7c9e6f3a-4b21-4d8e-9f10-2a5b6c7d8e90 |
| inventory.on_hand | Physical copies believed to be in the shop. **Written only by Product B**, via reconciliation | integer, not null, default 0 | 3 |
| inventory.reserved | Copies held by active pre-orders. **Written only by Product A**, via the reservation path. Constraint: `reserved >= 0 and reserved <= on_hand` | integer, not null, default 0 | 1 |
| inventory.counted_at | When `on_hand` was last physically verified. **Must be written in the same statement as `on_hand`** — a count without a fresh timestamp is the bug this column exists to prevent | timestamp (ISO 8601, UTC), not null | 2026-08-19T08:40:00Z |
| customers.id | Customer identity. Equal to the Supabase Auth user id (`auth.uid()`) — there is no separate customer identity | uuid (string), = auth.uid() | 4f2a1b7c-88de-4a63-b0f1-11c2d3e4f5a6 |
| customers.display_name | Name the customer chose to be shown by. Not a legal name, not unique | string | Ada R. |
| customers.member_code | Short human-readable loyalty code a bookseller can read off a phone at the register. Unique | string, unique | RB-4K7Q |
| customers.created_at | When the customer account was created (this is our "signup date") | timestamp (ISO 8601, UTC) | 2026-03-14T17:05:41Z |
| reservations.id | Primary key of a pre-order / hold | uuid (string) | a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061 |
| reservations.book_id | Which edition is being held | uuid (string), fk books.id | 7c9e6f3a-4b21-4d8e-9f10-2a5b6c7d8e90 |
| reservations.customer_id | Who holds it | uuid (string), fk customers.id | 4f2a1b7c-88de-4a63-b0f1-11c2d3e4f5a6 |
| reservations.status | Lifecycle state. **Never null** — a null status drops rows silently out of every `where status = ...` query. Enforced by check constraint | string, one of: requested \| confirmed \| picked_up \| expired \| cancelled | confirmed |
| reservations.created_at | When the customer placed the hold | timestamp (ISO 8601, UTC) | 2026-08-18T19:22:10Z |
| reservations.expires_at | When an unclaimed hold releases its copy back to availability. 48 hours after `created_at` (an unvalidated guess, flagged as such) | timestamp (ISO 8601, UTC) | 2026-08-20T19:22:10Z |
| reservations.confirmed_at | When staff confirmed the copy was found and set aside. Null until then | timestamp (ISO 8601, UTC), nullable | 2026-08-18T20:01:00Z |
| reservations.picked_up_at | When the customer collected it. Null until then | timestamp (ISO 8601, UTC), nullable | null |
| staff.user_id | Primary key. Equal to `auth.uid()` — a staff member is a Supabase Auth user with a row here. Staff membership is checked in the database, never from a client-set claim or cookie | uuid (string), = auth.uid() | 9d8c7b6a-5432-4f10-8e9d-0a1b2c3d4e5f |
| staff.role | Which staff role the user holds. Not null, allowed values fixed by check constraint | string, one of: owner \| bookseller † | bookseller |
| events.id | Primary key of an author event | uuid (string) | b7e4d2c1-9a86-4f53-8210-3c4d5e6f7081 |
| events.title | Event name as it would be advertised | string | An Evening with Paul Murray |
| events.author_guest | Person appearing. Separate from `books.author` — a guest need not have a book in our catalog | string | Paul Murray |
| events.description | Longer blurb. Product D generates promotional copy from this; Product C answers "what is this event" from it | string (free text) | A reading and Q&A, followed by signing. Doors 6:30pm. |
| events.event_date | Calendar date of the event | date (YYYY-MM-DD) | 2026-09-12 |
| events.start_time | Start time, **store local time**, stored separately from the date | time (HH:MM, 24-hour) | 19:00 |
| events.location | Where it happens. Usually the shop, but not always | string | Riverside Books, upstairs room |
| events.created_at | When the event record was created | timestamp (ISO 8601, UTC) | 2026-08-11T11:03:27Z |

### Not shared — deliberately

`loyalty_stamps` and `rewards` are read and written by Product A only. They are listed in `docs/schema.md` for completeness, but no other product touches them, so their columns are not part of this contract. Product B never writes a loyalty stamp; granting happens inside Product A's own staff-facing screen.

### Who writes what

| Table | Migrated by | Written by | Read by |
| :---- | :---- | :---- | :---- |
| books | A | A | B, C, D |
| inventory | A | A (`reserved`), B (`on_hand` + `counted_at`, together) | B, C |
| customers | A | A | — |
| reservations | A | A | B |
| staff | A | A | B, D (role checks) |
| events | A | A, B (staff writes) | C, D |

### Rules that travel with these columns

1. **Availability is computed, never stored.** `available = on_hand - reserved` (integer, e.g. `2`), in one function, tested once. No product keeps its own copy — it isn't listed as a column above because it isn't one.
2. **`on_hand` and `counted_at` change in the same write, always.** A stock number without a fresh timestamp is indistinguishable from a stale one.
3. **Timestamps are UTC on the wire.** `events.start_time` is the one exception and is store-local by definition; each product formats for display itself.
4. **Money is an integer of US cents.** `price_cents` is USD cents — no floats, no pre-formatted currency strings crossing a product boundary. Each product renders the `$` itself.
5. **Staleness threshold is 24 hours**, shared by Product A's stock display and Product C's answers: a count older than 24h is presented as stale, not as fact.
6. **Identity is `auth.uid()`.** `customers.id` and `staff.user_id` are Supabase Auth ids, not parallel identity systems.
7. **Every primary key is a uuid.** No serial or bigint ids anywhere in the shared tables — the auth-derived keys are uuids by definition and the rest match them. A foreign key is always the same uuid as the row it points at.

### Still to confirm

- **† `books.format` and `staff.role` value sets.** Both are check-constrained, but the exact allowed values are Product A's to define and are not yet written down.
- **`hours` / `policy` have no columns yet.** Product C needs both and no table exists. Open decision, owned by Product C: add a shared `store_info (id, hours_text, policy_text, updated_at)` table that Product A migrates, or keep them as static config inside Product C. If the shared-table path is chosen, this document gains four more rows.
- **`books.genre`** does not exist. Product D's `BookContentRecord.genre` maps to `null` on every row until Product D either drops the field or proposes it as a schema addition.
- **`reservations` staff-read RLS policy** is still awaiting Product A's sign-off. It does not change any column above, only who can read them.
- **Nothing here has been executed.** No migration has run. This is the agreed shape, not a proven one.

## **Team Sign-Off**

*All four teammates have reviewed this schema and agree to build against it exactly as written.*

| Name | Product | Signature / Initials |
| :---- | :---- | :---- |
| @rhaeyyan | A — Customer Ordering & Loyalty App | |
| @Cheewaiyip | B — Staff Inventory & Ops Dashboard | |
| @humaali-create | C — Customer Support Chatbot | |
| @crystalwatson-art | D — Marketing Content Generator | |
