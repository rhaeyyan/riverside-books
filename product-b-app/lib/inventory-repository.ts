import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface InventoryRepository {
  getTotalOnHand(): Promise<number | null>;
}

/**
 * Builds an `InventoryRepository` backed by the given Supabase-client-shaped
 * object. The `inventory_public_read` RLS policy is what actually gates this
 * read — the repository itself applies no additional access logic. Sums
 * `on_hand` across every row rather than delegating to a Postgres-side
 * aggregate: `docs/assumptions.md`'s "a few thousand titles" catalog size
 * makes either approach fine, and this avoids a bespoke RPC for one metric.
 */
export function createInventoryRepository(
  client: SupabaseClient,
): InventoryRepository {
  return {
    async getTotalOnHand(): Promise<number | null> {
      const { data, error } = await client.from('inventory').select('on_hand');

      if (error || !data) {
        return null;
      }

      return (data as Array<{ on_hand: number }>).reduce(
        (total, row) => total + row.on_hand,
        0,
      );
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
 * constructed in the browser) — the same two env var names Product A already
 * uses against the same shared Supabase project.
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
