# Riverside Books — Unified Product Requirements Document

Covers all four products built against the Cycle 4 "Direct-to-Consumer Retail" brief
(`docs/Cycle 4_ Project briefs.md`). Assembled from `market_strategy.md`,
`tech_stack_recommendation.md`, and `implementation_plan.md` in each of `product-a/` through
`product-d/`, plus the shared `docs/schema.md`, `docs/assumptions.md`, `docs/model-access.md`,
and `TODO.md`. Structure follows the `prd-builder` skill (Pursuit AI-Native).

Status: **draft, not yet reviewed by the other three owners.** Section 7 lists blockers that need
addressing before this can be called decision-grade for every product, not just A.

---

## 1. Problem Statement

Riverside Books is a single-location independent bookstore run by an owner and two part-time
booksellers, who currently manage inventory, orders, and customer communication through memory,
sticky notes, and a spreadsheet. Five concrete pains follow from that: customers cannot check
stock or pre-order before a trip; there is no loyalty mechanism, so regulars have no reason to
track purchases here specifically; staff do not notice a title is out of stock until a customer
asks; repeated questions about hours, returns, and events pull staff off the register; and social
posting happens inconsistently because captions take time nobody has.

None of this is solved today because the store's existing tools — a phone call, a paper log, a
spreadsheet, memory — are each individually hard to beat on the axis that matters most to a small
shop: they cost nothing, need no login, and are updated by the person standing in front of the
shelf, which is the only place stock truth actually exists. Every product in this suite has to be
faster or more honest than that incumbent, not just more digital, or staff and customers will
simply keep using what already works. The store explicitly does not want to become a large
e-commerce business — customers still shop primarily by walking in or calling ahead — so the
suite is a thin layer over a physical store, not a replacement for it.

---

## 2. Target Users

| User | Role | Technical level | Key pain point |
| --- | --- | --- | --- |
| Customer (browsing/reserving) | Local resident/regular, shops via Product A | Low–Mid | No way to check stock or pre-order before a trip |
| Customer (asking a question) | Same population, via Product C | Low–Mid | Repeated FAQ/stock questions have no self-serve answer |
| Store owner | Runs the register, uses Product B and D, grants loyalty stamps via Product A | Low–Mid | Doesn't notice out-of-stock titles until asked; writes social captions ad hoc |
| Part-time bookseller (×2) | Uses Product B daily, may use Product D | Low | Same inventory-blindness problem, plus interruption from repeated questions |

**Assumed** — no interviews or observations exist for this fictional store. `docs/assumptions.md`
states the operating assumptions this table depends on (one person at the register at a time, a
few thousand titles, opportunistic rather than scheduled reconciliation) and should be read
alongside this section. Validate before any real Demo Day if this ever becomes a real store.

---

## 3. User Stories

### Product A — Customer Ordering & Loyalty App

- **P0** — As a customer, I want to search the catalog and see an honestly-aged stock status, so
  that I don't drive to the store for a book that already sold.
- **P0** — As a customer, I want to reserve an in-stock copy for pickup, so that it's held for me
  instead of racing another walk-in.
- **P0** — As a customer, I want a clear "this is a request, not a guarantee" message until a
  bookseller confirms my reservation, so that I'm not misled by a promise the store can't back yet.
- **P0** — As a customer, I want to earn a loyalty stamp on any purchase a bookseller grants, so
  that regular purchases here build toward a reward.
- **P1** — As a customer, I want to ask to be notified when an out-of-stock title comes back, so
  that I don't have to keep re-checking manually.
- **P2** — As a customer, I want to pre-order a not-yet-published title. *(Out of scope for v1 —
  see Section 6.)*

### Product B — Staff Inventory & Ops Dashboard

- **P0** — As staff, I want a live dashboard of stock levels, so that I stop finding out a title
  is gone only when a customer asks.
- **P0** — As staff, I want low- and out-of-stock titles flagged automatically, so that I don't
  have to scan every row to notice a problem.
- **P0** — As staff, I want a fast, single-screen way to correct a stock count, so that
  reconciling is faster than crossing a line off a paper log.
