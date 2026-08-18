# Retro 1 — Riverside Books, 2026-08-18

All 18 commits in this repo landed on 2026-08-18 — the project started at 12:59 and the whole history to date is a single day's work.

**Commits:** 18 (17 human + 1 Dependabot) · **Contributors:** 4

## Morning — repo foundation (rhaeyyan, 12:59–13:41)

- Seeded the repo with the Cycle 4 brief and Product A's three planning docs (`implementation_plan.md`, `market_strategy.md`, `tech_stack_recommendation.md`).
- Landed the full contribution scaffold in one pass: CI workflow, Dependabot, CODEOWNERS, issue/PR templates, Husky `commit-msg` + `pre-commit` hooks, commitlint, Prettier/markdownlint config, `.gitattributes`, `.nvmrc`, LICENSE, SECURITY, CODE_OF_CONDUCT, CONTRIBUTING.
- Codified the protocols in `CLAUDE.md` / `AGENTS.md`, then expanded them to describe the 4-person team.

## Afternoon — the other three products came online (15:13–16:34)

Each teammate claimed their directory and shipped their market strategy:

| Owner | Landed |
| --- | --- |
| **Cheewaiyip** (B) | `product-b/context.md` kickoff notes, then `market_strategy.md` — argues Product B's real competitor is the paper log, and that it's what makes A's stock numbers honest |
| **Huma Ali** (C) | `product-c/README.md` workspace init, then `market_strategy.md` — frames the phone call as the incumbent, correctness over conversational polish |
| **Crystal Watson** (D) | `product-d/` directory, market research spreadsheet, then `market_strategy.md` — positions against the blank page, keeps human review as a permanent feature |

Cheewaiyip also added `docs/look_and_feel_references.md` — six bookstore-site design references for the whole suite.

## Governance fixes (rhaeyyan, 15:26–16:43)

Three problems surfaced during the team's first real PRs and each got fixed the same day:

1. **Review deadlock** — CODEOWNERS was too narrow, so rhaeyyan's own PRs had no eligible approver. Made the default rule repo-wide across all four collaborators, with `product-b/c/d` still routed to rhaeyyan specifically.
2. **PR authorship** — documented that each contributor opens their own PR, since `gh pr create` attributes authorship to the caller and would exclude rhaeyyan from their own required-reviewer list.
3. **Missing PRs** — added `.github/workflows/auto-pr.yml`, which opens a PR for any push to a non-`main` branch that lacks one (idempotent, skips Dependabot branches), plus a follow-up fix to `git fetch origin main` so `--fill` can diff properly.

## Also

Dependabot bumped `actions/checkout` and `actions/setup-node` from v5 → v7.

## Net state

All four product directories exist with market strategy docs; process infrastructure is complete and already battle-tested against three real failure modes. Still no application code anywhere — Product A's Phase 0 scaffolding is the next gate.
