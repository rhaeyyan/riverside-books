import { describe, expect, it } from 'vitest';

import {
  getHoursFact,
  getPolicyFact,
  listHolidayExceptions,
  listPolicyTopics,
  listRegularHours,
  SAMPLE_QUESTIONS,
} from './index';

describe('support-facts — hours', () => {
  it('has exactly seven regular days', () => {
    expect(listRegularHours()).toHaveLength(7);
  });

  it('resolves a regular weekday', () => {
    const fact = getHoursFact('Wednesday');
    expect(fact).not.toBeNull();
    expect(fact?.opens).toBe('09:00');
    expect(fact?.isException).toBe(false);
  });

  it('prefers a holiday exception over the regular schedule for that date', () => {
    const fact = getHoursFact('2026-12-25');
    expect(fact?.isException).toBe(true);
    expect(fact?.opens).toBeNull();
  });

  it('returns null for an unknown day/date', () => {
    expect(getHoursFact('Not-A-Day')).toBeNull();
  });

  it('has at least one holiday exception', () => {
    expect(listHolidayExceptions().length).toBeGreaterThan(0);
  });
});

describe('support-facts — policies', () => {
  it('resolves a known policy topic', () => {
    const fact = getPolicyFact('returns');
    expect(fact).not.toBeNull();
    expect(fact?.intent).toBe('policy');
  });

  it('returns null for an unknown topic', () => {
    expect(getPolicyFact('not-a-real-topic')).toBeNull();
  });

  it('every sample question factKey for policy/hours resolves to a real fact', () => {
    const topics = new Set(listPolicyTopics());
    const days = new Set([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      ...listHolidayExceptions().map((f) => f.day),
    ]);

    for (const q of SAMPLE_QUESTIONS) {
      if (!q.factKey) continue;
      if (q.intent === 'policy') {
        expect(topics.has(q.factKey), `policy factKey "${q.factKey}" for "${q.question}"`).toBe(true);
      }
      if (q.intent === 'hours') {
        expect(days.has(q.factKey), `hours factKey "${q.factKey}" for "${q.question}"`).toBe(true);
      }
    }
  });
});
