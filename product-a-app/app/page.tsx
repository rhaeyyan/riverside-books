export default function Home() {
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
          <p className="mt-2 text-4xl font-semibold text-black dark:text-zinc-50">
            —
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Not wired to Supabase yet — this is scaffolding, not the live
            catalog. Phase 0&apos;s exit condition per{" "}
            <code className="font-mono">
              product-a/implementation_plan.md
            </code>{" "}
            isn&apos;t met until this reads a real{" "}
            <code className="font-mono">books</code> row from the shared
            database and is deployed to Vercel.
          </p>
        </section>
      </main>
    </div>
  );
}
