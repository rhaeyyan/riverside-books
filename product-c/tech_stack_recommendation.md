# Tech Stack Recommendation: Riverside Books (Product C)

Product C is a bookstore customer-support chatbot. The real product requirement is narrow and
specific: answer questions using Riverside's actual operational data — store hours, return policy,
current inventory status, and event information — while staying honest about what the store knows
and what it does not.

Two properties drive almost every technical choice below.

First, **the model is not the source of truth**. Product C should not answer stock questions from
model memory or general knowledge. It should retrieve facts from Riverside's tables and then use a
model to phrase the answer in a useful, friendly way.

Second, **the store's facts are small and structured**. This is a small independent bookstore with a
limited catalog and a set of fixed operational facts. There is no need for a huge retrieval stack,
vector database, or advanced semantic search system for the MVP.

## 1. Framework: Next.js (App Router) on Vercel

**Recommendation: Next.js App Router, deployed on Vercel.**

This matches the rest of the assignment and gives Product C a trusted server environment without
forcing a separate backend service. Product C is a customer-facing support experience, and it is
better served by a single app with an API layer than a client-only widget.

Why this matters for Product C:

- The support flow can read from Postgres and render an answer server-side or via a server action.
- A model call can be isolated behind a single route or server action.
- The app can keep a clean boundary between data retrieval and answer generation.
- Vercel previews make it easy to demo the feature on a real URL without a separate deployment target.

This avoids the common mistake of building a chatbot as a pure browser widget that invents facts or
automatically trusts a model output without validation.

## 2. Database and auth: Supabase (PostgreSQL)

**Recommendation: Supabase Postgres with Row Level Security (RLS), plus Supabase Auth if a user
account is needed for a future conversational save feature.**

Product C reads operational data, not transactional ownership data. Most of the relevant facts are
public or staff-driven and belong in a small relational schema.

The data is relational and small. A single-location bookstore has a few thousand titles and a small
set of operational records. This does not justify a heavyweight graph database or a separate search
service.

### Data access pattern

The bot should treat the database as the system of record and the model as a phrasing layer. For
example:

- `books` and `inventory` answer stock queries.
- `hours` or `store_policies` answer operational questions.
- `events` answer event questions.
- The model only writes the final response after the data is loaded.

RLS should prevent the chatbot from writing inventory or staff data directly. The bot should only
read from public or staff-scoped tables, and any write paths should sit behind staff-only flows.

## 3. Retrieval strategy: keep it simple and grounded

**Recommendation: direct database queries and deterministic fact blocks, not a vector search stack.**

A particular rule for Product C is: the model should never touch the database itself.

A single request flow should look like this:

```
customer message
  -> classify intent
  -> fetch facts
  -> build fact block
  -> model phrases answer from the fact block
```

This is a better fit than a retrieval-augmented-generation setup built around embeddings, because
Product C is not searching a huge corpus. It is answering a small set of known tables.

### Why not embeddings or vector search?

- Product C is answering specific operational questions, not general question answering over a large
  corpus.
- The relevant data is already structured and small.
- A vector store adds unneeded operational complexity and complexity in testing.
- A vector store would create a second source of truth, which is exactly what this product must avoid.

For the MVP, Product A's normalized inventory and stock statuses are the real source. Product C
should reuse those tables and their status logic instead of introducing a separate retrieval system.

## 4. Model choice: narrow use, small model, free or low-cost option

**Recommendation: a small model, used only to phrase a bounded answer from a fact block.**

This product does not need a large reasoning model. It needs a model that can:

- understand the user's intent
- map the message to a defined answer type
- write a clear answer from a controlled fact block
- avoid inventing missing data

The model should not be asked to reason from a large body of unstructured text or to generate a
new answer from partial memory. It should be given a fact block, like:

```
{
  intent: "stock",
  title: "The Left Hand of Darkness",
  status: "Not on the shelf right now",
  last_counted_at: "2026-08-18T10:15:00Z",
  confidence: "stale"
}
```

Then the model responds with a short, grounded answer.

This is the right pattern for a low-cost or free-tier model because the prompt is short and the data
is structured. Product C should not buy a large premium model unless the team discovers a real
requirement for broader conversation quality.

## 5. Grounding architecture and fact protection

