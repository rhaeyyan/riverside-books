/**
 * Synthetic customer questions labeled by intent, for exercising Product C's
 * Phase 2 intent classifier (product-c/implementation_plan.md) before any
 * model call exists. Every `factKey` here must resolve against hours.ts /
 * policies.ts / a books/events fixture — this file does not invent facts,
 * only labels which existing fact a question should retrieve.
 *
 * SYNTHETIC — for testing intent classification and retrieval wiring, not a
 * transcript of anything real.
 */

export type SupportIntent = 'stock' | 'hours' | 'policy' | 'event' | 'other';

export interface SampleQuestion {
  intent: SupportIntent;
  question: string;
  /** Topic/day key into policies.ts or hours.ts, when the intent resolves to one of them. */
  factKey?: string;
}

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  // --- hours (10) ---
  { intent: 'hours', question: 'What time do you open today?', factKey: 'Monday' },
  { intent: 'hours', question: 'Are you open on Sundays?', factKey: 'Sunday' },
  { intent: 'hours', question: 'What are your hours on Saturday?', factKey: 'Saturday' },
  { intent: 'hours', question: 'Are you open on New Year\'s Day?', factKey: '2026-01-01' },
  { intent: 'hours', question: 'Will you be open on Thanksgiving?', factKey: '2026-11-26' },
  { intent: 'hours', question: 'Do you close early on Christmas Eve?', factKey: '2026-12-24' },
  { intent: 'hours', question: 'What time do you close on weekdays?', factKey: 'Wednesday' },
  { intent: 'hours', question: 'Is the store open right now?' },
  { intent: 'hours', question: 'What are your holiday hours?' },
  { intent: 'hours', question: 'Are you open late on Fridays?', factKey: 'Friday' },

  // --- policy (14) ---
  { intent: 'policy', question: 'Can I return this book if I already read it?', factKey: 'returns' },
  { intent: 'policy', question: 'What is your return policy?', factKey: 'returns' },
  { intent: 'policy', question: 'Can I swap this for a different book?', factKey: 'exchanges' },
  { intent: 'policy', question: 'I lost my receipt, can I still return this?', factKey: 'refund-without-receipt' },
  { intent: 'policy', question: 'This copy has pages missing, what can you do?', factKey: 'damaged-or-defective' },
  { intent: 'policy', question: 'Can you special order a book for me?', factKey: 'special-orders' },
  { intent: 'policy', question: 'Can I preorder the new release before it comes out?', factKey: 'preorders' },
  { intent: 'policy', question: 'Can you hold a copy at the register for me?', factKey: 'book-holds' },
  { intent: 'policy', question: 'Do you sell gift cards?', factKey: 'gift-cards' },
  { intent: 'policy', question: 'How do the loyalty stamps work?', factKey: 'loyalty-stamps' },
  { intent: 'policy', question: 'Will you match the price I saw online?', factKey: 'price-matching' },
  { intent: 'policy', question: 'Can I get this shipped to my house?', factKey: 'shipping' },
  { intent: 'policy', question: 'Can I get a refund on my event ticket?', factKey: 'event-ticket-refunds' },
  { intent: 'policy', question: 'Can I return a signed copy?', factKey: 'signed-copies' },

  // --- stock (8, resolved against books/inventory, not this fixture) ---
  { intent: 'stock', question: 'Do you have The Left Hand of Darkness in stock?' },
  { intent: 'stock', question: 'Is there a copy of the new Sally Rooney novel on the shelf?' },
  { intent: 'stock', question: 'How many copies of that book do you have left?' },
  { intent: 'stock', question: 'Can you check if a specific title is available right now?' },
  { intent: 'stock', question: 'Do you carry graphic novels?' },
  { intent: 'stock', question: 'Is the paperback or only the hardcover in stock?' },
  { intent: 'stock', question: 'Do you have any signed copies left?' },
  { intent: 'stock', question: 'Is this book out of print?' },

  // --- event (5, resolved against events, not this fixture) ---
  { intent: 'event', question: 'Is there an author event tonight?' },
  { intent: 'event', question: 'What time does the reading start this weekend?' },
  { intent: 'event', question: 'Do I need a ticket for the book club meeting?' },
  { intent: 'event', question: 'Who is the guest author at next month\'s event?' },
  { intent: 'event', question: 'Is the event still happening if it rains?' },

  // --- other (5, no fact retrieval — greeting/fallback/handoff) ---
  { intent: 'other', question: 'Hi, are you a real person or a bot?' },
  { intent: 'other', question: 'Can I talk to someone who works there?' },
  { intent: 'other', question: 'What kind of store is this?' },
  { intent: 'other', question: 'asdkjfh nonsense input test' },
  { intent: 'other', question: 'Can you recommend me a book?' },
];
