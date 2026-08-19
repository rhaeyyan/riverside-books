# Riverside Books — Copilot repo instructions

This file is the Copilot-facing mirror of `CLAUDE.md` (canonical) and `AGENTS.md` (Codex CLI). GitHub Copilot has no subagent system of its own, so this doesn't run the four-role roster as separate dispatched agents — it summarizes the ground rules every teammate's tool follows, so Copilot Chat/Workspace behaves consistently with Claude Code and Codex CLI sessions in this repo. Read `CLAUDE.md` for the full detail on any of this, especially the "Multi-agent build workflow" and "Handoff Schemas" sections.

## What this repo is

Four collaborators, each owning one product directory, building the Cycle 4 "Direct-to-Consumer Retail" brief (`docs/Cycle 4_ Project briefs.md`): `product-a/` (rhaeyyan), `product-b/` (Cheewaiyip), `product-c/` + `product-c-app/` (humaali-create), `product-d/` (crystalwatson-art). `docs/PRD.md` is the whole-suite requirements source of truth; `docs/schema.md`, `docs/assumptions.md`, and `docs/model-access.md` are the shared contracts everyone reads from rather than restating locally.

## Directory boundary

Stay inside the one product directory (and its `-app` sibling) you're working in, plus read the shared `docs/` contracts above. Don't edit another product's directory or a shared `docs/` file directly — `.github/CODEOWNERS` makes rhaeyyan the required reviewer for `product-b/`, `product-c/`, and `product-d/` precisely because those are someone else's files. If a change needs a shared table, a new assumption, or touches another product, say so and let the human raise it cross-team (a PR comment, a `TODO.md` item, or a `docs/PRD.md` Section 7 risk row) instead of making the change yourself.

## Git workflow (enforced by hooks/CI, not optional)

- Feature branches + PRs only, never a direct commit to `main` — branch protection blocks it anyway.
- Conventional Commits (`feat:`, `fix:`, …), enforced by `commitlint` at commit time.
- **No `Co-Authored-By` trailer naming Copilot or any AI tool** — the commit-msg hook rejects it once wired up in a product's app, and the rule applies regardless.
- **Push the branch; don't open the PR yourself if you're not the account the human is running as.** GitHub attributes PR authorship to whoever calls the create action, not whoever authored the commits — opening it under the wrong account can exclude the actual contributor from their own CODEOWNERS-required review. Let the human open it.
- Rebase is the merge strategy (squash/merge-commit disabled at the repo level). Keep branches rebased on `main`.
- Run `npm run typecheck` before pushing — neither Vitest nor ESLint catches a type error in a test file.

## Integrity Boundary (non-negotiable)

- **Products A/B**: availability, reservation, and stock-count state are computed and constrained in the database (check constraints, atomic writes, RLS) — never assumed or recomputed in application code.
- **Products C/D**: the model is a phrasing layer only, per `docs/model-access.md`. It never queries the database, never invents a fact, and every protected value (stock status, price, date, title, event fields) is substituted or rendered deterministically before/after the model call. CI never calls a live model.

## When asked to plan or hand off work

Apply the `[SPEC]`/`[FORCES]` → `[COMPLIANCE-REPORT]`/`[COMPLETION-REPORT]` schemas from `CLAUDE.md`'s "Handoff Schemas" section conversationally: state the objective, the Verification Oracle, the Integrity Boundary if it applies, and a ≤5-file scope before implementing, and report back against that same shape when done. This keeps a Copilot-driven change legible to a teammate reviewing it later even without a formal subagent dispatch.

## Commands

Each product app is its own npm project (`product-c-app/` today; others once scaffolded) — `npm run dev`, `build`, `lint`, `format`, `typecheck`, `test`. No root-level `package.json`. See `CLAUDE.md`'s Commands section for the current CI gap (only `product-c-app` has a wired-up job).
