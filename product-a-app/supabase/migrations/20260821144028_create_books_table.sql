-- Product A Phase 0: create the shared `books` table per docs/schema.md.
-- Scoped to `books` only — not the rest of Phase 1's data model.

create extension if not exists pgcrypto;

create table public.books (
  id uuid primary key default gen_random_uuid(),
  isbn13 text not null unique,
  title text not null,
  author text not null,
  format text not null,
  price_cents integer not null,
  published_on date,
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

create policy "books_public_read"
  on public.books
  for select
  to anon, authenticated
  using (true);
