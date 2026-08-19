# TODO — Improvements by product

Derived from a review of `docs/` and the four product folders on 2026-08-18. Every item below is a **proposal for the owner to accept, reject, or reshape** — not a decision made on their behalf. Owners: tick what you agree with, strike what you don't, and convert anything substantial into a GitHub issue.

Nothing here is a defect report. All four strategy docs are unusually strong on one specific thing — analyzing the *non-software incumbent* (the phone call, the paper log, the blank page) and deriving real requirements from it. These are the gaps left over.

## Cross-team — blocks more than one product

Owner: **all four**, needs a decision at the next sync. These are the highest-priority items in this file.

- [ ] **Assign ownership of event data.** No product owns an events table. Product C needs it ("Is the author event tonight?") and Product D's workbook specifies `Event: id, title, author/guest, date, time, description`. Product A's schema has none and explicitly declines tickets (`product-a/market_strategy.md:184`). This is the shared-Supabase question one layer down, and it will surface the same way — late.
- [ ] **Settle the POS assumption and write it down.** Products A and B each call "does Riverside already run Square/Shopify/Clover?" the single most important unverified fact. Three documents flagging the same blocker is decision debt, not research. The store is fictional, so pick an assumption ("no POS with loyalty or inventory tracking exists") and record it once, somewhere all four products inherit it.
- [ ] **Resolve the sales/demand data gap.** `product-b/context.md` flags that "recently sold titles" and "most frequently requested books" have no backing table — `loyalty_stamps` records a grant, not a sale. Decide whether B owns a `sales` table, whether `reservations` is the demand signal, or whether both metrics are cut from scope.
- [ ] **Publish the shared schema field list.** Product D's Product Plan sheet lists this as a Team 13 decision and it blocks D's fact-protection design.
- [ ] **Decide whether to backfill verified research for A, B, and C.** Product D checked real vendor pricing with dates; A, B, and C explicitly mark every competitor claim unverified. Both are defensible, but the four folders currently look inconsistent to anyone reviewing them together. Either backfill the two or three competitors that actually matter per product, following D's format, or state once that A/B/C are deliberately reasoning documents rather than surveys.
- [ ] **No product has any user or staff research.** Not one interview or observation — everything is desk research on competitor products. Since the store is fictional this may be unanswerable, in which case each product should state its operating assumptions explicitly rather than leave them implied.

## Product A — Customer Ordering & Loyalty App

Owner: **[@rhaeyyan](https://github.com/rhaeyyan)** to review.

- [ ] **Update the seed-data line in the implementation plan.** `product-a/implementation_plan.md:91` still says "a public bibliographic source" — the catalog source is now decided (Open Library, CC0, seeded to a committed fixture) in `tech_stack_recommendation.md` §6. Point at the decision instead of restating the open version.
- [ ] **Either verify the competitor prices or drop the cells.** Every price in the feature matrix reads Unverified. Bookshop.org's revenue share and IndieCommerce's membership requirement are the two that actually change the strategic answer; the rest could be cut without losing anything.
- [ ] **The Amazon and Bookshop.org sections produce no build decisions.** They're correct and well-argued, but both conclude "don't compete there." Consider compressing them into a single paragraph so the sections that *do* drive the build — the incumbent phone call, the stock accuracy problem — carry more of the document.
- [ ] **Decide the event-ticket question rather than carrying it.** It appears as an open question in three places (`market_strategy.md:184`, `:196`, `implementation_plan.md:214`). Since Product A declines tickets, that decision also determines who owns event data for C and D — see the cross-team item above.

## Product B — Staff Inventory & Ops Dashboard

Owner: **[@Cheewaiyip](https://github.com/Cheewaiyip)** to review.

- [ ] **Write `tech_stack_recommendation.md` and `implementation_plan.md`.** `context.md` already lists both as next steps. B is the only product whose strategy doc makes hard integrity claims (`counted_at` must update in the same write as `on_hand`) with no phased plan behind them yet.
- [ ] **Define the low-stock threshold.** The brief says to flag low titles without defining low. `context.md` notes a fixed number, a par-level percentage, and a per-title threshold are different features with different data requirements — whoever builds first will pick one silently.
- [ ] **Decide the reconciliation interaction.** The strategy doc's own open question: an evening batch count and a between-customers one-tap update are different UIs, and the choice determines whether the "must beat a paper log" speed requirement is even achievable. Since the store is fictional, state the assumed workflow.
- [ ] **Confirm the shared `staff` role check with @rhaeyyan.** Listed as blocking any auth work in `context.md`, still unconfirmed.

## Product C — Customer Support Chatbot

Owner: **[@humaali-create](https://github.com/humaali-create)** to review.

- [ ] **Resolve the contradiction between the matrix and the truth problem.** The feature matrix claims "Uses real inventory data: **Yes**" and "Answers title stock status: **Yes, using current data**", but the truth-problem section argues the bot must expose staleness and defer when confidence is low. Product A's matrix hedges the equivalent cell with "Only once confirmed" — C's should too, or the strongest section of the document undercuts its own table.
- [ ] **Add the technical research the product actually needs.** There is currently nothing on model choice, grounding architecture, cost per conversation, or latency. For a chatbot that is the research most likely to change what gets built — more than any competitor comparison.
- [ ] **Make "low confidence" concrete.** "The bot should defer to staff when confidence is low" needs a rule an implementation can encode — most plausibly a staleness threshold measured against `inventory.counted_at`, in hours.
- [ ] **Write `tech_stack_recommendation.md` and `implementation_plan.md`.** `product-c/` currently holds a five-line README and the strategy doc.
- [ ] **Decide the surface: website-only, or Instagram/WhatsApp too.** Already an open question in the doc; it materially changes scope.

## Product D — Marketing Content Generator

Owner: **[@crystalwatson-art](https://github.com/crystalwatson-art)** to review.

This is the only product with a genuine research artifact — sourced vendor pricing checked 2026-08-18, a weighted scorecard, and a Product Plan that converts findings into MVP/Later/Avoid rows. The items below are polish and follow-through, not rework.

- [ ] **Explain or remove the CampaignFlow reference.** The workbook's bottom-line recommendation says "Reuse CampaignFlow's proven interaction pattern," but CampaignFlow appears nowhere else in the repo — no reader outside your head can resolve it. Either add a sentence on what it is, or cut the name.
- [ ] **Round the fit scores.** `69.99999999999999` and `62.000000000000014` are float noise, and the implied precision is at odds with 1–5 subjective inputs. Integers.
- [ ] **Export a text version of the workbook alongside the `.xlsx`.** A binary can't be diffed or reviewed in a pull request — a teammate can only see that it changed, not how. A committed CSV or markdown summary fixes that cheaply.
- [ ] **Add research on your own AI, not just competitors'.** Model choice, cost per generation, and — most importantly — how fact-protection is enforced technically. "The model can decide how to frame those facts, but it cannot manufacture replacements" is the right rule; the build needs the mechanism that makes it true.
- [ ] **Convert the Product Plan sheet into `implementation_plan.md`.** The MVP/Later/Avoid split and the success measures are already phased in everything but name.
