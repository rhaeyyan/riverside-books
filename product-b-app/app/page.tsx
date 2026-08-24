import {
  createInventoryRepository,
  createSupabaseClient,
} from '../lib/inventory-repository';

// This route reads a live `sum(on_hand)` total on every request rather than
// being statically prerendered — stock levels change independently of any
// build/deploy, and there's no cache invalidation story for it yet.
export const dynamic = 'force-dynamic';

async function loadTotalOnHand(): Promise<number | null> {
  try {
    const client = createSupabaseClient();
    const repository = createInventoryRepository(client);
    return await repository.getTotalOnHand();
  } catch {
    // Missing/misconfigured env vars, a network error, or a malformed
    // response all collapse to the same honest empty state below — the raw
    // error never reaches the DOM.
    return null;
  }
}

export default async function Home() {
  const totalOnHand = await loadTotalOnHand();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-8 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Staff Dashboard
        </h1>

        <section
          aria-label="Total books in stock"
          className="rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Total books in stock
          </p>
          {totalOnHand !== null ? (
            <p className="mt-2 text-4xl font-semibold text-black dark:text-zinc-50">
              {totalOnHand}
            </p>
          ) : (
            <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-500">
              No stock total available — unable to load inventory right now.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
