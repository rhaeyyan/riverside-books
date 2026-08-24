import type { FactRecord } from "./contracts";

/**
 * Supplies a frozen, representative book record for deterministic UI and
 * content-boundary verification.
 */
export const fixtureBook: Readonly<FactRecord> = Object.freeze({
  id: "book-left-hand-of-darkness",
  recordType: "book",
  title: "The Left Hand of Darkness",
  author: "Ursula K. Le Guin",
  priceCents: 1899,
  eventDate: null,
  eventTime: null,
});
