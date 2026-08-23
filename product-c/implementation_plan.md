# Riverside Books (Product C): Implementation Plan

Customer support chatbot for a single-location independent bookstore. The bot answers routine
customer questions using Riverside's actual store data instead of generic FAQs, with a hard rule:
if the answer depends on current inventory or a real-time operational fact, the bot must say so
honestly and hand off to a human when confidence is low.

The build order below is driven by one judgment: this product is not a general-purpose AI helper.
It is a narrow support layer over a known, limited set of facts: stock status, hours, policies,
and event information.

## Phase 0: Walking skeleton, deployed

**Goal.** One page, one question flow, and one deterministic answer path. No model yet, no chat
UI polish, and no claim of a live database connection.

- Next.js App Router project, TypeScript, Tailwind.
- Supabase project created and connected at the app boundary, but not yet used for a live product
  query.
- One minimal support page with a single text input and a mock or seeded answer path.
- One seeded fact-path for a title lookup and a static FAQ answer, without claiming a live
  database integration yet.
- Deployed to Vercel with a preview URL working on a phone.
- ESLint, TypeScript, and Vitest configured, with one passing smoke test.
- CI: lint, then typecheck, then test, then deploy.

**Exit condition.** A CI run on `main` deployed a named commit to production — cite the run
number and the commit SHA. A hand-run `vercel deploy` does not satisfy this: it produces a
working URL without proving the pipeline behind it works. Then, on that deployed commit, a
teammate opens the URL on their own phone and sees a support page that can answer a basic
greeting or product question without needing a browser-only mock. This is still a UI shell; it
does not yet assert a live database-backed stock query.

Wire the deploy pipeline before the first manual deploy, and note that Product C needs **its own**
Vercel token and its own secret name — Product A's is scoped to Product A's project and will not
work here. See the scope comment on the deploy step in [`ci.yml`](../.github/workflows/ci.yml).

**Status per issue #40's self-review:** the shipped Phase 0 page is a static preview — no
`onClick`/`onSubmit` handlers, and no seeded fact-path exists yet. Phase 1 should not assume
either is already built. The fact-path lands in Phase 2 (Intent classification and fact
retrieval); interactivity lands in Phase 3 (Product C support UX).

Nothing after this phase is allowed to break deployment.

## Phase 1: Data model and integrity

The most important phase for Product C is making the bot answer from facts, not guesses.
Everything downstream inherits the data assumptions made here.

### Shared tables and contracts

The bot depends on the store's real source tables — `books`, `inventory`, `staff`, `customers`,
and `events`. The authoritative field lists and ownership for all of them live in
[`docs/schema.md`](../docs/schema.md); Product C reads that contract rather than restating a
local copy here, which is how this section drifted out of date once before (missing fields on
`books` and `customers`, and a provisional `events` shape that predated the shared one).

Product C does not own any of these tables. It reads them as a consumer. The bot must never
invent or rewrite the source data. Its job is to phrase a response around the facts already
present.

### Core integrity rules

**1. Inventory status is computed in the database, not in the chatbot.** The bot should reuse the
same stock status logic already defined in Product A:

```
available = on_hand - reserved

available >= 1 and counted_at within 24h -> "On the shelf as of {time}"
available >= 1 and counted_at older      -> "Likely on the shelf, last counted {date}"
available <= 0                          -> "Not on the shelf right now"
```

This is deliberately not a UI-only calculation. The app and the chatbot must share one truth.
If Product A changes the stock rule, Product C must inherit it rather than re-deriving a slightly
different answer.

**2. `counted_at` is the confidence boundary.** The bot's confidence is not a model score. It is a
staleness measure over `inventory.counted_at`.

- If `counted_at` is within 24 hours, the bot can render a confident answer.
- If it is older than 24 hours, the bot must say the status is stale and present the answer as
  "last counted" rather than a fresh guarantee.
- If it cannot determine the status, it should defer to staff.

This is the Product C low-confidence rule and the implementation contract for the first release.

**3. Inventory is never treated as a general recommendation engine.** The bot answers specific,
asked-for questions. It does not invent a book list, a stock projection, or a vague suggestion
from partial facts.

### MVP surface decision

The default Product C MVP surface is the website only. The first release should support a chat
widget on the storefront because it is the clearest support entry point and it has a visible staff
fallback. Instagram and WhatsApp are intentionally deferred until the team owns event data and a
staff review workflow for those channels.

### Row Level Security and access

