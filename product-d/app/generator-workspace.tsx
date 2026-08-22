"use client";

import { useRef, useState } from "react";

import type {
  Channel,
  FactRecord,
  GeneratedVariant,
} from "../lib/content/contracts";
import { renderFactTemplate } from "../lib/content/fact-protection";
import { FixtureContentGenerator } from "../lib/content/fixture-generator";

interface GeneratorWorkspaceProps {
  record: FactRecord;
}

const generator = new FixtureContentGenerator();
const channelLabels: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

export function GeneratorWorkspace({ record }: GeneratorWorkspaceProps) {
  const [channel, setChannel] = useState<Channel>("instagram");
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationRequest = useRef(0);

  function selectChannel(nextChannel: Channel): void {
    generationRequest.current += 1;
    setChannel(nextChannel);
    setVariants([]);
    setGenerationError(null);
    setIsGenerating(false);
  }

  async function generateVariants(): Promise<void> {
    const requestId = generationRequest.current + 1;
    generationRequest.current = requestId;
    setVariants([]);
    setGenerationError(null);
    setIsGenerating(true);

    try {
      const nextVariants: GeneratedVariant[] = [];

      for await (const variant of generator.generate({ record, channel })) {
        nextVariants.push(variant);
      }

      if (generationRequest.current === requestId) {
        setVariants(nextVariants);
      }
    } catch (error) {
      if (generationRequest.current === requestId) {
        setGenerationError(
          error instanceof Error
            ? error.message
            : "Content generation could not be completed.",
        );
      }
    } finally {
      if (generationRequest.current === requestId) {
        setIsGenerating(false);
      }
    }
  }

  return (
    <section aria-labelledby="generator-heading" className="min-w-0">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
          Deterministic preview
        </p>
        <h2
          id="generator-heading"
          className="mt-2 text-3xl font-semibold tracking-[-0.025em]"
        >
          Create social content
        </h2>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          Choose a trusted record and channel, then review three stable options.
          There is no free-text prompt and nothing is published automatically.
        </p>
      </div>

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-5">
          <div>
            <label htmlFor="record" className="text-sm font-semibold">
              Record
            </label>
            <select
              id="record"
              name="record"
              defaultValue={record.id}
              className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
            >
              <option value={record.id}>{record.title}</option>
            </select>
          </div>

          <section
            aria-label="Source facts"
            className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Source facts
            </p>
            <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Title
                </dt>
                <dd className="mt-1 break-words font-semibold">
                  {record.title}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Author
                </dt>
                <dd className="mt-1 break-words">
                  {record.author ?? "Not provided"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Price
                </dt>
                <dd className="mt-1">
                  {renderFactTemplate("{price}", record) || "Not provided"}
                </dd>
              </div>
            </dl>
          </section>

          <fieldset
            role="radiogroup"
            aria-labelledby="channel-legend"
            className="min-w-0"
          >
            <legend id="channel-legend" className="text-sm font-semibold">
              Channel
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["instagram", "facebook"] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-strong)]"
                >
                  <input
                    type="radio"
                    name="channel"
                    value={option}
                    checked={channel === option}
                    onChange={() => selectChannel(option)}
                    className="size-6 shrink-0 accent-[var(--accent-strong)]"
                  />
                  <span className="min-w-0 break-words">
                    {channelLabels[option]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={generateVariants}
            disabled={isGenerating}
            className="min-h-11 w-full rounded-xl bg-[var(--ink)] px-5 py-3 text-base font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-65"
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>

          {generationError ? (
            <p role="alert" className="text-sm font-medium text-red-800">
              {generationError}
            </p>
          ) : null}
        </div>

        <div className="min-w-0" aria-live="polite" aria-busy={isGenerating}>
          {variants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-sm leading-6 text-[var(--muted)]">
              Generated variations will appear here after you choose Generate.
            </div>
          ) : (
            <div className="grid min-w-0 gap-4">
              {variants.map((variant, index) => (
                <article
                  key={`${channel}-${index}`}
                  role="region"
                  aria-label={`Variation ${index + 1}`}
                  className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_28px_rgba(54,39,28,0.06)]"
                >
                  <h3 className="text-lg font-semibold">
                    Variation {index + 1}
                  </h3>
                  <div className="mt-4 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Caption
                    </p>
                    <p
                      aria-label="Caption"
                      className="mt-2 break-words text-base leading-7"
                    >
                      {variant.caption}
                    </p>
                  </div>
                  <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Post idea
                    </p>
                    <p
                      aria-label="Post idea"
                      className="mt-2 break-words text-sm leading-6 text-[var(--muted)]"
                    >
                      {variant.postIdea}
                    </p>
                  </div>
                  {variant.warnings.length === 0 ? (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                      <span aria-hidden="true" className="font-bold">
                        ✓
                      </span>
                      <span>No unsupported facts flagged</span>
                    </p>
                  ) : (
                    <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <p className="flex items-start gap-2 font-semibold">
                        <span aria-hidden="true">⚠</span>
                        <span>Review flagged facts</span>
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {variant.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
