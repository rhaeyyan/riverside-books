export default function Home() {
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
          <p className="mt-2 text-4xl font-semibold text-black dark:text-zinc-50">
            —
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Not wired to Supabase yet — this is scaffolding, not the live
            metric. Phase 0 exit condition per{" "}
            <code className="font-mono">product-b/implementation_plan.md</code>{" "}
            isn&apos;t met until this reads <code className="font-mono">
              sum(on_hand)
            </code>{" "}
            from the shared <code className="font-mono">inventory</code>{" "}
            table.
          </p>
        </section>
      </main>
    </div>
  );
}
