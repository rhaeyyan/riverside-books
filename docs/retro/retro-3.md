# Retro 3 — Riverside Books, 2026-08-20

25 commits authored today (10:31 AM–4:24 PM so far), across four contributors. Four PRs left over from yesterday (#31, #32, #34, #36) all merged within the same minute this afternoon; five more opened and mostly merged today (#41/#43, #42/#44, #45/#46, #47/#48, #49). Three of four products now have a scaffolded app — Product D's is still sitting in an open, bot-authored PR as of this writing (4:32 PM).

**Commits:** 25 · **Contributors:** 4 (rhaeyyan 17, Cheewaiyip 4, Huma Ali 2, Crystal Watson 1 so far) · **PRs today:** 5 opened (all bot-doubled, see the recurring-habit section), 4 carried over from yesterday finally merged, 1 still open

## Morning — yesterday's four backlogged PRs finally land, after one more fight on #31 (10:31 AM–2:25 PM)

Retro 2 closed with four green, unmerged PRs and an explicit carry-forward list. All four merged today, within the same minute (2:24–2:25 PM) — but #31 took a third review round and a genuine governance clash to get there:

- **10:31 AM** — **Cheewaiyip** pushed one more fix directly to #31's branch: the "builder/reviewer don't open their own PR" rule had no enforced-vs-prompt-level caveat despite both agents holding unrestricted `Bash`, and `builder.md` named `vercel:*` skills that don't exist in this repo's `.claude/skills/`. Both fixed.
- **~1:00 PM** — **rhaeyyan** pushed a reply-only commit (no code) rebutting **Huma Ali**'s second `CHANGES_REQUESTED`: her review quoted Notes-section text ("no multi-agent build roster") that exists on `main` but not on the PR branch, which the diff itself replaces. Reproducible with a two-line `git show` comparison, included in the reply.
- **1:30 PM** — In response to **Crystal Watson**'s P1 and Huma's repeated blocks, rhaeyyan pushed `95d1ddc`: an explicit "this workflow is opt-in, not a repo-wide default" line at the top of both `CLAUDE.md` and `AGENTS.md`.
- **~2:00 PM** — **Cheewaiyip** raised a structural objection instead of a line-edit: compare this to #36 (marked `Status: PROPOSED`, named who needs to ratify it, left `CLAUDE.md` untouched until then) — #31 does the opposite, rewriting the root docs directly as if adoption were already decided. Proposed splitting the workflow definition from the doc rewrite.
- **Same window** — **Huma Ali** force-pushed a full revert of the opt-in commit, removing the workflow entirely (`.claude/agents/`, `.codex/agents/`, the CLAUDE.md/AGENTS.md sections, the CODEOWNERS line).
- **2:05 PM** — **rhaeyyan** force-pushed over that revert (`f849445`), restoring the workflow — but as **mandatory**, reversing the opt-in wording from an hour earlier. Posted the sequence transparently on the thread ("I know step 3 overrides your reviews a second time rather than resolving them"), then followed up declaring mandatory-vs-opt-in a repo-owner decision, not a vote: "That's a decision, not a proposal."
- **2:14–2:21 PM** — **Crystal Watson** held her position in a comment ("declaring the mandatory workflow 'not up for a vote' does not resolve the outstanding teammate objections... CI is green, but this PR remains CHANGES_REQUESTED and is not ready for approval") and never converted to a formal approval — her reviews stayed `COMMENTED` throughout. **Huma Ali** approved 14 seconds later, explicitly on different grounds than "resolved": *"No remaining technical objection... Acknowledging the mandatory-vs-opt-in call as the repo owner's decision rather than a vote, per your last comment. Approving to unblock."*
- **2:24 PM** — Huma merged #31. Within the same minute, #32 (retro-2 + schema fill), #34 (CI doc-commands check), and #36 (TSDoc/module-size standard) merged too — the day's backlog cleared in one motion.

Net: the multi-agent workflow is now mandatory in `CLAUDE.md`/`AGENTS.md`, not opt-in — but it went in over one teammate's standing objection and the other's explicit "approving to unblock, not because I'm convinced," not by resolving either. Crystal's second blocking point in that same review — no product but C has a test runner, so the required `sdet` red can't start Phase 0 for A/B/D — is what the next section is actually about.

## Afternoon — the bootstrap exception, then three products scaffold (2:58–4:29 PM)

- **2:58 PM** — **rhaeyyan** opened PR #43: a bootstrap exception written into the roster itself (`CLAUDE.md`/`AGENTS.md` + all four `.claude/agents/*.md` + `.codex/agents/*.toml`) — for the one case of a product directory with no app yet, `builder` scaffolds directly without a preceding `[SPEC]`/red, capped at "one real passing test, not zero." This is the direct fix for Crystal's second #31 finding, shipped as its own reviewable PR rather than folded back into #31.
- **3:18 PM** — **Cheewaiyip** caught the exit criterion was wrong for the actual tool in use: Vitest exits nonzero on "no test files found," so "the test runner exists" can't be satisfied by installing Vitest alone.
- **3:32 PM** — **rhaeyyan** closed the remaining review gaps and deduped the exception to one canonical source rather than restating it in each agent file. Cheewaiyip approved; PR #43 merged 3:44 PM.
- **3:10 PM** — **Cheewaiyip** used the newly-merged exception to scaffold `product-b-app/` directly (Next.js, ESLint, Vitest, one smoke test, a `ci-product-b` CI job) — PR #44, reviewed and approved by rhaeyyan and Crystal, merged 3:49 PM.
- **3:15 PM** — **Huma Ali** filed a small Product C doc fix: `implementation_plan.md` said Phase 1 "should not assume either [fact-path or interactivity] is already built" without naming which phase closes the gap — PR #46, rhaeyyan asked which phase, Huma named Phase 2 (fact-path) and Phase 3 (interactivity), merged 4:29 PM after two rebases to catch up with #48.
- **4:02 PM** — **rhaeyyan** scaffolded `product-a-app/` the same way — PR #48. Two reviewers actually exercised it rather than just reading the diff: **Huma Ali** confirmed the `ci-product-a` job mirrors `ci-product-b`'s pattern and the bootstrap exception's "one real test" bar; **Cheewaiyip** built it in a worktree and ran the full suite, specifically checking the claim that spreading `jsx-a11y`'s flat config directly would error. Approved, merged 4:21 PM.
- **4:24 PM** — **Crystal Watson** pushed `feat(product-d): complete Phase 0 walking skeleton` — the largest of the three scaffolds (11.5k additions vs. ~9.3–9.5k for A/B) because it's not just the Next.js skeleton: `lib/content/fact-protection.ts`, `fixture-generator.ts`, and `contracts.ts` are real model-fact-boundary code, not placeholders. **Still open as PR #49 as of this writing** — see below.

By 4:29 PM, three of four products have a scaffolded app on `main`; only Product D's is still pending.

## The auto-PR backstop fired on every scaffold today, and the habit retro-2 flagged hasn't changed

Every one of today's five branches (#31's predecessor branches aside) got a bot-opened PR before the human did: #41→#43, #42→#44, #45→#46, #47→#48, and #49 itself. Four of five were caught and reopened properly within minutes, same as retro-2 described. **The fifth wasn't:** #49 is still sitting bot-authored, un-reopened, three hours old as of 4:32 PM.

