# Retro 2 — Riverside Books, 2026-08-19

27 commits authored today, from 10:48 AM to 7:13 PM — 19 landed on `main`, and 8 sit across four still-open branches: the agent pipeline (#31), this retro (#32), a CI guard (#34), and a code-standards proposal (#36).

**Commits:** 27 · **Contributors:** 4 (rhaeyyan 17, Cheewaiyip 4, Huma Ali 4, Crystal Watson 2) · **PRs opened:** 19 (10 merged, 5 closed unmerged, 4 open), plus #16 and #17 from yesterday merged this morning

## Morning — Product C ships the first app code (11:20 AM–1:51 PM)

- **Huma Ali** scaffolded `product-c-app/` for real (Next.js App Router, ESLint, package-lock) and landed a support-bot prototype in the same PR (#23) — the first application code anywhere in the repo, matching CLAUDE.md's "only `product-c-app/` has a real app" line for the first time instead of just stating it. Two follow-up pushes to the same PR ("align app ci and docs with actual scaffold", "resolve pr review blockers") got it green.
- **Cheewaiyip** closed out Product B's planning trio: `product-b/tech_stack_recommendation.md` + `implementation_plan.md` (PR #22). **Crystal Watson** landed `product-d/implementation_plan.md` (PR #24) — Product D's market strategy already existed, but it still has no `tech_stack_recommendation.md`, so B is the only product to complete its trio this morning.

## Afternoon — schema cleanup and the unified PRD (2:04–3:36 PM)

- **rhaeyyan** published the shared `events` table to `docs/schema.md` and closed the event-data-ownership TODO item (PR #25), then made two follow-up fixes the same afternoon: the `inventory` write-ownership row and a `loyalty_stamps`/`staff` ownership + product-c table duplication cleanup. **Huma Ali** picked up the second fix same-day, adopting the corrected schema contract in `product-c/tech_stack_recommendation.md`.
- **Cheewaiyip** synced `product-b/context.md` to match the now-resolved sales/demand and staff decisions (PR #26), then fixed a stale `TODO.md` anchor pointing at the old version of that file (PR #27).
- **rhaeyyan** assembled `docs/PRD.md` — the whole-suite requirements doc pulling from all four products' planning docs plus the shared contracts (PR #29) — then landed two rounds of same-day review fixes: a missing scope column and a reclassified Product D risk, then a decision-ownership and stale-status-line fix.
- By end of afternoon, `TODO.md`'s cross-team section and all four per-product sections are checked off except one item each (A's unverified competitor pricing, D's backfill-research question) — both explicitly left open as judgment calls, not oversights.

## Evening — multi-agent orchestration pipeline (4:07–6:58 PM, still open)

**rhaeyyan** added the `tech-lead → sdet → builder → reviewer` roster and the `[SPEC]`/`[FORCES]`/`[COMPLIANCE-REPORT]`/`[COMPLETION-REPORT]` handoff schemas to `CLAUDE.md`, mirrored into `AGENTS.md`, `.claude/agents/`, `.codex/agents/*.toml`, and a new `.github/copilot-instructions.md` (PR #31 — this is the workflow this very retro was requested under). It went through two review rounds the same evening:

1. **Teammate review** — **Crystal Watson** caught three: the premise that Copilot has no custom-agent support was outdated, `product-d/tech_stack_recommendation.md` was named as a required `tech-lead` input but doesn't exist (which would have blocked Product D's default flow immediately), and `product-c-app/` was missing from CODEOWNERS despite the docs describing it as rhaeyyan-reviewed. **Cheewaiyip** caught three more: the CI description claimed a format-check step and coverage that `ci.yml` doesn't run, `sdet`'s "may only edit test files" restriction isn't actually enforced by its tool grant, and both files still carried the Product-A-only title. **Huma Ali** also reviewed. Commit `a71c346` addressed all six.
2. **Self-review pass** (`b5143c3`, 6:43 PM) — found that Cheewaiyip's coverage finding was only half-fixed: the CI line was corrected, but the Commands section, the `[COMPLIANCE-REPORT]` schema, and `sdet`'s own audit step all still asked for a coverage figure that no command in this repo can produce. The same round found that the **Directory boundary** — the headline new rule, the one CODEOWNERS exists to back — is equally prompt-level-only for `builder` and `reviewer`, which the first fix had disclosed for `sdet` alone.

Both rounds found the same *class* of defect: **a doc confidently describing tooling this repo doesn't actually have.** Neither instance was drift between the mirrored files — both were wrong in the original and got faithfully copied — so deduplicating `CLAUDE.md`/`AGENTS.md`, the refactor that looks obvious here, wouldn't have caught either. What caught them was checking the claim against `package.json` and `ci.yml` instead of reading for plausibility.

A third commit (`c9df853`) dropped `.github/copilot-instructions.md` from the PR. Searching the repo's history turned up no evidence anyone uses Copilot — no branch, commit, or PR came from it — while Codex is demonstrably in use (#7, #11, #13, and Crystal Watson's #24 all came off `codex/*` branches). A third copy of the ground rules that nobody reads is still a third copy to keep in sync, and the first fix round had already had to touch it. Both root docs now record the absence as deliberate, and the question is out to the team on the PR in case someone does use it.

That finding is what the rest of the evening came out of.

## Night — the two PRs that came out of that finding (6:58–7:13 PM)

**PR #34 — a CI check for the defect class.** `.github/scripts/check-doc-commands.py`, wired as a new `docs` job: it fails when `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, or `.github/*.md` reference an `npm run` script no `package.json` defines. Docs can still describe future state, but the script name has to go in an allowlist *with a reason*, which makes it a deliberate act a reviewer can see. **It found one on its first run:** `CONTRIBUTING.md` has been telling contributors to run `npm run format:check` before every push, and that script has never existed — the same bug Cheewaiyip caught in `CLAUDE.md`, sitting in the doc nobody re-read.

This started life inside #31 and was split back out, since it's independent and #31's reviewers had already read that PR twice.

**PR #36 — a documentation-comment standard, proposed not imposed.** The prompt was "make sure everyone follows SOLID." The honest finding: SOLID is already written down three times (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`), none of it is enforced, and a fourth restatement changes nothing — no linter can check whether a dependency is inverted. Docstrings are the opposite case: **completely absent** (zero mentions repo-wide, stock `eslint-config-next`) and mechanically enforceable. So the proposal is TSDoc required on exported symbols only, with function-size and complexity rules as warnings — proxies for single-responsibility, explicitly not a measurement of it.

Two details worth recording:

- **"Google-style docstrings" don't apply to this repo.** That's a Python convention (`Args:`/`Returns:`/`Raises:`). TSDoc is the TypeScript equivalent, and it's what editor tooltips and `typedoc` actually read.
- **The config was verified before being proposed**, against a throwaway copy of `product-c-app` — which is the whole point, given what the day's two review rounds were about. It reports two missing doc comments and one size warning (`Home` is 93 lines against a 60 limit), so Product C's adoption cost is concrete and small rather than hypothetical.

Nothing in #36 touches a product directory. It's a shared-contract proposal needing the other three owners to ratify it, tracked in `TODO.md` — the same route every cross-team item has taken this cycle.

## The auto-PR backstop fired seven times today, and caught inconsistent results

Retro 1 flagged the "missing PR" failure mode and shipped `auto-pr.yml` as a backstop. Today shows the backstop firing constantly — **seven** pushes went out without a human opening the PR first (#20, #21, #24, #28, #30, #33, #35, all opened by `app/github-actions[bot]`) — and it doesn't fully cover for the habit:

- **#21, #28, #30, #33, #35** were caught correctly: closed within seconds to minutes of the bot opening them, then reopened properly by the actual author (#22, #29, #31, #34, #36), matching CLAUDE.md's documented recovery path.
- **#24** stayed bot-authored and merged — but only passed CI because Crystal Watson's follow-up commit ("address planning review") happened to trigger it, per the documented "CI only starts once a human pushes a further commit" behavior. Working as designed, but by accident of timing rather than by anyone noticing the gap.
- **#20** stayed bot-authored, **CI ran and failed** ("Dependencies lock file is not found" — the branch was cut before `product-c-app/package-lock.json` existed on `main`), and it was **merged anyway**, by a teammate (humaali-create) other than the PR's own author. Nothing in the current process stops a red check from being merged, since CI isn't yet a required status check on `main` — this is exactly the gap the Commands section already flags ("enable that once a given job first runs green").

**Worth raising at the next sync:** wire up branch protection for the `ci` job now that it has run green many times today, so a failing check can't be merged past silently — that closes the one real gap the backstop doesn't cover.

And a harder question: at seven firings in one day, five of them immediately closed and reopened by hand, the backstop is generating more cleanup than it prevents. It was built for a specific failure — commits pushed to an already-merged branch name, landing with no PR at all — which hasn't recurred since. Worth deciding whether it still earns its place, or whether it should only fire for branches with no PR *and* no push in the last few minutes.

## Net state

Three of four products now have complete planning docs; Product D still lacks a `tech_stack_recommendation.md`. All four share `docs/schema.md`/`docs/PRD.md`/`docs/assumptions.md`/`docs/model-access.md`, and `TODO.md` is nearly fully resolved. Product C still has the only scaffolded app and the only application code in the repo — roughly 160 lines. Next gate is unchanged: Product A, B, and D's Phase 0 scaffolding.

**Four PRs are open and green, none merged:** the agent pipeline (#31, twice-reviewed), this retro (#32), the doc-commands CI check (#34), and the code-standards proposal (#36). That's the day's real shape — a lot of process built, none of it in effect yet, because everything still needs a teammate's approval.

Carrying into tomorrow:

1. **Merge #31** so the next build session actually runs under the roster it defines.
2. **Make `ci` a required status check** — it would have blocked #20 merging red this afternoon.
3. **Ratify or reshape #36** — it's a standard for everyone's code, and it's deliberately cheap to adopt *now*, while the repo holds 160 lines instead of four apps' worth.
4. **Decide whether `auto-pr.yml` still earns its place** at seven firings a day.

One thread runs through items 2 and 3, and through both of #31's review rounds: this repo has been better at writing rules down than at making them true. The three things built tonight — the CI check, the verified-before-proposed config, the honesty caveats added to the agent definitions about which restrictions are actually enforced — are all corrections in the same direction.