- **P0** — As staff, I want the pending pre-order queue visible, so that I know what to pull before
  a customer arrives.
- **P1** — As staff, I want a "most frequently requested" list derived from real reservation
  activity, so that I can see demand without a second data-entry habit.
- **P2** — As staff, I want a "recently sold titles" report. *(Cut — no transaction/POS data
  exists to build it honestly; see Section 6 and Section 7.)*

### Product C — Customer Support Chatbot

- **P0** — As a customer, I want to ask if a specific title is in stock right now and get an
  honestly-aged answer, so that I can trust it more than a guess.
- **P0** — As a customer, I want the bot to hand me off to a human when it isn't confident, so
  that I'm not given a false sense of certainty.
- **P0** — As a customer, I want to ask about an upcoming event and get an answer sourced from the
  real event record, so that I'm not told something staff never confirmed.
- **P0** *(currently blocked — see Section 7, Blocker 1)* — As a customer, I want to ask store
  hours and return-policy questions and get an answer from real store data, so that I don't have
  to call for something a website should already know.
- **P2** — As a customer, I want to reach the store through Instagram or WhatsApp. *(Deferred —
  see Section 6.)*

### Product D — Marketing Content Generator

- **P0** — As staff, I want to pick a current book or event and generate three caption/post-idea
  variants, so that posting takes minutes instead of a blank-page stall.
- **P0** — As staff, I want every generated hard fact (title, author, price, date, time) to be
  protected from model invention, so that a fluent draft can't misstate something true.
- **P0** — As staff, I want to review, edit, copy, save a draft, or mark it ready before anything
  is used, so that nothing auto-publishes.
- **P1** — As staff, I want the generator backed by a real, configurable model provider instead of
  only fixtures, so that the deployed app produces real drafts, not just demo fixtures.
- **P2** — As staff, I want to generate an accompanying image. *(Deferred — see Section 6.)*

---

## 4. Success Metrics

**Quantitative**

- Product A: a two-browser race for the last copy resolves to exactly one winner and one clear
  "just went out of stock" message — proves the reservation race is solved, not assumed (ties to
  "no way to check stock/pre-order" pain point).
- Product B: a reconciliation update completes faster, informally, than crossing a line off a
  paper log; dashboard numbers match live Supabase data with zero mocked values (ties to the
  "staff don't notice out-of-stock titles" pain point).
- Product C: 100% of stock-status answers in tests classify correctly against the 24-hour
  `counted_at` boundary (confident / stale / deferred-to-staff) — proves the truth problem is
  actually solved, not just described (ties to both the stock-check and repeated-questions pain
  points).
- Product D: 3–5 timed staff walkthroughs complete selection-to-review in under one minute, and
  most resulting drafts are rated "publishable" or "minor edits" rather than "major rewrite" (ties
  to the inconsistent-social-posting pain point).

**Qualitative**

- A non-technical staff member can complete the loyalty-grant flow and the reconciliation flow
  without being trained on the app first — both are explicitly designed to beat a rubber
  stamp/paper log on speed, which is only true if it's true for someone unfamiliar with the UI.
- The Product D demo script shows one hard fact surviving generation unchanged, and one
  unsupported detail correctly highlighted for review — the two failure modes fact-protection
  exists to prevent.

---

## 5. Technical Requirements

#### Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind | Four separate apps/Vercel projects (A, B, C, D), one shared Supabase backend |
| Backend | Next.js Server Actions / Route Handlers | No separate backend service in any product — trusted-server logic lives in the same deploy |
| Database | Supabase (Postgres + RLS) | One shared project; `docs/schema.md` is the single field-list/ownership contract |
| Auth | Supabase Auth | Customers: email one-time code (Product A). Staff: shared `staff (user_id, role)` table, DB-enforced, not a client-set claim |
| Deployment | Vercel | Four independent deployments, deployable-at-every-phase for all four |
| Model provider (C, D only) | TBD, behind a provider-agnostic interface | Deterministic fake for tests/CI; free-tier or paid provider chosen at demo time — see `docs/model-access.md` |

Products A and B need no LLM at all. Only C and D do, and both use it strictly as a phrasing layer
over facts the application already fetched — never as the source of a fact.