rhaeyyan flagged it on the thread: because it's bot-authored, per CLAUDE.md's documented gap it never triggered `ci`/`docs` — only `auto-pr` has run. The PR body's verification numbers ("38/38 tests, 95.64% coverage, the Vercel preview") are self-reported and local, not CI-confirmed, on a PR that's currently showing `BEHIND` main. Recommended the same fix that unblocked #41 earlier today: close it and reopen with `gh pr create` on the same branch, which also refreshes the mergeability check. This is exactly retro-2's open question #4 ("is the backstop still earning its place at seven firings a day") playing out again, except this time the failure mode it was never meant to cover — a real product's Integrity-Boundary code sitting unverified by CI for hours because nobody reopened the PR — is the one that happened.

## Net state

All four products have Phase 0 work either merged or open: A and B scaffolded and merged today, C got a docs-only clarification, D's scaffold (including its fact-protection code) is written but stuck behind an unreopened bot PR with no CI run yet. The multi-agent workflow is now mandatory doctrine in `CLAUDE.md`/`AGENTS.md`, backed by a bootstrap exception that's already been used correctly three times in one afternoon — but it carries an unresolved governance cost from this morning that the team hasn't actually talked through yet, only worked around.

Carrying into tomorrow:

1. **Get #49 CI-verified and merged** — reopen it under Crystal's own account so `ci`/`docs` actually run against Product D's Integrity Boundary code, rather than trusting the self-reported local numbers in the PR body.
2. **Revisit the mandatory-workflow decision on its merits, not just its outcome.** Huma's approval and Crystal's silence were both "I'm not going to keep fighting this," not "I agree." If the roster is going to be everyone's default working mode, it's worth a real synchronous check rather than resting on a merged PR.
3. **Decide the `auto-pr.yml` question retro-2 raised, now with a concrete cost attached** — today's stuck #49 is the first time the backstop's gap (bot PRs don't trigger CI) actually delayed getting real code checked, not just generated review-thread noise.
4. ~~Make `ci` a required status check~~ — **done today** (`ci` and `docs` are both required on `main`, strict mode), closing retro-2's item. It wouldn't have caught #49 on its own, though: a required check only blocks *merging*, and #49's problem is that being bot-authored meant `ci` never ran at all — that's item 3 above, not this one.
