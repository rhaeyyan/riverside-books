/**
 * Synthetic store-policy facts for Product C's `policy` intent.
 *
 * SYNTHETIC / PLACEHOLDER — same status as hours.ts: this is Path B of
 * docs/PRD.md §7 "Blocker 1", a Product-C-owned static config standing in for
 * a `store_info`-style shared table until the team ratifies one or the other.
 * None of this text has been reviewed against a real store policy.
 */

export interface PolicyFact {
  intent: 'policy';
  /** Stable slug, used as the lookup key from the retrieval flow. */
  topic: string;
  /** The customer-facing question this fact answers, for intent-classifier training/eval. */
  question: string;
  /** One-line answer the model may phrase from directly. */
  summary: string;
  /** Longer detail, only surfaced if the customer asks a follow-up. */
  details: string;
  lastUpdated: string;
}

const LAST_UPDATED = '2026-08-01';

export const POLICY_FACTS: PolicyFact[] = [
  {
    intent: 'policy',
    topic: 'returns',
    question: 'Can I return a book?',
    summary: 'Unread books in resellable condition can be returned within 30 days with a receipt.',
    details:
      'Refunds go back to the original payment method. Without a receipt, we can only offer store credit at the current listed price.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'exchanges',
    question: 'Can I exchange a book for a different title?',
    summary: 'Yes — exchanges follow the same 30-day, resellable-condition rule as returns.',
    details: 'No restocking fee for a same-day exchange at the register.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'refund-without-receipt',
    question: "I don't have my receipt, can I still get a refund?",
    summary: 'No cash/card refund without a receipt — store credit only, at current price.',
    details: 'We can look up a purchase made with a loyalty account even without the paper receipt.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'damaged-or-defective',
    question: 'The book I bought has a printing defect, what do I do?',
    summary: 'Defective copies are replaced or refunded at no cost, no time limit.',
    details: 'Bring the copy in if possible; if the title is out of stock, a refund is issued instead of a replacement.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'special-orders',
    question: 'Can you order a book that is not in stock?',
    summary: 'Yes, most in-print titles can be special-ordered and typically arrive in 3-7 business days.',
    details: 'A deposit may be requested for unusual or high-cost special orders.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'preorders',
    question: 'Can I pre-order a book that has not been released yet?',
    summary: 'Yes — preorders are held at the register and customers are called when the title arrives.',
    details: 'No payment is required until pickup unless the title is a signed/limited edition.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'book-holds',
    question: 'Can you hold a book for me?',
    summary: 'Yes, we hold books for up to 3 days at the register, no charge.',
    details: 'Ask staff to note your name and phone number on the hold.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'gift-cards',
    question: 'Do you sell gift cards?',
    summary: 'Yes, physical gift cards are available at the register in any amount.',
    details: 'Gift cards do not expire and have no reload fee.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'lost-gift-card',
    question: 'I lost my gift card, can you look up the balance?',
    summary: 'Balances can be looked up by the card number printed on the receipt from purchase.',
    details: 'Without the card number, the balance cannot be recovered.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'loyalty-stamps',
    question: 'How does the loyalty stamp program work?',
    summary: 'One stamp per qualifying purchase; a full card can be redeemed for a reward at the register.',
    details: 'Stamps are granted by staff at time of purchase and cannot be added retroactively.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'price-matching',
    question: 'Do you price match other bookstores?',
    summary: 'We do not price match other retailers.',
    details: 'Publisher list price is used consistently across all titles in-store.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'shipping',
    question: 'Do you ship books, or is it in-store pickup only?',
    summary: 'In-store pickup only today — there is no online ordering or shipping.',
    details: 'Call the store to arrange a special order for pickup.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'curbside-pickup',
    question: 'Do you offer curbside pickup?',
    summary: 'Curbside pickup is available on request — call ahead when you arrive.',
    details: 'Available during all regular business hours.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'student-discount',
    question: 'Do you offer a student or teacher discount?',
    summary: 'We do not currently offer a student or teacher discount.',
    details: 'Discounts are limited to the loyalty stamp program and occasional seasonal promotions.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'event-ticket-refunds',
    question: 'Can I get a refund on an author-event ticket?',
    summary: 'Event tickets are refundable up to 24 hours before the event.',
    details: 'No refunds are given for a missed event once it has started.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'signed-copies',
    question: 'Are signed copies returnable?',
    summary: 'Signed or personalized copies are final sale and cannot be returned or exchanged.',
    details: 'Defective signed copies still qualify under the damaged-or-defective policy.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'price-adjustment',
    question: 'A book I bought went on sale a few days later, can I get the difference back?',
    summary: 'Price adjustments are honored within 7 days of the original purchase with a receipt.',
    details: 'Adjustments are given as store credit, not a cash/card refund.',
    lastUpdated: LAST_UPDATED,
  },
  {
    intent: 'policy',
    topic: 'membership',
    question: 'Is there a paid membership program?',
    summary: 'There is no paid membership — the free loyalty stamp program is the only ongoing program.',
    details: '',
    lastUpdated: LAST_UPDATED,
  },
];
