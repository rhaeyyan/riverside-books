# Model access for Products C and D

Answers the question "do we need to buy an API key for this assignment?" once, for the whole team, so Products C and D do not each derive it separately. Written 2026-08-18 in response to two TODO items — `TODO.md` Product C, "Add the technical research the product actually needs", and Product D, "Add research on your own AI, not just competitors'".

**The short version.** Products A and B need no model at all. Only C and D do, and both need less of one than their names suggest. Free API keys that require no credit card exist and are sufficient for this assignment. If we choose to pay instead, the whole-assignment ceiling is roughly $3–$12 depending on model tier. Neither product should commit to a provider now: both build against an interface with a deterministic fake, and the provider becomes a config value chosen on demo day.

## 1. Which products need a model

| Product | Needs an LLM | Why |
| --- | --- | --- |
| A — Ordering & Loyalty | No | Catalog search, reservations, loyalty stamps. Postgres full-text search plus trigram matching, already decided in `product-a/tech_stack_recommendation.md` §5. |
| B — Staff Inventory & Ops | No | Stock levels, low-stock flags, pending pre-orders. Queries and aggregates. |
| C — Support Chatbot | Yes, narrowly | Classify what the customer is asking, then phrase an answer that a database query already produced. |
| D — Content Generator | Yes, narrowly | Write caption prose around a book or event record the staff member selected. |

This is a two-of-four problem, not a team-wide blocker.

## 2. What the model is actually doing

Both product strategy docs already contain the constraint that decides the architecture.

From `product-c/market_strategy.md`: "Inventory answers must be sourced from the system of record, not the chatbot itself. The bot is a presentation layer over the store's current stock state."

From Product D's fact-protection rule: "The model can decide how to frame those facts, but it cannot manufacture replacements."

In both cases the model is a **phrasing layer over facts the application already fetched**. It is never the source of a fact. That has three consequences worth stating plainly, because they are what make the cost question small:

- **Prompts are short.** A fact block for one title is a few hundred tokens, not a document corpus.
- **No embeddings or vector store for the MVP.** A single-location bookstore has a few thousand titles. Product A already indexes them with `tsvector` plus `pg_trgm`; C should retrieve through that same path rather than stand up a second retrieval system with different answers.
- **No fine-tuning.** Nothing here needs a model that knows anything about Riverside. It needs a model that follows an instruction about text it was handed.

## 3. Grounding architecture (Product C)

The model never touches the database. One turn looks like this:

```
customer message
  -> classify intent          (stock | hours | policy | event | other)
  -> fetch facts for intent   (Postgres query, typed result)
  -> render a fact block      (deterministic string, no model involved)
  -> model phrases an answer  (fact block + closed instruction, streamed)
```

Two rules on the last step:

1. **The instruction is closed.** Answer only from the fact block. If the block does not contain the answer, say so and offer a staff handoff. Do not infer, do not fill gaps from general knowledge about books.
2. **Numbers and statuses are not the model's to invent.** The stock line is rendered before the model sees it and is expected to survive verbatim.

### Reuse Product A's stock status function

`product-a/implementation_plan.md` §"The stock status function" already defines the status ladder, deterministically, in one place, with table-driven tests over the boundaries:

```
available = on_hand - reserved

available >= 1  and counted_at within 24h  ->  "On the shelf as of {time}"
available >= 1  and counted_at older       ->  "Likely on the shelf, last counted {date}"
available <= 0                             ->  "Not on the shelf right now"
```

Product C should call that function and pass its output into the fact block, not reimplement the ladder. Two implementations of "is this book in stock" will disagree eventually, and the disagreement will surface as the chatbot contradicting the app.

This also resolves a second, separate TODO item for Product C — "Make 'low confidence' concrete." Low confidence is not a model score. It is `counted_at` older than 24 hours, which is already A's boundary, and it changes the wording of the answer rather than suppressing it.

## 4. Fact protection, mechanically (Product D)

Product D's rule is correct but needs a mechanism, not prompt wording. Three layers, cheapest first:

1. **The model receives a record, not a user's free text.** The staff member selects a book or event; the app renders its fields. There is no prompt box for arbitrary instructions, so there is nothing to inject into.
2. **Facts are re-substituted after generation, not trusted from the output.** The model writes around placeholder tokens (`{title}`, `{author}`, `{price}`, `{event_date}`); the app substitutes real values from the record afterwards. A model that hallucinates a price cannot get one into a draft, because it never emits the price field at all.
3. **A post-generation diff flags the rest.** Any number, date, or capitalised name in the draft that does not appear in the fact block gets highlighted in the review UI.

Layer 3 is a highlighter, not a gate. Product D's own strategy doc keeps human review inside the product rather than treating it as a temporary safety step, so the correct behaviour is to draw the reviewer's eye, not to block the draft.

## 5. Cost

Anthropic first-party rates, checked 2026-08-18. Partner platforms (Bedrock, Vertex) price separately.

| Model | Input $/1M | Output $/1M |
| --- | --- | --- |
| Claude Opus 5 | $5.00 | $25.00 |
| Claude Sonnet 5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

