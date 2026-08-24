import { fixtureBook } from "../lib/content/book.fixture";
import { GeneratorWorkspace } from "./generator-workspace";

const workflowSteps = [
  "Select a current book or event",
  "Choose Instagram or Facebook",
  "Review three grounded variations",
];

/**
 * Introduces the grounded content workflow and supplies its deterministic
 * Phase 0 source record.
 */
export default function HomePage() {
  return (
    <main className="min-h-dvh bg-[var(--canvas)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(54,39,28,0.10)]">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-semibold text-[var(--surface)]"
            >
              R
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Riverside Books
              </p>
              <p className="font-semibold">Marketing workspace</p>
            </div>
          </div>
          <p className="w-fit rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--accent-strong)]">
            Phase 0 in progress
          </p>
        </header>

        <div className="grid lg:grid-cols-[1.35fr_0.85fr]">
          <section className="min-w-0 px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent-strong)]">
              Product D
            </p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Social content grounded in the books and events you trust.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-[var(--muted)]">
              Turn a selected Riverside record into three channel-specific ideas
              while keeping every title, price, and date anchored to its source.
            </p>
          </section>

          <section
            aria-labelledby="workflow-heading"
            className="min-w-0 border-t border-[var(--line)] bg-[var(--panel)] px-5 py-10 sm:px-8 lg:border-t-0 lg:border-l lg:px-10 lg:py-14"
          >
            <p className="text-sm font-medium text-[var(--accent-strong)]">
              Walking skeleton
            </p>
            <h2
              id="workflow-heading"
              className="mt-2 text-2xl font-semibold tracking-[-0.02em]"
            >
              The first workflow
            </h2>
            <ol className="mt-7 space-y-5">
              {workflowSteps.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[var(--surface)] text-sm font-semibold text-[var(--accent-strong)]"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 pt-1 text-base leading-6">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-8 border-t border-[var(--line)] pt-6 text-sm leading-6 text-[var(--muted)]">
              No content is published automatically. Staff review remains part
              of every future workflow.
            </p>
          </section>
        </div>

        <div className="border-t border-[var(--line)] bg-white/35 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          <GeneratorWorkspace record={fixtureBook} />
        </div>
      </div>
    </main>
  );
}