The bot reads data as a public or staff-facing support surface, not as an admin console.

- `books` and `inventory`: readable by anyone, including anonymous visitors.
- `events`: readable by anyone, but only staff can write or update event information.
- `staff`: staff-only access.
- `customers`: no customer write path from Product C.

**Exit condition, and it blocks the phase.** Product C must be able to read stock and event data
without duplicating or inventing its own inventory truth source.

## Phase 2: Intent classification and fact retrieval

The chatbot should separate intent detection from wording. The app should first classify the user
message into a narrow set of intents, then fetch facts for that intent.

### Supported intents

- `stock` — is a specific title in stock right now?
- `hours` — when is the store open?
- `policy` — return or exchange policy
- `event` — event details, scheduling, or ticket status
- `other` — general greeting, fallback, or staff handoff

This narrow bucket is intentional. Product C is not an open-ended support assistant.

### Retrieval flow

```
customer message
  -> classify intent
  -> fetch facts for intent
  -> render deterministic fact block
  -> model phrases answer, bounded by fact block
```

The fact block is a structured object typed by intent, for example:

```
{
  intent: "stock",
  title: "The Left Hand of Darkness",
  status: "Not on the shelf right now",
  last_counted_at: "2026-08-18T10:15:00Z",
  confidence: "stale"
}
```

The model can phrase the answer, but it cannot invent missing fields or replace the factual status.

### Tests

- A title with inventory `counted_at` inside 24 hours should render a confident answer.
- A title with inventory older than 24 hours should say the status is stale.
- A stock question on an unknown title should not misstate availability.
- An event question should return event data only if the event record exists.

**Exit condition.** A customer asks about a specific title and receives an answer derived from a
real database result, not from a generic model prediction.

## Phase 3: Product C support UX

### Minimal chat UX

The first version should be a simple chat panel or inline support widget with:

- single text input
- conversation history in a narrow thread
- answer with text only, no unnecessary styling
- a visible "ask a bookseller" or "talk to staff" fallback

### Fallback behavior

The bot must not guess when it lacks facts. The fallback list should be:

- If the question is about inventory and the data is stale: say the inventory data is stale and
  ask the customer to call or ask in person.
- If the question is about a policy not in the current data: tell the customer the policy is not
  available and offer a staff handoff.
- If a question is vague or not supported: ask for a title or a specific question and offer the
  human route.

### Accessibility

- Text should be readable on mobile.
- Chat input must meet tap-target and readability requirements.
- The bot should not use color alone to indicate confidence.
- The fallback handoff must be visible and easy to find.

## Phase 4: AI provider integration

The product should not choose a provider yet. It should instead use a small interface:

```
interface SupportAnswerer {
  answer(message: string, facts: FactBlock): Promise<string>
}
```

Two implementations:

1. **Deterministic fake** — used in CI and local tests.
2. **Real provider implementation** — selected later from a config value.

This matches the repo's broader decision in `docs/model-access.md`: the provider is not a product
feature; it is an environment-level implementation choice.

### Why this matters

- CI needs deterministic behavior.
- The repo must never rely on a live API key in pulls from external contributors.
- The model is a phrasing layer, not a fact source.

**Exit condition.** The product can run end-to-end in tests with a fake answerer and then swap in a
real provider without touching the support conversation logic.

## Phase 5: Deployment and operational guardrails

- Use Vercel deployment previews.
- Keep the AI provider behind environment variables only.
- Log unanswered or low-confidence questions for later review.
- If a support answer ends in a human handoff, store that event for product learning.
- Rate-limit the support API to avoid abuse from repeated bulk requests.

### Operational metrics worth tracking

- share of questions resolved without staff help
- share of stock answers with stale data
- number of unanswered or ambiguous questions
- number of human handoffs

These metrics keep the bot honest and help the team decide whether the support layer is doing the
job it was meant to do.

## Open questions

- Should Product C live on the website only, or also serve Instagram/WhatsApp questions?
- Who owns the event data record and how is it updated by staff?
- What exactly counts as a handoff-worthy answer: stale stock, unknown title, outside-hours policy,
  or all of the above?
- Is the chatbot allowed to answer product- or event-related questions without staff review?

## Verification status

This plan does not claim a live AI provider has been chosen or a deployed chatbot has been tested.
It is a phased implementation plan for a narrow support product that depends on trusted inventory,
hours, and event facts from the store's actual data layer. The product's credibility comes from
that truthfulness, not from the model sounding polished.
