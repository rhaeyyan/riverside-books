import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Mirrors `docs/schema.md`'s `books` field list exactly. `price_cents` is
 * always a cents-integer — never a pre-formatted currency string — per that
 * doc's "Types and conventions" section.
 */
export interface Book {
  id: string;
  isbn13: string;
  title: string;
  author: string;
  format: string;
  price_cents: number;
  published_on: string | null;
  created_at: string;
}

const BOOK_COLUMNS =
  'id, isbn13, title, author, format, price_cents, published_on, created_at';

export interface BooksRepository {
  getFeaturedBook(): Promise<Book | null>;
}

/**
 * Builds a `BooksRepository` backed by the given Supabase-client-shaped
 * object. The `books_public_read` RLS policy (anon/authenticated, `select`,
 * `using (true)`) is what actually gates this read — the repository itself
 * applies no additional access logic and never assumes the row exists.
 */
export function createBooksRepository(client: SupabaseClient): BooksRepository {
  return {
    async getFeaturedBook(): Promise<Book | null> {
      const { data, error } = await client
        .from('books')
        .select(BOOK_COLUMNS)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as unknown as Book;
    },
  };
}

/** Thrown by `createSupabaseClient` when a required env var is missing. */
export class MissingSupabaseEnvError extends Error {
  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.name = 'MissingSupabaseEnvError';
  }
}

/**
 * Server-only Supabase client, constructed with the anon key exclusively —
 * never a service-role key. Reads `SUPABASE_URL` / `SUPABASE_ANON_KEY`
 * (deliberately unprefixed, no `NEXT_PUBLIC_`, since this client is never
 * constructed in the browser).
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url) {
    throw new MissingSupabaseEnvError('SUPABASE_URL');
  }
  if (!anonKey) {
    throw new MissingSupabaseEnvError('SUPABASE_ANON_KEY');
  }

  return createClient(url, anonKey);
}