#### Functional requirements

1. The system shall compute stock status as `available = on_hand - reserved`, never a bare count,
   and shall always attach the age of the underlying count (`counted_at`) to a stock-status
   display.
2. The system shall resolve a reservation race with a single atomic conditional `UPDATE`
   (`reserved = reserved + 1 WHERE on_hand - reserved >= 1`), never a check-then-write in
   application code.
3. The system shall reject any customer-session write to `loyalty_stamps` at the database level,
   with no insert path reachable from a customer session.
4. The system shall grant a loyalty stamp idempotently — a duplicate request id shall produce no
   second stamp.
5. The system shall update `inventory.on_hand` and `inventory.counted_at` together, in one atomic
   statement, with no code path that can write one without the other.
6. The system shall reject a reconciliation write that would set `on_hand` below the current
   `reserved` count, and shall surface the current `reserved` count in the error rather than a
   generic failure.
7. The system shall classify a support-chatbot message into one of a fixed intent set
   (`stock | hours | policy | event | other`) before fetching any fact.
8. The system shall render a deterministic fact block for the classified intent before any model
   call, and the model shall never see or query the database directly.
9. The system shall treat a stock answer as low-confidence whenever `inventory.counted_at` is
   older than 24 hours, and shall route to a staff handoff when confidence cannot be established
   at all (unknown title, missing data).
10. The system shall substitute real values for approved placeholder tokens
    (`{title}`, `{author}`, `{price}`, `{event_date}`, `{event_time}`) after generation, never
    trusting a model-emitted literal value for a protected fact.
11. The system shall highlight, in the review UI, any number, date, or capitalized name in a
    generated draft that does not appear in the fact block supplied to the model.
12. The system shall require staff authentication, enforced at the database (RLS) or server layer,
    for every write to `inventory.on_hand`/`inventory.counted_at` (reconciliation), `events`,
    `loyalty_stamps`, and `content_drafts`. This is narrower than "every write to `inventory`" —
    the customer-driven `reserved` increment in Requirement 2 runs through the authenticated
    customer reservation path, not staff auth; only the physical-count columns are staff-only.
13. The system shall reject any anonymous or non-staff session attempting to read
    `content_drafts` or the Product B dashboard/reconciliation routes.
14. The system shall run all four products' CI against a deterministic fixture generator/fake
    model — zero live model calls in CI, regardless of which provider is chosen for the deployed
    app.

#### Non-functional requirements

- **Performance**: Product C/D model responses are streamed; first token target under ~1s so the
  UI never reads as frozen. Product B's dashboard and reconciliation write should complete inside
  normal request latency — no stated hard target, single-digit concurrent users.
