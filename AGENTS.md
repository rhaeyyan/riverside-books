# Riverside Books — Product A (Customer Ordering & Loyalty App) (Codex CLI edition)

This file is the Codex-CLI-facing twin of `CLAUDE.md`. Both must stay in sync — a substantive change to one repo rule belongs in both files. Codex CLI reads `AGENTS.md` automatically at session start; it does not read `CLAUDE.md`.

Team build for the Cycle 4 "Direct-to-Consumer Retail" project brief (`docs/Cycle 4_ Project briefs.md`), shared across four collaborators in this one repo, each owning a product directory:

| Product | Directory | Owner |
| --- | --- | --- |
| A — Customer Ordering & Loyalty App | `product-a/` | [@rhaeyyan](https://github.com/rhaeyyan) |
| B — Staff Inventory & Ops Dashboard | `product-b/` | [@Cheewaiyip](https://github.com/Cheewaiyip) |
| C — Customer Support Chatbot | `product-c/` | [@humaali-create](https://github.com/humaali-create) |
| D — Marketing Content Generator | `product-d/` | [@crystalwatson-art](https://github.com/crystalwatson-art) |

This file codifies the repo's GitHub protocols — branching, commits, CI, hooks — so they're enforced consistently across all four product directories rather than re-derived each session. The stack/commands/CI sections below currently describe Product A specifically (the only one scaffolded so far); update them once another product's tooling lands, or split per-directory if the four apps end up with different stacks.

## Stack & docs

- **Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth), deployed on Vercel.** Reasoning in `product-a/tech_stack_recommendation.md` — don't re-derive stack decisions already made there.
- **Build plan**: `product-a/implementation_plan.md` — phased, with exit conditions per phase. Nothing after Phase 0 is allowed to break deployment.
- **Product/market reasoning**: `product-a/market_strategy.md`.
- **Nothing is scaffolded yet.** There is no `package.json`, no app code, and no tests. The commands, hooks, and CI job below describe the target state from Phase 0 of the implementation plan — they will not actually run (or will fail) until that scaffolding lands.

## Commands

Once Phase 0 scaffolding lands:

- `npm run dev` — local dev server. `npm run build` / `npm run start` — production build/serve.
- `npm run lint` / `npm run format` / `npm run format:check` — app code (ESLint/Prettier).
- `npm run lint:md` / `npm run format:md` / `npm run format:md:check` — docs (markdownlint-cli2/Prettier).
- `npm run typecheck` — Vitest and ESLint do **not** type-check; a type error in a test file is invisible without this.
- `npm run test` — Vitest with coverage.

## Git workflow

- **Feature branches + PRs only — never commit directly to `main`.** Branch protection on GitHub blocks direct pushes to `main`, including for the repo admin.
- **Every PR needs at least 1 approving review before merging.** With four collaborators, review each other's PRs — don't merge your own. `CODEOWNERS` lists all four of you as eligible reviewers on everything (not per-directory), specifically so this requirement is always satisfiable by someone other than the author; the ownership table above is the actual convention for who *should* review what.
- **Rebase is the merge strategy**, enforced at the GitHub repo level (squash and merge-commit are disabled). Keep feature branches rebased on `main` before merging.
- Branches are auto-deleted on merge.
- **CI** (`.github/workflows/ci.yml`) runs lint, format check, typecheck, test-with-coverage, and build on every push/PR. It is not yet a required status check on `main` — enable that once it first runs green:

  ```bash
  gh api repos/rhaeyyan/riverside-books/branches/main/protection/required_status_checks \
    -X PATCH -f strict=true -f 'contexts[]=ci'
  ```

## Engineering standards

- **Conventional Commits, enforced at commit time.** Once Husky is installed (`npm install` triggers `prepare`), `.husky/commit-msg` runs `commitlint` (`commitlint.config.cjs`, extends `@commitlint/config-conventional`) — a message without a `type:` prefix is rejected.
- **No AI `Co-Authored-By` trailers.** The same hook rejects any `Co-Authored-By:` trailer naming an AI tool (Claude, Anthropic, OpenAI, ChatGPT, GPT-, Copilot, Gemini, Codex, or the word "AI"). **When Codex commits in this repo, it must not add a `Co-Authored-By:` trailer naming itself or any AI tool** — the hook will block it once wired up, and the rule applies regardless.
- **LF line endings everywhere**, enforced via `.gitattributes` (`* text=auto eol=lf`) — don't bypass it.
- **Pre-commit hook** (`.husky/pre-commit`) runs lint-staged plus the full test suite — a deliberately narrower, fast local gate. CI is the authoritative one; run `npm run typecheck` yourself before pushing since neither Vitest nor ESLint catches type errors.
- Don't commit with `--no-verify`. If a hook fails, fix the underlying issue.
- **Markdown lint + format**: `npm run lint:md` (markdownlint-cli2, `.markdownlint-cli2.jsonc`) and `npm run format:md` (Prettier, `.prettierrc.json` sets `proseWrap: "never"`, so paragraphs stay on one unwrapped line). Both wire into pre-commit/CI alongside the app's own lint/format/test.
- **SOLID, applied proportionally.** Favor small, single-responsibility modules and dependency inversion at integration boundaries (e.g. the Supabase client behind an interface, not scattered `fetch`/query calls). Don't apply patterns ceremonially to trivial code.

## The non-negotiable rule

Per `product-a/implementation_plan.md`: availability and reservation state are computed and constrained in the database (the `inventory_reserved_sane` check constraint, the `not null` status column, RLS policies), never assumed in application code. The cross-account RLS isolation test is a hard Phase 1 exit condition and runs in CI from that point on.

## Notes

- **Four-person team, no multi-agent build roster.** There's no `[SPEC]`/handoff protocol defined here (unlike a team hackathon repo running dispatched subagents) — each collaborator builds their own product directory normally, following the git/commit/CI rules above. The ownership table above is the convention for who owns what; `.github/CODEOWNERS` deliberately doesn't encode it per-directory (see the comment in that file for why).
- **`CLAUDE.md` mirrors this file for Claude Code**, which reads `CLAUDE.md` and does not read `AGENTS.md`. Keep both in sync — a substantive rule change belongs in both files.
- See `CONTRIBUTING.md` for the same rules in prose form, and `SECURITY.md` for the data/auth model (Supabase Auth, RLS-scoped customer data) — currently written for Product A; extend it as the other products land auth/data of their own.
