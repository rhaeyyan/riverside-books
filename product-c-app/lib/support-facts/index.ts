/**
 * Retrieval accessors over the synthetic hours/policy fact data — the
 * "fetch facts for intent" step of product-c/implementation_plan.md Phase 2's
 * retrieval flow:
 *
 *   customer message -> classify intent -> fetch facts for intent
 *     -> render deterministic fact block -> model phrases answer
 *
 * This module is the fetch step for `hours` and `policy` only. `stock` and
 * `event` fetch from Supabase (books/inventory/events) once Phase 1 lands for
 * this product; they do not belong here.
 *
 * All data here is synthetic placeholder content — see hours.ts/policies.ts.
 */

import { HOURS_FACTS, type HoursFact } from './hours';
import { POLICY_FACTS, type PolicyFact } from './policies';

/**
 * Looks up hours for a specific day name ("Monday".."Sunday") or an
 * exception date (ISO "YYYY-MM-DD"). Exceptions take priority over the
 * regular weekly schedule when both could apply.
 */
export function getHoursFact(day: string): HoursFact | null {
  const exception = HOURS_FACTS.find((f) => f.isException && f.day === day);
  if (exception) return exception;

  const regular = HOURS_FACTS.find((f) => !f.isException && f.day === day);
  return regular ?? null;
}

export function listRegularHours(): HoursFact[] {
  return HOURS_FACTS.filter((f) => !f.isException);
}

export function listHolidayExceptions(): HoursFact[] {
  return HOURS_FACTS.filter((f) => f.isException);
}

/** Looks up a single policy fact by its stable topic slug (e.g. "returns"). */
export function getPolicyFact(topic: string): PolicyFact | null {
  return POLICY_FACTS.find((f) => f.topic === topic) ?? null;
}

export function listPolicyTopics(): string[] {
  return POLICY_FACTS.map((f) => f.topic);
}

export { HOURS_FACTS, POLICY_FACTS };
export type { HoursFact, PolicyFact };
export { SAMPLE_QUESTIONS } from './sample-questions';
export type { SampleQuestion, SupportIntent } from './sample-questions';
