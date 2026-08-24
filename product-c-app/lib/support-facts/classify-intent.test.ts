/**
 * TDD red for `classifyIntent` (Phase 2 step 1: "classify intent" of the
 * retrieval flow classify -> fetch facts -> render fact block -> model
 * phrases answer). Pure, deterministic, no model call, no I/O.
 *
 * Oracle per [SPEC]:
 *   1. Overall accuracy: >=38/42 (>=90%) of SAMPLE_QUESTIONS match their
 *      labeled `intent` exactly.
 *   2. Hard gate (separate from the 90% bar, 0 violations allowed): for every
 *      sample whose labeled intent is one of stock/hours/policy/event, the
 *      classifier's output must be that exact intent or 'other' -- never a
 *      *different* specific intent. Cross-bucket misroutes are worse than a
 *      punt to 'other', per [FORCES].
 *   3. Explicit unit assertions for the SPEC's edge cases, independently
 *      traceable in test output (not just folded into the SAMPLE_QUESTIONS
 *      loop).
 *
 * Ambiguous-by-design samples note: 'Is the store open right now?', 'What
 * are your holiday hours?', 'Do you carry graphic novels?', 'Is this book
 * out of print?', and 'Can you recommend me a book?' all lack a `factKey`
 * in sample-questions.ts on purpose -- they read as plausible real questions
 * but don't resolve to a single deterministic fact. A classifier that falls
 * back to 'other' on any of these is PASSING, not failing; they are allowed
 * to miss the exact-label check in bar #1 as long as they don't violate the
 * hard cross-bucket gate in #2 (i.e. landing on 'other' is fine, landing on
 * a *different* specific intent is not).
 */

import { describe, expect, it } from 'vitest';
import { classifyIntent } from './classify-intent';
import { SAMPLE_QUESTIONS, type SupportIntent } from './sample-questions';

const SPECIFIC_INTENTS: SupportIntent[] = ['stock', 'hours', 'policy', 'event'];

describe('classifyIntent — SAMPLE_QUESTIONS oracle', () => {
  it('classifies at least 90% (38/42) of SAMPLE_QUESTIONS to their exact labeled intent', () => {
    const results = SAMPLE_QUESTIONS.map((sample) => ({
      sample,
      actual: classifyIntent(sample.question),
    }));

    const correct = results.filter((r) => r.actual === r.sample.intent);
    const total = SAMPLE_QUESTIONS.length;

    expect(total).toBe(42);

    const mismatches = results
      .filter((r) => r.actual !== r.sample.intent)
      .map((r) => `"${r.sample.question}" expected=${r.sample.intent} actual=${r.actual}`);

    expect(
      correct.length,
      `Only ${correct.length}/${total} matched exactly. Mismatches (some may be acceptable 'other' punts on ambiguous samples):\n${mismatches.join('\n')}`,
    ).toBeGreaterThanOrEqual(38);
  });

  it('never cross-routes a specific intent into a different specific intent (hard gate, 0 violations allowed)', () => {
    const violations: string[] = [];

    for (const sample of SAMPLE_QUESTIONS) {
      if (!SPECIFIC_INTENTS.includes(sample.intent)) continue;

      const actual = classifyIntent(sample.question);
      const isAcceptable = actual === sample.intent || actual === 'other';

      if (!isAcceptable) {
        violations.push(
          `"${sample.question}" labeled=${sample.intent} but classified=${actual} (must be "${sample.intent}" or "other")`,
        );
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('classifyIntent — ambiguous-by-design samples (fallback to "other" is an acceptable pass)', () => {
  // These five SAMPLE_QUESTIONS entries have no `factKey`, meaning they don't
  // resolve to one deterministic fact even though they carry a specific
  // labeled `intent`. Falling back to 'other' here is correct/safe behavior,
  // not a bug -- see [FORCES]. We only assert the hard cross-bucket gate,
  // not exact-match, for each of these individually.
  const AMBIGUOUS_QUESTIONS = [
    'Is the store open right now?',
    'What are your holiday hours?',
    'Do you carry graphic novels?',
    'Is this book out of print?',
    'Can you recommend me a book?',
  ];

  it.each(AMBIGUOUS_QUESTIONS)(
    '"%s" resolves to its labeled intent or safely falls back to "other"',
    (question) => {
      const sample = SAMPLE_QUESTIONS.find((s) => s.question === question);
      expect(sample, `fixture missing sample: ${question}`).toBeDefined();

      const actual = classifyIntent(question);
      expect([sample!.intent, 'other']).toContain(actual);
    },
  );
});

describe('classifyIntent — edge cases', () => {
  it('returns "other" for an empty string', () => {
    expect(classifyIntent('')).toBe('other');
  });

  it('returns "other" for whitespace-only input', () => {
    expect(classifyIntent('   \n\t  ')).toBe('other');
  });

  it('returns "other" for gibberish/nonsense input', () => {
    expect(classifyIntent('asdkjfh nonsense input test')).toBe('other');
  });

  it('resolves deterministically (same input -> same output every call) on ambiguous multi-keyword input', () => {
    // Deliberately mentions both "return" (policy) and "event" (event) so an
    // implementation could plausibly match either bucket, or punt to
    // 'other'. We don't assert which -- only that repeated calls agree.
    const ambiguous = 'Can I return my ticket for the event?';

    const first = classifyIntent(ambiguous);
    const second = classifyIntent(ambiguous);
    const third = classifyIntent(ambiguous);

    expect(second).toBe(first);
    expect(third).toBe(first);

    // And whatever it picks must still respect the hard cross-bucket gate:
    // policy/event are the only matched buckets here, so 'stock'/'hours'
    // would indicate a genuine misroute, not just an ambiguous punt.
    expect(['policy', 'event', 'other']).toContain(first);
  });

  it('is case-insensitive: "Are you open?" and "are you open" classify identically', () => {
    const mixedCase = classifyIntent('Are you open?');
    const lowerCase = classifyIntent('are you open');

    expect(mixedCase).toBe(lowerCase);
  });

  it('is punctuation-insensitive: trailing "?" does not change the classification', () => {
    const withPunctuation = classifyIntent('Are you open?');
    const withoutPunctuation = classifyIntent('Are you open');

    expect(withPunctuation).toBe(withoutPunctuation);
  });
});
