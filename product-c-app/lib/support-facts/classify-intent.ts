/**
 * Pure, deterministic, keyword-based intent classifier -- the "classify"
 * step of product-c/implementation_plan.md Phase 2's retrieval flow:
 *
 *   customer message -> classify intent -> fetch facts for intent
 *     -> render deterministic fact block -> model phrases answer
 *
 * This module NEVER calls a model and never touches a fact -- it only
 * decides which fetcher (if any) should run next. Per [FORCES], a wrong
 * classification routes to the wrong fetcher, and a fetched fact for the
 * wrong intent is worse than no fact -- so ambiguous input must fall back to
 * `'other'` rather than confidently guessing a specific intent. Checks run
 * in a fixed order against a small keyword list per intent (no giant regex,
 * no NLP dependency); the first category whose keyword set matches wins,
 * and `'other'` is the terminal default.
 */

import type { SupportIntent } from './sample-questions';

interface IntentRule {
  intent: Exclude<SupportIntent, 'other'>;
  keywords: string[];
}

// Order matters: earlier rules take priority when a message's keywords span
// more than one bucket (e.g. "refund" (policy) vs. "ticket"/"event" (event)
// in "Can I get a refund on my event ticket?" -- policy is checked first,
// so the policy-labeled sample lands correctly instead of cross-routing).
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'stock',
    keywords: [
      'in stock',
      'stock',
      'shelf',
      'copies',
      'carry',
      'available',
      'hardcover',
      'paperback',
      'title',
    ],
  },
  {
    intent: 'hours',
    keywords: ['open', 'close', 'hours'],
  },
  {
    intent: 'policy',
    keywords: [
      'return',
      'policy',
      'swap',
      'exchange',
      'receipt',
      'special order',
      'preorder',
      'hold',
      'gift card',
      'loyalty',
      'match',
      'ship',
      'refund',
      'missing',
    ],
  },
  {
    intent: 'event',
    keywords: ['event', 'reading', 'ticket', 'book club', 'author'],
  },
];

function normalize(message: string): string {
  return message.trim().toLowerCase();
}

/**
 * Routes a raw customer message to one of `SupportIntent`'s five buckets.
 * Never calls a model, never inspects a fact -- see the module doc above.
 */
export function classifyIntent(message: string): SupportIntent {
  const normalized = normalize(message);

  if (normalized.length === 0) {
    return 'other';
  }

  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.intent;
    }
  }

  return 'other';
}
