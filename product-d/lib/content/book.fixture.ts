import type { FactRecord } from "./contracts";

export const fixtureBook: Readonly<FactRecord> = Object.freeze({
  id: "book-left-hand-of-darkness",
  recordType: "book",
  title: "The Left Hand of Darkness",
  author: "Ursula K. Le Guin",
  priceCents: 1899,
  eventDate: null,
  eventTime: null,
});
