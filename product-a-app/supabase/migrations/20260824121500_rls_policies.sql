-- Product A, Phase 1, Tasks 3+4: the RLS policies, plus the table GRANTs that
-- make them reachable. Task 2 armed RLS on all seven tables with zero policies
-- (fail-closed); this file opens the specific doors the product needs and
-- leaves every other one shut.
--
-- INTEGRITY BOUNDARY — data-integrity form (Products A/B). Who may see or write
-- a customer's reservations and stamps is decided HERE, by Postgres, in
-- policies bound to `auth.uid()` and the `anon` / `authenticated` roles. It is
-- never decided by an application-code `where customer_id = ...`, never
-- inferred from an email domain, and never taken from a client-settable claim.
-- Nothing below is `security definer`: a definer function would run as the
-- owner, which is exempt from RLS, and would therefore be a hole in the very
-- boundary this file exists to be.
--
-- WHY THIS FILE CONTAINS GRANTS AND NOT ONLY POLICIES — the correction that
-- came out of the TDD red (CI run 32750781478, `ci-product-a`), where 29
-- assertions failed with SQLSTATE 42501 on plain SELECTs. RLS and privilege
-- are two separate gates and a client role has to pass BOTH:
--
--   * A GRANT without a policy is deny-all. The role may name the table, and
--     RLS then filters every row away — a SELECT returns zero rows, an UPDATE
--     or DELETE reports zero rows affected, and neither raises.
--   * A policy without a GRANT is unreachable. Postgres checks privilege
--     FIRST, so the statement dies with 42501 ("permission denied for table")
--     before any policy is consulted.
--
-- No migration in this product had ever issued a GRANT, which is why even
-- `books` — which has had a working `books_public_read` policy since Phase 0
-- (20260821144028) — was never actually readable by `anon`. That policy has
-- been dead on arrival for its whole life, and the first test to probe it from
-- the role it names is what found this. Its GRANT is included below; the policy
-- itself is deliberately NOT re-created, because `create policy` on an existing
-- name errors with 42710 and this migration must apply exactly once.
--
-- WHY `anon` IS GRANTED SELECT ON TABLES IT MUST NEVER READ A ROW OF. It looks
-- backwards and is not. `customers`, `reservations`, `loyalty_stamps`, `staff`,
-- `rewards` and `events` are all closed to anonymous visitors, and they are
-- closed by the ABSENCE of any policy naming `anon` — the grant is inert on its
-- own. Granting it is what makes the door a locked door rather than a missing
-- one: a locked door answers "nothing here" (zero rows), a missing one raises
-- 42501, and the difference is what an anonymous browser session sees when it
-- reads a list. The alternative — a `for select to anon using (false)` policy —
-- would put policies on `rewards` and `events`, which are pinned at zero in
-- schema-constraints.test.ts precisely so a blanket policy cannot be swept
-- across every table unnoticed.
--
--   THE STANDING RULE THIS CREATES: because these grants exist, a future
--   policy on any of those six tables must name its roles explicitly (`to
--   authenticated`, `to anon`) and never be left role-less. A policy with no
--   `to` clause applies to PUBLIC, which now includes `anon`, and would open
--   the table to the internet in one line.
--
-- Write privileges are granted only where a test-covered write path exists, and
-- the absences are the control:
--
--   * `loyalty_stamps` gets NO insert privilege to any client role. Stamps are
--     granted by staff at the register; a customer who can insert one has
--     minted store credit. It DOES get update/delete — with no update or delete
--     policy behind them, so both affect zero rows — because a customer's
--     attempt to spend or destroy their own stamp must be a silent no-op rather
--     than an error, which is the shape the app's own reads and writes expect.
--   * `reservations` gets no customer update or delete POLICY. Confirming is a
--     staff act, and cancelling is a status transition rather than a delete:
--     the row records a commitment the store made and has to survive.
--   * `customers` gets no insert policy at all — profile creation on first
--     sign-in is Task 9, and guessing at it here would be a write path nobody
--     has specified.
--
-- `rewards` and `events` get no policy in this file. `rewards` has no
-- customer-facing read path until redemption ships; `events` is Product C/D's
-- read surface, not A's, and opening it is their task to spec.

-- ---------------------------------------------------------------------------
-- Privileges. Schema usage first: every grant below is unreachable without it.
-- The standard Supabase stack already grants this, so this line is ordinarily
-- a no-op — it is here so the migration states its own prerequisite rather
-- than inheriting it from a stack bootstrap no file in this repo controls.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

-- Public catalog surface: the shelf a visitor sees before signing in.
grant select on public.books to anon, authenticated;
grant select on public.inventory to anon, authenticated;