**Recommendation: treat the model as a phrasing layer over structured facts.**

The model receives a rendered fact block and a strict instruction: answer only from the fact block.
If the fact block does not contain the answer, say so and offer a staff handoff.

This is the biggest design rule for Product C and it keeps the product honest.

### Example

If the user asks:

- "Do you have The Left Hand of Darkness in stock?"

The system fetches the stock status and returns a fact block.

The model may then say:

- "We last counted this title on August 18 at 10:15am, and it appears to be out of stock right now."

The model must not say:

- "We definitely have it." 
- "It is on the shelf now." 
- "It should be available tomorrow." 

These are unsupported claims and violate the product's trust boundary.

## 6. Confidence and staleness rules

**Recommendation: define low confidence using `inventory.counted_at`, not model certainty.**

This is a key Product C decision because it directly affects product trust.

Suggested rule:

- `counted_at` within 24 hours: answer confidently
- `counted_at` older than 24 hours: mark the answer as stale and rephrase carefully
- missing or stale data: offer a human handoff

This is a good product rule because it is objective, auditable, and easy to test. It also aligns
with Product A's stock-status logic and prevents Product C from inventing confidence the database
does not support.

For the MVP, Product C remains website-only. Social channels are a later expansion once the store
has a clear workflow for event data and staff review. The core support logic stays the same across
surfaces: use fresh facts, show a confidence boundary, and hand off when the store cannot answer
with certainty.

## 7. UI: simple chat interface, not a demo-bot aesthetic

**Recommendation: a simple chat panel or inline support widget built with accessible primitives.**

A polished, highly animated chatbot is not the priority. The first version should be clear and
functional:

- text input
- short thread of messages
- answer text that is easy to read on mobile
- visible fallback to a bookseller

This aligns with the bookstore's operational reality: most support questions are short and practical.
The interface should feel like a support desk, not a consumer AI product.

### Accessibility requirements

- readable mobile layout
- taps sized for phone use
- no meaning communicated by color alone
- clarity around when the answer is stale or uncertain
- staff handoff must be visible at all times

## 8. Provider options and free tiers

**Recommendation: do not lock to a provider yet.**

Product C should use a provider abstraction and choose the model later from configuration, the same
way the project keeps a data-access interface behind a boundary.

Good options for small, low-cost or free-tier experiments include:

- Google AI Studio / Gemini
- Groq
- GitHub Models
- OpenRouter
- Ollama for local dev only

The key is not the vendor. The key is that Product C only uses a model after it has already
retrieved factual data and formed a bounded answer.

A live provider should live behind environment variables and should not be required in CI or local
unit tests. CI should use the deterministic fake instead.

## 9. Testing strategy

**Recommendation: test the fact pipeline, not just the model output.**

The important tests are not "did the model sound nice" but:

- did the app classify the user request correctly?
- did it fetch the correct fact block?
- did it produce a stale or uncertain answer when the inventory record was old?
- did it avoid making up stock data?
- did it fall back to staff when the answer was not supported?

This is a better test target than a flaky model-output test because it validates the real product
logic: grounded support.

## 10. Summary

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js App Router | Matches the repo and allows a trusted server boundary |
| Hosting | Vercel | Works with preview URLs and fast demos |
| Database | Supabase Postgres | Small relational data, good operational fit |
| Auth | Supabase Auth only if needed | Product C's MVP is primarily read-only support |
| Retrieval | DB queries + fact blocks | Keeps the source of truth honest and small |
| Model | Small model behind a provider abstraction | Enough for phrasing, not enough to replace facts |
| UI | Simple support chat | Direct, readable, mobile-friendly |
| Testing | Deterministic fake + fact-pipeline tests | Avoids flakiness and model-dependence |

## Open items

- Decide whether Product C is website-only or also supports social messaging channels.
- Decide how event data is stored and who owns the write path.
- Confirm the exact stale-data threshold and the staff handoff rule.
- Decide whether the chatbot is permitted to answer product questions at all hours without human
  review.

## Verification status

This recommendation is architectural and intentionally narrow. It is not a claim that a live model
has been chosen or a deployed chatbot has been built. The recommendation is based on the product's
actual constraints: truthful support answers, low data volume, and a need for grounded responses
rather than general AI conversation.
