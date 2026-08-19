# Retro 2 — Riverside Books, 2026-08-19

21 commits authored today (19 landed on `main`, 2 sitting on the still-open `docs/multi-agent-orchestration` branch) — 10:48 AM to 6:21 PM.

**Commits:** 21 · **Contributors:** 4 (rhaeyyan 11, Cheewaiyip 4, Huma Ali 4, Crystal Watson 2) · **PRs opened:** 13 (10 merged, 3 closed unmerged, 1 open)

## Morning — Product C ships the first app code (11:20 AM–1:51 PM)

- **Huma Ali** scaffolded `product-c-app/` for real (Next.js App Router, ESLint, package-lock) and landed a support-bot prototype in the same PR (#23) — the first application code anywhere in the repo, matching CLAUDE.md's "only `product-c-app/` has a real app" line for the first time instead of just stating it. Two follow-up pushes to the same PR ("align app ci and docs with actual scaffold", "resolve pr review blockers") got it green.
- **Cheewaiyip** and **Crystal Watson** each closed out their product's planning trio: `product-b/tech_stack_recommendation.md` + `implementation_plan.md` (PR #22) and `product-d/implementation_plan.md` (PR #24) — after this morning, all four products have a complete strategy/stack/plan set, not just Product A and D as of yesterday.

## Afternoon — schema cleanup and the unified PRD (2:04–3:36 PM)

- **rhaeyyan** published the shared `events` table to `docs/schema.md` and closed the event-data-ownership TODO item (PR #25), then made two follow-up fixes the same afternoon: the `inventory` write-ownership row and a `loyalty_stamps`/`staff` ownership + product-c table duplication cleanup. **Huma Ali** picked up the second fix same-day, adopting the corrected schema contract in `product-c/tech_stack_recommendation.md`.
- **Cheewaiyip** synced `product-b/context.md` to match the now-resolved sales/demand and staff decisions (PR #26), then fixed a stale `TODO.md` anchor pointing at the old version of that file (PR #27).
- **rhaeyyan** assembled `docs/PRD.md` — the whole-suite requirements doc pulling from all four products' planning docs plus the shared contracts (PR #29) — then landed two rounds of same-day review fixes: a missing scope column and a reclassified Product D risk, then a decision-ownership and stale-status-line fix.
- By end of afternoon, `TODO.md`'s cross-team section and all four per-product sections are checked off except one item each (A's unverified competitor pricing, D's backfill-research question) — both explicitly left open as judgment calls, not oversights.

## Evening — multi-agent orchestration pipeline (4:07–6:21 PM, still open)

- **rhaeyyan** added the `tech-lead → sdet → builder → reviewer` roster and the `[SPEC]`/`[FORCES]`/`[COMPLIANCE-REPORT]`/`[COMPLETION-REPORT]` handoff schemas to `CLAUDE.md` (PR #31 — this is the workflow this very retro was requested under). Review comments came in from **Cheewaiyip**, **Huma Ali**, and **Crystal Watson**; a same-day follow-up commit addressed all three reviewers' feedback. **Still open** as of this writing — the one PR from today without a green merge yet.

## The auto-PR backstop fired five times today, and caught inconsistent results

Retro 1 flagged the "missing PR" failure mode and shipped `auto-pr.yml` as a backstop. Today shows the backstop is still firing constantly — five pushes went out today without a human opening the PR first (PRs #20, #21, #24, #28, #30, all opened by `app/github-actions[bot]`) — and it doesn't fully cover for the habit:

- **#21, #28, #30** were caught correctly: closed within seconds to minutes of the bot opening them, then reopened properly by the actual author (#22, #29, #31), matching CLAUDE.md's documented recovery path.
- **#24** stayed bot-authored and merged — but only passed CI because Crystal Watson's follow-up commit ("address planning review") happened to trigger it, per the documented "CI only starts once a human pushes a further commit" behavior. Working as designed, but by accident of timing rather than by anyone noticing the gap.
- **#20** stayed bot-authored, **CI ran and failed** ("Dependencies lock file is not found" — the branch was cut before `product-c-app/package-lock.json` existed on `main`), and it was **merged anyway**, by a teammate (humaali-create) other than the PR's own author. Nothing in the current process stops a red check from being merged, since CI isn't yet a required status check on `main` — this is exactly the gap the Commands section already flags ("enable that once a given job first runs green").

**Worth raising at the next sync:** wire up branch protection for the `ci` job now that it has run green multiple times today, so a failing check can't be merged past silently — that closes the one real gap the backstop doesn't cover.

## Net state

All four products now have complete planning docs, a shared `docs/schema.md`/`docs/PRD.md`/`docs/assumptions.md`/`docs/model-access.md` contract set, and `TODO.md` nearly fully resolved. Product C has the only scaffolded app and the only prototype code. The multi-agent role system that should shape all future build sessions is written but not yet merged (PR #31 open). Next gate: Product A, B, and D's Phase 0 scaffolding — still nobody but Product C has a deployable app.
