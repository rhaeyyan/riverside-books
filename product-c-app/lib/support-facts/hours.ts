/**
 * Synthetic store-hours facts for Product C's `hours` intent.
 *
 * SYNTHETIC / PLACEHOLDER — no `store_info` table exists yet (docs/PRD.md §7,
 * "Blocker 1"). This is Path B from that blocker: a Product-C-owned static
 * config, not a migration on Product A. Ratify or replace once the team
 * settles Path A vs Path B.
 *
 * Shape follows the fact-block pattern in product-c/implementation_plan.md
 * Phase 2 ("a structured object typed by intent") so it drops into the
 * retrieval flow without reshaping later.
 */

export interface HoursFact {
  intent: 'hours';
  /** "Monday".."Sunday" for a regular day, or a specific calendar date (ISO, no time) for an exception. */
  day: string;
  isException: boolean;
  /** 24h "HH:MM", or null when closed all day. */
  opens: string | null;
  closes: string | null;
  note?: string;
}

export const REGULAR_HOURS: HoursFact[] = [
  { intent: 'hours', day: 'Monday', isException: false, opens: '09:00', closes: '19:00' },
  { intent: 'hours', day: 'Tuesday', isException: false, opens: '09:00', closes: '19:00' },
  { intent: 'hours', day: 'Wednesday', isException: false, opens: '09:00', closes: '19:00' },
  { intent: 'hours', day: 'Thursday', isException: false, opens: '09:00', closes: '19:00' },
  { intent: 'hours', day: 'Friday', isException: false, opens: '09:00', closes: '19:00' },
  { intent: 'hours', day: 'Saturday', isException: false, opens: '09:00', closes: '18:00' },
  { intent: 'hours', day: 'Sunday', isException: false, opens: '11:00', closes: '17:00' },
];

export const HOLIDAY_EXCEPTIONS: HoursFact[] = [
  { intent: 'hours', day: '2026-01-01', isException: true, opens: null, closes: null, note: "New Year's Day — closed" },
  { intent: 'hours', day: '2026-05-25', isException: true, opens: '10:00', closes: '16:00', note: 'Memorial Day — reduced hours' },
  { intent: 'hours', day: '2026-07-04', isException: true, opens: null, closes: null, note: 'Independence Day — closed' },
  { intent: 'hours', day: '2026-09-07', isException: true, opens: '10:00', closes: '16:00', note: 'Labor Day — reduced hours' },
  { intent: 'hours', day: '2026-11-26', isException: true, opens: null, closes: null, note: 'Thanksgiving — closed' },
  { intent: 'hours', day: '2026-11-27', isException: true, opens: '08:00', closes: '20:00', note: 'Day after Thanksgiving — extended hours' },
  { intent: 'hours', day: '2026-12-24', isException: true, opens: '09:00', closes: '15:00', note: 'Christmas Eve — early close' },
  { intent: 'hours', day: '2026-12-25', isException: true, opens: null, closes: null, note: 'Christmas Day — closed' },
  { intent: 'hours', day: '2026-12-31', isException: true, opens: '09:00', closes: '17:00', note: "New Year's Eve — early close" },
];

export const HOURS_FACTS: HoursFact[] = [...REGULAR_HOURS, ...HOLIDAY_EXCEPTIONS];