Assumed shapes: a **C turn** is ~1,500 input tokens (system prompt, policy text, fact block, short history) and ~200 output. A **D generation** is ~800 input and ~900 output (three caption variants at ~300 each).

| Model | Per C turn | Per D generation | Assignment envelope |
| --- | --- | --- | --- |
| Claude Opus 5 | $0.0125 | $0.0265 | ~$11.55 |
| Claude Sonnet 5 | $0.0075 | $0.0159 | ~$6.93 |
| Claude Haiku 4.5 | $0.0025 | $0.0053 | ~$2.31 |

The envelope assumes 500 chatbot turns and 200 caption generations across all development, testing, and the demo — a deliberately generous figure for a single-cycle assignment.

The point of the table is not that one row is correct. It is that **the gap between the cheapest and most capable options is about nine dollars for the entire assignment**, so model choice should be made on answer quality and latency rather than on cost. What would actually break this budget is a test suite that calls a live API on every push, which is one of the reasons §8 keeps the key out of CI.

Two notes:

- **Prompt caching** applies if the stable prefix (system prompt plus policy text) exceeds roughly 1,024 tokens — below that it silently does not cache. Product C's prefix plausibly clears that bar and is identical on every turn, so it is worth a breakpoint; cache reads bill at a reduced rate. Check the vendor's current pricing page for the multiplier before quoting a saving.
- **Sonnet 5 carries introductory pricing of $2.00/$10.00 through 2026-08-31**, after which it reverts to the rates above. Do not build a cost estimate on the intro rate.

## 6. Latency

Latency, not cost, is where the free options genuinely differ, and it is the one number that affects whether the demo feels finished.

The dominant factor is not the model — it is **whether the answer is streamed**. A support answer that renders its first words in under a second reads as fast even when the full response takes several. A non-streamed answer of the same total duration reads as broken. Stream both products' output.

The second factor is that Product C's turn is **sequential by construction**: classify, then query, then generate. The database round trip happens before the model call and cannot be overlapped with it. Keep the classify step cheap — it is a short-output call, or a plain keyword match for the unambiguous intents, and does not need the same model as the phrasing step.

## 7. Provider options

Checked 2026-08-18. **Free-tier limits below come from secondary sources and shift frequently — re-check the vendor's own documentation before relying on a specific number, and before demo day.**

| Provider | Cost | Notes |
| --- | --- | --- |
| Google AI Studio (Gemini) | Free tier, no card | The most capable model available at zero cost; 1M context. Free quotas were reduced in late 2025. |
| Groq | Free tier, no card | No credits system, rate limits only. Fastest inference of the free options. Open models (Llama 3.3 70B and similar). |
| GitHub Models | Free with a GitHub account | We all already have one. Per-minute and per-day limits. |
| OpenRouter | Free tier, no card | 20+ `:free` models behind a single key, but only ~50 requests/day until the account has purchased $10 of credits. |
| Ollama, local | Free, no key at all | Runs offline on a laptop. Vercel cannot reach a laptop, so this suits development and a laptop-driven demo, not a deployed URL. |
| Anthropic / OpenAI | Paid, card required | No free tier; a minimum credit purchase applies. Costs as in §5. |

One caveat to record rather than discover later: **free tiers are generally funded by training on submitted prompts.** For a fictional bookstore with seeded catalog data this is not a problem, but it is a reason not to reach for a free tier reflexively in a project with real customer data, and it belongs in `SECURITY.md` if either product ever handles one.

## 8. The decision

**Neither product picks a provider now.** Both put the model behind an interface — one method, taking a rendered prompt and returning a stream — with these implementations:

- **A deterministic fake**, returning fixture responses. This is what tests and CI use.
- **A real provider**, chosen later from §7 and read from an environment variable.

This is the same dependency-inversion rule `CLAUDE.md` already applies to the Supabase client, and it is not optional for CI regardless of which provider wins:

- Tests that call a live model are **non-deterministic** and will flake.
- CI **cannot safely hold a live key** for pull requests from outside collaborators.
- A live call on every push **burns free-tier quota** on work no human is reading.

The consequence is that the hard parts of both products — retrieval correctness, the staleness ladder, intent classification, fact substitution — are fully testable with zero API calls, and "which provider" collapses into a config change on demo day.

## 9. What this document does not decide

- **Whether Product C also ships on Instagram or WhatsApp.** Open question in C's strategy doc and a separate TODO item; it changes the surface, not the model architecture above.
- **Image generation for Product D.** Out of scope per D's own strategy doc, which explicitly declines to compete with Canva and Adobe Express on design.
- **Which specific model each product ships with.** §5 and §6 give the inputs; the owners choose.

## Verification status

Anthropic pricing in §5 is from the vendor's current published rates, checked 2026-08-18, and is quoted with that date in the same format Product D used for its competitor research. Per-turn and envelope figures are arithmetic over **assumed** token shapes, not measurements — re-run them against `count_tokens` once a real prompt exists.

Free-tier limits in §7 are from secondary sources rather than each vendor's own documentation and should be treated as indicative. They are the fastest-moving figures in this document.
