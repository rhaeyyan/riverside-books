-- Product A, Phase 1, Task 2: the seven remaining shared tables from
-- docs/schema.md — inventory, customers, reservations, loyalty_stamps,
-- rewards, staff, events. `books` already exists (Phase 0,
-- 20260821144028_create_books_table.sql) and is not touched here; that file is
-- already applied, and editing an applied migration diverges from what the
-- remote database actually ran.
--
-- INTEGRITY BOUNDARY — data-integrity form (Products A/B). Availability,
-- reservation, and stock-count state are constrained HERE, in the database, and
-- are never recomputed or re-asserted in application code:
--
--   1. `inventory_reserved_sane` (reserved >= 0 and reserved <= on_hand). The
--      NAME is part of the cross-product contract — docs/PRD.md §5 FR6 and
--      AGENTS.md both name it, and Product B's reconciliation error handling
--      matches on it. There is deliberately no separate `on_hand >= 0` check:
--      the predicate above already implies it, and a second constraint would be
--      a second name for Product B to handle.
--   2. `on_hand` / `reserved` are `integer not null default 0`. Nullable here
--      makes Phase 3's `where on_hand - reserved >= 1` predicate evaluate to
--      null — every reservation fails silently, and the check constraint goes
--      quiet the same way.
--   3. `reservations.status` is `not null` AND check-constrained to exactly the
--      five values docs/schema.md fixes. A nullable status drops rows out of
--      every `where status = ...` predicate, including the expiry sweep.
--
-- RLS is enabled on all seven tables with ZERO policies. That is the
-- fail-closed default, not Task 3 leaking in: a `public` table without RLS is
-- readable and writable by anyone holding the anon key, so shipping without it
-- would open a live hole on customers, reservations, and loyalty_stamps for as
-- long as Task 3 takes. The policies themselves are Task 3.
--
-- Deliberately absent: no indexes beyond the ones primary-key and unique
-- constraints create implicitly (search/FK/partial indexes belong to Task 6 and
-- Phase 4, attached to the queries that justify them), no triggers, no
-- functions, no `security definer`. `pgcrypto` is not re-created — the `books`
-- migration already did.
--
-- Create order follows the foreign keys: customers and staff first (they
-- reference auth.users, provided by the Supabase stack), then inventory,
-- rewards, loyalty_stamps (which needs both staff and rewards), reservations,
-- and finally events, which references nothing.
--
-- `create table`, not `create table if not exists`: Supabase applies migrations
-- once, tracked in supabase_migrations.schema_migrations (the same ledger the
-- test harness reads), so a re-run means the ledger and the database disagree.
-- That should fail loudly with 42P07 rather than silently succeed against a
-- table whose shape was never checked.

-- customers — one row per Supabase Auth user who shops. `id` IS `auth.uid()`;
-- there is no separate customer identity to keep in sync.
create table public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  member_code text not null unique,
  created_at timestamptz not null default now()
);

-- staff — a staff member is an auth user with a row here, nothing more.
-- Products B and D both gate authorization on this table (docs/schema.md,
-- "staff"), so an unconstrained free-text role would be an authorization hole,
-- not a cosmetic one.
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  constraint staff_role_allowed check (role in ('owner', 'bookseller'))
);

-- inventory — one row per book. `counted_at` has NO default, deliberately: a
-- `default now()` would make a never-counted row render as "counted just now",
-- the exact dishonesty Phase 2's status ladder exists to prevent. A count is a
-- physical act, so the write has to state when it happened.
create table public.inventory (
  book_id uuid primary key references public.books (id) on delete cascade,
  on_hand integer not null default 0,
  reserved integer not null default 0,
  counted_at timestamptz not null,
  constraint inventory_reserved_sane check (reserved >= 0 and reserved <= on_hand)
);

-- rewards — a redemption spends stamps, so it must spend at least one.
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  stamps_spent integer not null,
  constraint rewards_stamps_spent_positive check (stamps_spent > 0)
);

-- loyalty_stamps — `request_id` is the idempotency key: a retried grant at the
-- register is a no-op, not a second stamp. `granted_by` is `not null` so every
-- stamp keeps its attribution, and it does not cascade — deleting a staff
-- member must not erase the record of what they granted.
-- `consumed_by_reward_id` null means the stamp is unspent.
create table public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  granted_by uuid not null references public.staff (user_id),
  request_id uuid not null unique,
  consumed_by_reward_id uuid references public.rewards (id),
  granted_at timestamptz not null default now()
);

-- reservations — `book_id` deliberately does NOT cascade: deleting a book that
-- customers are holding should error, not silently drop their commitments.
-- `customer_id` does cascade, because a deleted account's holds are dead.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  confirmed_at timestamptz,
  picked_up_at timestamptz,
  constraint reservations_status_allowed check (
    status in ('requested', 'confirmed', 'picked_up', 'expired', 'cancelled')
  )
);

-- events — `start_time` is a bare `time` in store-local time, docs/schema.md's
-- one explicit exception to the timestamptz rule. It is meaningless without
-- `event_date` beside it, and Products C and D both read it that way.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author_guest text,
  description text,
  event_date date not null,
  start_time time not null,
  location text,
  created_at timestamptz not null default now()
);

-- Fail closed. Zero policies until Task 3 — see the header note.
alter table public.customers enable row level security;
alter table public.staff enable row level security;
alter table public.inventory enable row level security;
alter table public.rewards enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.reservations enable row level security;
alter table public.events enable row level security;