- **Security**: RLS is the enforcement layer, not application-level filtering. Cross-account
  isolation (Product A: customer A cannot read customer B's reservations/stamps) is a Phase 1 exit
  condition, not a hardening pass. No provider/API key ever reaches the client in Product C or D.
- **Accessibility**: WCAG-style requirements stated per-product rather than a blanket AA claim —
  status never carried by color alone, stamp card has a text-equivalent accessible name, tap
  targets meet 24×24 CSS px, `prefers-reduced-motion` respected, one-time-code field accepts
  paste, axe-core in Product A's test run.
- **Browser support**: not specified in any product doc — **flagged as a gap**, not assumed;
  default to evergreen Chrome/Firefox/Safari until stated otherwise.

#### Integrations / APIs

- **Supabase** (shared project): Postgres, Auth, RLS. Read/write per the ownership matrix in
  `docs/schema.md`.
- **Open Library** (Product A, seed-time only): CC0-licensed catalog data, fetched once into a
  committed fixture (`product-a/seed/books.fixture.json`). No runtime dependency, no live API call
  in the deployed app or CI.
- **LLM provider** (Products C, D): not yet chosen. Candidates and free-tier notes in
  `docs/model-access.md` §7 (Google AI Studio, Groq, GitHub Models, OpenRouter, Ollama for local
  dev, Anthropic/OpenAI paid). Selected via server-side config, never hardcoded.
- **Vercel**: four separate deployments, one per product, sharing no domain or bundle.

---

## 6. Out of Scope (v1)

- **Shipping / online checkout of any kind** — pickup only, no card form; if payment is ever
  required, a hosted checkout redirect only, deferred to v2.
- **Event ticket sales** — Product A owns event *data* (`docs/schema.md`) but explicitly does not
  sell tickets; a future scope decision if ever pursued.
- **True pre-order of unpublished titles** — the brief's "pre-order" reads as reservation of
  in-stock copies; ordering unpublished titles is a different feature with a different data model,
  deferred.
- **Multi-location support** — the store is single-location by brief; no product designs for a
  second location.
- **A generic book-recommendation engine** — nothing in the brief asks for one; Product C
  explicitly declines to become a general literary assistant.
- **"Recently sold titles" reporting** — cut because no transaction/POS data exists; inventing a
  `sales` table means staff double-entry at the register, which breaks the speed requirement the
  whole reconciliation flow exists to satisfy. Revisit only if a real POS integration happens.
- **Per-title low-stock thresholds** — MVP uses one fixed threshold (`available <= 2`); a
  per-title override is a plausible v2 once false positives/misses are visible in practice.
- **Financial/accounting reporting** (sell-through, margin, revenue) — needs a real transaction
  ledger this suite doesn't have.
- **Social publishing, scheduling, or account connections** (Product D) — drafts are reviewed and
  copied by staff; nothing in this suite posts on the store's behalf.
- **Image generation / Canva or Adobe Express integration** (Product D) — text and a post concept
  only; deliberately not competing with design tools.
- **Instagram/WhatsApp support channels** (Product C) — website-only for v1; social surfaces wait
  on event-data ownership and a staff-review workflow, both now less blocking than when this was
  written (see Section 7).
- **Automatic approval or any path that bypasses staff review** — every product with a
  human-in-the-loop step (A's reservation confirmation, D's Mark Ready) keeps that step mandatory.

---

## 7. Risks and Assumptions

| Scope | Risk / Assumption | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Product C | **Blocker 1 — No data source exists for `hours`/`policy` chatbot intents.** Product C's own `implementation_plan.md`, `tech_stack_recommendation.md`, and `docs/model-access.md` all list `hours` and `policy` as supported intents with a fact-block shape, but no table for store hours or return policy exists anywhere in `docs/schema.md` or any product's schema — unlike `stock` (`inventory`) and `event` (`events`), which are real. | High — this blocks 2 of Product C's 4 core intents from Phase 2 as written | High — two of the brief's five pain points (hours/policy questions pulling staff off the register) route through this gap | Needs a decision from **Product A (rhaeyyan)**, since `docs/schema.md` and its migrations are already A's job. Two paths: **(A) shared table** — add `store_info (id, hours_text, policy_text, updated_at)` to `docs/schema.md`, migrated by A, read by C and D; matches how every other cross-team fact (`stock`, `event`) is sourced — live, one place, no drift. **(B) static config** — a constants file Product C owns directly, no migration, faster to ship, but means Product C's "using current data" framing needs qualifying for these two intents specifically, since they'd be build-time facts, not live ones. Recommendation: Path A, since hours *do* change (holidays, seasonal) — but this is A's call, not a default to assume. |
| Product D | **Product D follow-up — `BookContentRecord.genre` has no backing column.** `books` in `docs/schema.md` has no `genre` field. Corrected from an earlier "blocker" framing: the field is already typed `string \| null`, and Product D's own Phase 1A rule ("missing optional fields remain `null`; never replaced with invented values") makes mapping `genre` to `null` on every row fully compliant — this does not actually break Phase 1B. | Low — no code path is forced to invent data | Low — a field that can only ever be `null` is a smaller design question, not a build blocker | Product D's call: drop the unused field, or treat it as a proposed schema addition for Product A to consider. Not urgent either way. |
| Product D | **Product D follow-up — `EventContentRecord`'s date/time shape and omitted `location`.** Corrected from an earlier "blocker" framing: mapping the shared `event_date` + `start_time` columns into one `startsAt` string is normal adapter work — the boundary types are documented as "required meanings," not literal column names, so this isn't a mismatch. `location` is a genuine gap only if Product D decides event content should reference the venue; for a single-location store this may not add much over "at Riverside Books." | Low | Low | Product D's call whether `location` is worth adding to the boundary type. No adapter-blocking issue as originally framed. |
| Repo-wide | **Stale cross-references: Products A, B, and D's own docs still describe now-resolved blockers as open.** `product-a/tech_stack_recommendation.md`'s "Open items", `product-b/implementation_plan.md` and `tech_stack_recommendation.md`'s "staff table not yet confirmed" language, and `product-d/implementation_plan.md`'s Phase 1B framing all predate PRs #25/#26 merging and haven't been synced (unlike `product-b/context.md`, which was synced in #26). | Medium — likely to cause a teammate to believe they're still blocked when they aren't, or to re-litigate a decided question | Low-Medium — costs time, not correctness, once noticed | A short doc-sync pass per product, same shape as PR #26's fix to `context.md`. Not urgent, but cheap and worth doing before Demo Day so nobody stalls on a phantom blocker. |
| Product B | **The `reservations` staff-read RLS policy (needed for Product B's pending-pre-order queue and most-requested query) is still awaiting Product A's sign-off**, since Product A owns that table's RLS today. Both `product-b/tech_stack_recommendation.md` and `implementation_plan.md` flag this as pending, not merged. | Medium — blocks Product B Phase 1/2 RLS work until granted | Medium | This is on the Product A owner (rhaeyyan) to review and approve when Product B opens the actual RLS PR — not yet done as of this PRD. |
| Repo-wide | **No POS system is assumed to exist.** Recorded once in `docs/assumptions.md`, load-bearing for three of the four products (loyalty, reconciliation, sales/demand scope). | Low that it's wrong (matches the brief's description of the store) | High if wrong — would remove or reshape Product A's loyalty feature and Product B's reason to exist | Already mitigated by writing the assumption down once instead of re-deriving it per product; revisit only if the store brief changes. |
| Product A | **48-hour reservation expiry is an unvalidated guess.** | Low | Low — easy to change, no structural dependency on the exact number | Confirm with a real store if this ever ships; otherwise ship the guess and note it. |
| Repo-wide | **Competitor pricing (Bookshop.org revenue share, IndieCommerce ABA membership) is unverified**, per Product A's own TODO item. | Low | Low — affects strategy-doc credibility, not the build | Two specific lookups, flagged as the only two that actually change a strategic answer; still open in `TODO.md`. |
| Repo-wide | **No user or staff research exists** — the store is fictional, so every operating assumption in `docs/assumptions.md` is stated, not observed. | Medium (assumptions could be wrong for a real store) | Medium — load-bearing for Product B's reconciliation UI and Product C's staleness threshold | Already mitigated as far as a fictional store allows — assumptions are explicit and reviewable rather than implied per-product. |
| Repo-wide | **LLM provider not yet chosen for Products C/D; free-tier limits in `docs/model-access.md` §7 are from secondary sources.** | Low | Low — both products are built against a provider-agnostic interface with a deterministic fake, so this is a config change, not a rework | Re-check the chosen vendor's own documentation before demo day per the doc's own caveat. |
| Product A | **Whether a ticketed event should grant a loyalty stamp is intentionally still open.** | Low | Low — decoupled from event-data ownership on purpose; doesn't block any current phase | Needs a team/store-assumption call whenever it becomes relevant; not urgent. |

---

## Summary for the team

**One real blocker from this review**, not previously tracked anywhere: the `hours`/`policy` data
source gap. Product D's field-drift from the PR #24 review is real but, per @crystalwatson-art's
correction during PR #29 review, doesn't actually break Phase 1B as originally framed — reclassified
from "blocker" to a smaller design follow-up Product D can resolve on their own schedule.
Everything else in Section 7 was already known in some form but scattered across five different
docs — this table is the first place all of it is in one list.

Nothing here blocks Phase 0 work for anyone. The `hours`/`policy` gap is the one worth raising at
the next sync soonest, since it sits on the brief's own pain points and nobody currently owns it.
