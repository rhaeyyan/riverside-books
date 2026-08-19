# Retro 2 — Riverside Books, 2026-08-19

23 commits authored today — 19 landed on `main`, 3 on the still-open `docs/multi-agent-orchestration` branch (PR #31), and 1 on the branch carrying this retro (PR #32) — from 10:48 AM to 6:43 PM.

**Commits:** 23 · **Contributors:** 4 (rhaeyyan 13, Cheewaiyip 4, Huma Ali 4, Crystal Watson 2) · **PRs opened:** 15 (10 merged, 3 closed unmerged, 2 open), plus #16 and #17 from yesterday merged this morning

## Morning — Product C ships the first app code (11:20 AM–1:51 PM)

- **Huma Ali** scaffolded `product-c-app/` for real (Next.js App Router, ESLint, package-lock) and landed a support-bot prototype in the same PR (#23) — the first application code anywhere in the repo, matching CLAUDE.md's "only `product-c-app/` has a real app" line for the first time instead of just stating it. Two follow-up pushes to the same PR ("align app ci and docs with actual scaffold", "resolve pr review blockers") got it green.
- **Cheewaiyip** and **Crystal Watson** each closed out their product's planning trio: `product-b/tech_stack_recommendation.md` + `implementation_plan.md` (PR #22) and `product-d/implementation_plan.md` (PR #24) — after this morning, all four products have a complete strategy/stack/plan set, not just Product A and D as of yesterday.

## Afternoon — schema cleanup and the unified PRD (2:04–3:36 PM)

- **rhaeyyan** published the shared `events` table to `docs/schema.md` and closed the event-data-ownership TODO item (PR #25), then made two follow-up fixes the same afternoon: the `inventory` write-ownership row and a `loyalty_stamps`/`staff` ownership + product-c table duplication cleanup. **Huma Ali** picked up the second fix same-day, adopting the corrected schema contract in `product-c/tech_stack_recommendation.md`.
- **Cheewaiyip** synced `product-b/context.md` to match the now-resolved sales/demand and staff decisions (PR #26), then fixed a stale `TODO.md` anchor pointing at the old version of that file (PR #27).
- **rhaeyyan** assembled `docs/PRD.md` — the whole-suite requirements doc pulling from all four products' planning docs plus the shared contracts (PR #29) — then landed two rounds of same-day review fixes: a missing scope column and a reclassified Product D risk, then a decision-ownership and stale-status-line fix.
- By end of afternoon, `TODO.md`'s cross-team section and all four per-product sections are checked off except one item each (A's unverified competitor pricing, D's backfill-research question) — both explicitly left open as judgment calls, not oversights.

## Evening — multi-agent orchestration pipeline (4:07–6:43 PM, still open)

**rhaeyyan** added the `tech-lead → sdet → builder → reviewer` roster and the `[SPEC]`/`[FORCES]`/`[COMPLIANCE-REPORT]`/`[COMPLETION-REPORT]` handoff schemas to `CLAUDE.md`, mirrored into `AGENTS.md`, `.claude/agents/`, `.codex/agents/*.toml`, and a new `.github/copilot-instructions.md` (PR #31 — this is the workflow this very retro was requested under). It went through two review rounds the same evening:

1. **Teammate review** — **Crystal Watson** caught three: the premise that Copilot has no custom-agent support was outdated, `product-d/tech_stack_recommendation.md` was named as a required `tech-lead` input but doesn't exist (which would have blocked Product D's default flow immediately), and `product-c-app/` was missing from CODEOWNERS despite the docs describing it as rhaeyyan-reviewed. **Cheewaiyip** caught three more: the CI description claimed a format-check step and coverage that `ci.yml` doesn't run, `sdet`'s "may only edit test files" restriction isn't actually enforced by its tool grant, and both files still carried the Product-A-only title. **Huma Ali** also reviewed. Commit `a71c346` addressed all six.
2. **Self-review pass** (`b5143c3`, 6:43 PM) — found that Cheewaiyip's coverage finding was only half-fixed: the CI line was corrected, but the Commands section, the `[COMPLIANCE-REPORT]` schema, and `sdet`'s own audit step all still asked for a coverage figure that no command in this repo can produce. The same round found that the **Directory boundary** — the headline new rule, the one CODEOWNERS exists to back — is equally prompt-level-only for `builder` and `reviewer`, which the first fix had disclosed for `sdet` alone.

**Still open** as of this writing — the one PR from today without a green merge yet.

The pattern worth keeping: both rounds found the same *class* of defect — a doc confidently describing tooling the repo doesn't actually have. That's the failure mode a docs-heavy day is most prone to, and the only thing that caught it either time was someone checking the claim against `package.json` and `ci.yml` rather than reading for plausibility.

## The auto-PR backstop fired five times today, and caught inconsistent results

Retro 1 flagged the "missing PR" failure mode and shipped `auto-pr.yml` as a backstop. Today shows the backstop is still firing constantly — five pushes went out today without a human opening the PR first (PRs #20, #21, #24, #28, #30, all opened by `app/github-actions[bot]`) — and it doesn't fully cover for the habit:

- **#21, #28, #30** were caught correctly: closed within seconds to minutes of the bot opening them, then reopened properly by the actual author (#22, #29, #31), matching CLAUDE.md's documented recovery path.
- **#24** stayed bot-authored and merged — but only passed CI because Crystal Watson's follow-up commit ("address planning review") happened to trigger it, per the documented "CI only starts once a human pushes a further commit" behavior. Working as designed, but by accident of timing rather than by anyone noticing the gap.
- **#20** stayed bot-authored, **CI ran and failed** ("Dependencies lock file is not found" — the branch was cut before `product-c-app/package-lock.json` existed on `main`), and it was **merged anyway**, by a teammate (humaali-create) other than the PR's own author. Nothing in the current process stops a red check from being merged, since CI isn't yet a required status check on `main` — this is exactly the gap the Commands section already flags ("enable that once a given job first runs green").

**Worth raising at the next sync:** wire up branch protection for the `ci` job now that it has run green multiple times today, so a failing check can't be merged past silently — that closes the one real gap the backstop doesn't cover.

## Net state

All four products now have complete planning docs, a shared `docs/schema.md`/`docs/PRD.md`/`docs/assumptions.md`/`docs/model-access.md` contract set, and `TODO.md` nearly fully resolved. Product C has the only scaffolded app and the only prototype code. The multi-agent role system that should shape all future build sessions is written and twice-reviewed but not yet merged (PR #31 open, three commits). Next gate: Product A, B, and D's Phase 0 scaffolding — still nobody but Product C has a deployable app.

Two process items carry into tomorrow: making `ci` a required status check (above), and merging #31 so the next build session actually runs under the roster it defines.