-- Private surface. `anon` gets select and nothing else, and reads zero rows
-- from all of it — see the note above on why the grant is still correct.
grant select on public.customers to anon, authenticated;
grant select on public.reservations to anon, authenticated;
grant select on public.loyalty_stamps to anon, authenticated;
grant select on public.staff to anon, authenticated;
grant select on public.rewards to anon, authenticated;
grant select on public.events to anon, authenticated;

-- Writes. Table-level rather than column-level on `customers` on purpose: the
-- `with check (id = auth.uid())` below is what has to stop a customer moving
-- their row out of their own policy's reach, and a column-level grant would
-- mask whether that clause was ever written. See "Known gaps" in the task
-- report re: `member_code`, which this consequently leaves customer-writable
-- until Task 9 narrows it.
grant update on public.customers to authenticated;

grant insert, update, delete on public.reservations to authenticated;

-- Update and delete are inert here — no policy backs either, so both affect
-- zero rows. Insert is deliberately absent entirely. See the header.
grant update, delete on public.loyalty_stamps to authenticated;

-- ---------------------------------------------------------------------------
-- inventory — public read, matching `books`. The shelf is public information.
-- ---------------------------------------------------------------------------

-- `to anon, authenticated`, not `to anon` alone: a policy naming only the
-- anonymous role passes a signed-out catalog test and breaks the catalog for
-- every customer who signs in.
create policy "inventory_public_read"
  on public.inventory
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- customers — a customer sees and edits exactly their own row. `customers.id`
-- IS `auth.uid()` (Task 2), so the predicate needs no join.
-- ---------------------------------------------------------------------------

create policy "customers_self_read"
  on public.customers
  for select
  to authenticated
  using (id = auth.uid());

-- `using` AND `with check`, which are not the same gate: `using` decides which
-- rows may be touched, `with check` decides what a row is allowed to look like
-- afterwards. With `using` alone a customer can update their own `id` to
-- someone else's — or to an unclaimed one — and land outside the reach of the
-- policy that was supposed to contain them.
create policy "customers_self_update"
  on public.customers
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- reservations — two audiences, four policies. Permissive policies OR together
-- per command, so a customer matches the customer rule, a staff member matches
-- the staff rule, and neither widens the other.
-- ---------------------------------------------------------------------------

create policy "reservations_customer_read"
  on public.reservations
  for select
  to authenticated
  using (customer_id = auth.uid());

-- `status = 'requested'` is half the check, and the important half.
-- `confirmed` is a perfectly legal status per `reservations_status_allowed`,
-- so nothing in the schema stops a customer opening a reservation that is
-- already confirmed — which would reserve a copy without a member of staff
-- ever having taken it off the shelf. The constraint says which statuses
-- exist; this says which one a customer may start at.
create policy "reservations_customer_insert"
  on public.reservations
  for insert
  to authenticated
  with check (customer_id = auth.uid() and status = 'requested');

-- Staff read the whole book. `exists` against `public.staff` is the
-- authorization test used from here on: staff membership is a row in a table,
-- never a claim in a token the client could set.
create policy "reservations_staff_read"
  on public.reservations
  for select
  to authenticated
  using (
    exists (select 1 from public.staff where user_id = auth.uid())
  );

-- No `with check` clause: for an UPDATE policy Postgres reuses `using` as the
-- check when one is not given, which is the intent here — a staff member may
-- move a reservation to any legal status, and which statuses are legal is the
-- check constraint's job, not this policy's.
create policy "reservations_staff_update"
  on public.reservations
  for update
  to authenticated
  using (
    exists (select 1 from public.staff where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- loyalty_stamps — read your own balance. There is no customer write path, and
-- that is the whole design: one select policy, and nothing else.
-- ---------------------------------------------------------------------------

create policy "loyalty_stamps_customer_read"
  on public.loyalty_stamps
  for select
  to authenticated
  using (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- staff — self-row only.
--
-- THE PREDICATE MUST NOT SUBQUERY `staff`. Writing this the way the
-- reservations policies above are written — `using (exists (select 1 from
-- public.staff where ...))` — is infinite recursion (SQLSTATE 42P17): the
-- policy on `staff` would have to consult the policy on `staff` to decide
-- whether it may consult `staff`. `user_id = auth.uid()` compares a column to
-- a function and reads nothing, so it terminates. Everything depends on this:
-- the two reservations staff policies above select from this table, and a
-- recursive policy here would take them down with it.
--
-- The consequence is that a staff member sees only themselves, not the roster.
-- Nothing needs the roster yet, and `exists (...)` — the only thing that reads
-- this table — is satisfied by the self-row.
-- ---------------------------------------------------------------------------

create policy "staff_self_read"
  on public.staff
  for select
  to authenticated
  using (user_id = auth.uid());
