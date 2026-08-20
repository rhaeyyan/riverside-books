# Riverside Books — Multi-Product Team Repo

Team build for the Cycle 4 "Direct-to-Consumer Retail" project brief (`docs/Cycle 4_ Project briefs.md`), shared across four collaborators in this one repo, each owning a product directory:

| Product | Directory | Owner |
| --- | --- | --- |
| A — Customer Ordering & Loyalty App | `product-a/` | [@rhaeyyan](https://github.com/rhaeyyan) |
| B — Staff Inventory & Ops Dashboard | `product-b/` | [@Cheewaiyip](https://github.com/Cheewaiyip) |
| C — Customer Support Chatbot (docs) | `product-c/` | [@humaali-create](https://github.com/humaali-create) |
| C — Customer Support Chatbot (app shell) | `product-c-app/` | [@humaali-create](https://github.com/humaali-create) |
| D — Marketing Content Generator | `product-d/` | [@crystalwatson-art](https://github.com/crystalwatson-art) |

This file is the standalone, canonical source for this repo's protocols — GitHub workflow, engineering standards, and the multi-agent build workflow below — so any teammate's agent session behaves the same way without cross-referencing a second document. `AGENTS.md` mirrors it for Codex CLI; keep both in sync when a rule changes (see Notes).

## Stack & docs

- **Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth), deployed on Vercel.** One app per product, one shared Supabase project. Per-product reasoning lives in each product's own `tech_stack_recommendation.md` where one exists yet (not every product has written theirs — see Current scaffolding state below) — don't re-derive a stack decision already made there.
- **`docs/PRD.md` is the whole-suite requirements source of truth** — problem statement, user stories (P0/P1/P2), success metrics, technical requirements, out-of-scope, and the live risk/blocker log (Section 7). Read it before starting non-trivial work on any product; it's assembled from all four products' docs and is the fastest way to see how a change in one product affects the others.
- **`docs/schema.md` is the single shared table contract.** Product A owns and migrates every table listed there; other products read it rather than restating field lists locally — restating is exactly how this repo's schema drifted before that file existed (three independently-invented `events` shapes at one point). If a task needs a new or changed shared table, that's a cross-team decision, not something to make inline — see the Directory boundary rule below.
- **`docs/assumptions.md`** records the store's stated operating assumptions (no POS exists, staffing, catalog size, reconciliation cadence) once, for all four products to build against — the store is fictional, so these are stated rather than researched.
- **`docs/model-access.md`** is the shared LLM-access research for Products C and D: which products need a model (only C and D, and narrowly), cost, latency, provider options, and the grounding/fact-protection architecture both products build against. Read this before writing model-calling code in either product.
- **Per-product build plans**: each product's own `implementation_plan.md` is phased, with exit conditions per phase. Nothing after a product's Phase 0 is allowed to break that product's deployment.
- **Current scaffolding state**: only `product-c-app/` has a real Next.js app as of this writing. `product-a/`, `product-b/`, and `product-d/` have docs (`market_strategy.md`, `implementation_plan.md`, and `tech_stack_recommendation.md` for A and B — Product D hasn't written one yet) but no scaffolded app — their Phase 0 is the next unit of work in each case.

## Commands

Each product app is its own npm project — run these from inside `product-c-app/` today, and from inside the equivalent `product-X-app/` (or `product-a/`, if that ends up unprefixed) once the other three scaffold theirs. There is no root-level `package.json`.

- `npm run dev` — local dev server. `npm run build` / `npm run start` — production build/serve.
- `npm run lint` — app code (ESLint). There is **no `format`/`format:check` script** in `product-c-app` — `.prettierrc.json` exists at the repo root, but nothing currently runs it (see the markdown bullet below).
- `npm run typecheck` — Vitest and ESLint do **not** type-check; a type error in a test file is invisible without this. For a Next.js app, run `next typegen` first (or as part of the script) — a bare `tsc --noEmit` can't see Next's generated route/layout types otherwise.
- `npm run test` — Vitest (`vitest run`). **No coverage is collected** — no `--coverage` flag, no `coverage` block in `vitest.config.ts`, and no `@vitest/coverage-v8` installed — so nothing in this repo can report a coverage figure today.
- Root-level `lint:md` / `format:md` / `format:md:check` (markdownlint-cli2/Prettier for docs) are referenced by `CONTRIBUTING.md` but not yet wired into any `package.json` — `.github/workflows/ci.yml` currently only runs `product-c-app`'s steps. When you scaffold your own product's app, add your own CI job to that workflow following `product-c-app`'s job as the template (working-directory-scoped steps, its own job name) rather than assuming a shared root job exists.

## Git workflow

- **Feature branches + PRs only — never commit directly to `main`.** Branch protection on GitHub blocks direct pushes to `main`, including for the repo admin.
- **Every PR needs at least 1 approving review before merging.** `.github/CODEOWNERS` makes **@rhaeyyan the required reviewer for `product-b/`, `product-c/`, `product-c-app/`, and `product-d/`** — a PR touching one of those gets auto-requested to rhaeyyan and needs their approval to merge. `product-a/` and shared paths (docs, `.github/`, root config) list all four collaborators as eligible reviewers instead, specifically so rhaeyyan's own PRs always have someone else eligible to approve them.
- **Open your own PR after pushing — don't have someone else, or another account's agent session, open it for you.** GitHub attributes PR authorship to whoever calls `gh pr create` / clicks "New pull request", not whoever authored the commits. If rhaeyyan (or an agent acting as rhaeyyan) opens a PR on a teammate's behalf, GitHub treats rhaeyyan as the author and excludes them from their own required-reviewer list — the exact deadlock `CODEOWNERS` exists to prevent. This applies equally to any agent session, proposed workflow or not: an agent pushes the branch; the human running that session opens the PR themselves, under their own account.
- **A safety net exists, but don't rely on it.** `.github/workflows/auto-pr.yml` opens a PR automatically for any push to a non-`main` branch that doesn't already have one open — this catches pushes to an old, already-merged branch name instead of a fresh one (which has happened repeatedly: commits landed with no PR because they were pushed to a branch whose first PR was already merged). It's a backstop for forgetting, not a substitute for opening your own PR: a bot-opened PR is authored by `github-actions[bot]`, and GitHub does **not** run other workflows (including CI) in response to a bot-authored PR-open event — CI only starts once a human pushes a further commit to that branch.
- **Rebase is the merge strategy**, enforced at the GitHub repo level (squash and merge-commit are disabled). Keep feature branches rebased on `main` before merging.
- Branches are auto-deleted on merge.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every push/PR, scoped per product as each app is scaffolded (see Commands above) — format-check and a coverage gate run nowhere: not in the workflow, and not as local commands either, since `product-c-app` has no `format`/`format:check` script and no coverage tooling installed. It is not yet a required status check on `main` — enable that once a given job first runs green:

  ```bash
  gh api repos/rhaeyyan/riverside-books/branches/main/protection/required_status_checks \
    -X PATCH -f strict=true -f 'contexts[]=<job-name>'
  ```

## Engineering standards

- **Conventional Commits, enforced at commit time.** Once Husky is installed (`npm install` triggers `prepare`), `.husky/commit-msg` runs `commitlint` (`commitlint.config.cjs`, extends `@commitlint/config-conventional`) — a message without a `type:` prefix is rejected.
- **No AI `Co-Authored-By` trailers.** The same hook rejects any `Co-Authored-By:` trailer naming an AI tool (Claude, Anthropic, OpenAI, ChatGPT, GPT-, Copilot, Gemini, Codex, or the word "AI"). **When Claude Code, Codex, or Copilot commits in this repo, it must not add a `Co-Authored-By:` trailer naming itself or any AI tool** — the hook will block it once wired up in a given product's app, and the rule applies regardless of whether the hook is live yet.
- **LF line endings everywhere**, enforced via `.gitattributes` (`* text=auto eol=lf`) — don't bypass it.
- **Pre-commit hook** (`.husky/pre-commit`) runs lint-staged plus the full test suite — a deliberately narrower, fast local gate. CI is the authoritative one; run `npm run typecheck` yourself before pushing since neither Vitest nor ESLint catches type errors.
- Don't commit with `--no-verify`. If a hook fails, fix the underlying issue.
- **Markdown lint + format**: `npm run lint:md` and `npm run format:md` (Prettier, `.prettierrc.json` sets `proseWrap: "never"`, so paragraphs stay on one unwrapped line) — see the Commands note above on where these currently live in CI.
- **SOLID, applied proportionally.** Favor small, single-responsibility modules and dependency inversion at integration boundaries (e.g. the Supabase client behind an interface, not scattered `fetch`/query calls; the LLM provider behind one interface with a deterministic fake, per `docs/model-access.md` §8). Don't apply patterns ceremonially to trivial code.

## Integrity Boundary

The one rule that's non-negotiable regardless of how much process ceremony a given change gets, in two forms depending on the product:

- **Products A and B (data-integrity form).** Availability, reservation, and stock-count state are computed and constrained in the database — the `inventory_reserved_sane` check constraint, `not null` columns, RLS policies, and atomic writes — never assumed or recomputed in application code. Product A's cross-account RLS isolation test is a hard Phase 1 exit condition and runs in CI from that point on; Product B's atomic reconciliation write (`on_hand` and `counted_at` change together, in one statement, or not at all) is the same rule from the write side.
- **Products C and D (model-fact-boundary form).** Per `docs/model-access.md`: the model is a phrasing layer only. It never queries the database directly, never invents a fact, and every protected value (stock status, price, date, title, event fields) is rendered or substituted deterministically before or after the model call — never trusted from raw model output. CI never calls a live model; a deterministic fake is what tests run against, and "which provider" stays a config value chosen at demo time, not a build-time commitment.

Any task — human-driven or agent-dispatched — that touches inventory/reservation/loyalty state, or the C/D model call boundary, states which form applies and how it's verified. See "Integrity Boundary" in the `[SPEC]` schema below.

## Multi-agent build workflow

**This is the required workflow for non-trivial work on any product.** Every collaborator's agent sessions — Claude Code or Codex CLI — route non-trivial asks through this roster rather than building ad hoc: it's how a `[SPEC]` gets a stated Integrity Boundary instead of an assumed one, and how a session scoped to one product directory still stays aware of what the other three are doing (see "Where context comes from," below). Trivial one-file changes still skip straight to `builder` — see the roster table.

This is a four-person team where each collaborator owns one product directory and runs their own build sessions independently — not one shared pairing session. The same lean roster applies to whichever product directory a session is scoped to. Role-named agents (`.claude/agents/`, mirrored in `.codex/agents/*.toml`) so any teammate can tell what an agent does without cross-referencing a roster:

| Agent | Role | May edit files? | When |
| --- | --- | --- | --- |
| `tech-lead` | Plans | No (read-only) | Non-trivial feature asks — turns them into a `[SPEC]` (TDD) or `[SPIKE]` (exploratory) task: ≤5 files, names a Verification Oracle, states the Integrity Boundary. Skip for trivial one-file changes; go straight to `builder`. |
| `sdet` | Tests | Tests only | Writes the failing test first per the `[SPEC]`'s oracle (TDD red), then audits `builder`'s completed work — PASS/FAIL, including whether the Integrity Boundary held. |
| `builder` | Implements | Yes | Single full-stack implementer for the one product directory the session is scoped to — makes `sdet`'s red go green. |
| `reviewer` | Mediates/refactors | Yes (refactors) | **On-demand only.** Mediates after 2 failed `sdet` cycles on the same task, or handles a mechanical refactor spanning more than 5 files within that same product's directory. |

**Directory boundary** — the rule a single-app hackathon roster wouldn't need, but this repo does: every agent operates inside the one product directory (and its `-app` sibling, e.g. `product-c/` + `product-c-app/`) the session is scoped to, plus read access to the shared contracts (`docs/PRD.md`, `docs/schema.md`, `docs/assumptions.md`, `docs/model-access.md`, `TODO.md`, root `CLAUDE.md`/`AGENTS.md`). No agent edits another product's directory or a shared `docs/` file directly, even to fix something — `CODEOWNERS` makes rhaeyyan the required reviewer for `product-b/`, `product-c/`, `product-c-app/`, and `product-d/` precisely because those are someone else's files, and a shared `docs/` change affects every product's owner, not just the one running the session. If a task needs a change to a shared contract or another product's directory, `tech-lead` flags it in the `[SPEC]` as a cross-team dependency rather than scoping the task to touch it, and the human running the session raises it with the owning teammate — a PR comment, a `TODO.md` item, or a `docs/PRD.md` Section 7 risk row, matching how every cross-team item has actually been resolved so far this cycle.

**Where context comes from, per product — and how this keeps every product's agents aware of the other three:** `docs/PRD.md` for whole-suite requirements and the live risk log (Section 7 is the fastest way to see what the other three products are blocked on or currently changing); the product's own `market_strategy.md` (why), `tech_stack_recommendation.md` (technical decisions and their reasoning, where the product has written one), and `implementation_plan.md` (phased plan with exit conditions — pull each phase's `[SPEC]` from there rather than re-deriving one from scratch); `docs/schema.md` and `docs/assumptions.md` for the shared table contract and store-wide assumptions every product builds against. `tech-lead` reads **all** of the relevant ones — not just the scoped product's own docs — before writing any `[SPEC]`, and treats a stale or missing entry in `docs/PRD.md` §7 or `TODO.md`'s cross-team section as something to raise, not skip past. This is the mechanism for tracking the overall shared build: no separate coordinator agent or ledger, because these documents are already the shared state, and every session that touches them keeps them current for the next one.

**What's deliberately cut**, matching this team's actual ceremony level rather than importing a larger process wholesale: no dedicated routing/cross-team-coordinator agent (`tech-lead`'s read of the shared contracts above, plus the human running the session, does this job instead); no `SESSION_STATE.md` ledger (git history plus each product's `implementation_plan.md` phase list are enough continuity across sessions); no per-task `specs/NNN-slug.md` files (a `[SPEC]` is relayed inline in the handoff, not persisted to disk). Decisions that are costly to reverse still get recorded — in the product's own `implementation_plan.md` "Open decisions" section, or in `docs/schema.md`/`docs/assumptions.md`/`docs/PRD.md` if cross-team — matching the pattern already used across this repo rather than introducing a new `docs/adr/` directory this team doesn't otherwise use.

**Default flow:** non-trivial ask → `tech-lead` (`[SPEC]`) → `sdet` (red) → `builder` (green) → `sdet` (audit) → `builder` pushes the branch → the human opens the PR under their own account (per Git workflow above). Trivial changes skip straight to `builder`. This composes with, not replaces, the TDD/CI/Conventional-Commits/no-AI-trailer rules above — the agents are how those rules get executed, not an additional layer on top of them.

### Handoff Schemas

Canonical location — the agent files in `.claude/agents/` and `.codex/agents/*.toml` reference these by name and must not restate or vary them. If a schema needs to change, change it here first so every agent (and every teammate's tool) stays in sync.

**`[SPEC]` / `[SPIKE]`** — `tech-lead` → `sdet` → `builder`

```markdown
[SPEC] / [SPIKE]

- **Product**: <A | B | C | D — which product directory this task is scoped to>
- **Objective**: <what the code must achieve>
- **Inputs/Outputs**: <types, shapes, API/route contract>
- **Integrity Boundary**: <data-integrity or model-fact-boundary form — required if the task touches inventory/reservation/loyalty state or a C/D model call>
- **Verification Oracle**: <REQUIRED. Where the failure is observable — a Vitest/RTL test, a Playwright flow, an RLS/access test, a route test>
- **Constraints**: <performance, forbidden libraries, style>
- **Edge Cases**: <error handling, race conditions, stale data, LLM failure/timeout, RLS denial>
- **Files**: <max 5 files this task may touch, all within the scoped product directory>
```

**`[FORCES]`** — attached to every `[SPEC]`/`[SPIKE]`

```markdown
[FORCES]

1. <Primary force> > <Secondary force>
```

No default force is imposed — `tech-lead` states the actual trade-off for the task at hand rather than falling back to a fixed hierarchy.

**`[COMPLIANCE-REPORT]`** — `sdet` → `tech-lead` / `builder`

```markdown
[COMPLIANCE-REPORT]

- **Status**: PASS | FAIL
- **Oracle run**: <the SPEC's declared oracle, the exact command, and its verdict>
- **Coverage**: <`not collected` — no product app has coverage tooling wired up today, and there is no repo-wide numeric gate; report a figure only once a product actually collects one>
- **Integrity Boundary check**: <held / violated — where>
- **Critical violations**: <must fix before merge; empty if PASS>
- **Recommendations**: <non-blocking improvements>
```

**`[COMPLETION-REPORT]`** — `builder` → `sdet`

```markdown
[COMPLETION-REPORT]

- **Files changed**: <list>
- **Spec items satisfied**: <checklist against the SPEC>
- **Oracle status**: <the declared oracle, the command run, and its verdict>
- **Integrity Boundary**: <confirm what's DB-enforced vs. model-generated, if the task touched either form>
- **Known gaps**: <anything deferred, or "none">
```

**Rejection loop (circuit breaker):** `sdet` FAIL → `builder` retries in the same continuation, not a fresh dispatch. After 2 failed cycles on the same task, stop and escalate to `reviewer` — don't retry a third time.

## Notes

- **Four-person team, one shared multi-agent build roster.** Every collaborator's build sessions — Claude Code or Codex CLI — route non-trivial work through the `tech-lead → sdet → builder → reviewer` workflow and `[SPEC]`/handoff protocol defined above; trivial one-file changes still skip straight to `builder`. This is how a session scoped to one product directory keeps track of the other three, not an extra layer on top of working normally.
- **`AGENTS.md` mirrors this file for Codex CLI**, which reads `AGENTS.md` automatically and does not read `CLAUDE.md`, `.claude/agents/`, or `.claude/skills/`. Codex-facing versions of the four roles live in `.codex/agents/*.toml`. Keep both files in sync — a substantive rule change belongs in both.
- **No GitHub Copilot instructions file.** Nothing in this repo's history shows anyone using Copilot (no branch, commit, or PR came from it), so a third copy of these rules would rot unread — it was deliberately not added rather than overlooked. If you do adopt Copilot, add `.github/copilot-instructions.md` (Copilot Chat reads it automatically) and `.github/agents/` profiles for the four roles, and say so here; until then Copilot users should read this file directly.
- See `CONTRIBUTING.md` for the git/commit rules in prose form, and `SECURITY.md` for the data/auth model (Supabase Auth, RLS-scoped customer data) — currently written for Product A; extend it as the other products land auth/data of their own.
