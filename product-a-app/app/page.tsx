import {
  createBooksRepository,
  createSupabaseClient,
} from '../lib/books-repository';

// This route reads a live `books` row on every request rather than being
// statically prerendered — the featured title changes independently of any
// build/deploy, and there's no cache invalidation story for it yet.
export const dynamic = 'force-dynamic';

async function loadFeaturedTitle(): Promise<string | null> {
  try {
    const client = createSupabaseClient();
    const repository = createBooksRepository(client);
    const book = await repository.getFeaturedBook();
    return book?.title ?? null;
  } catch {
    // Missing/misconfigured env vars, a network error, or a malformed
    // response all collapse to the same honest empty state below — the raw
    // error never reaches the DOM.
    return null;
  }
}

/**
 * The catalog landing page. Renders the featured title when one is available
 * and the honest empty state when it is not — `loadFeaturedTitle` collapses
 * every failure to `null` rather than surfacing an error to the DOM.
 */
export default async function Home() {
  const title = await loadFeaturedTitle();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-8 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Riverside Books
        </h1>

        <section
          aria-label="Featured title"
          className="rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Featured title
          </p>
          {title ? (
            <p className="mt-2 text-4xl font-semibold text-black dark:text-zinc-50">
              {title}
            </p>
          ) : (
            <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-500">
              No featured title yet.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
