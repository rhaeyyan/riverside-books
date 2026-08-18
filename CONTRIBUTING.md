# Contributing to Riverside Books

This is currently a solo project, but the workflow below is enforced by hooks and CI rather than convention, so it applies regardless of who's committing — including future collaborators.

See [`product-a/implementation_plan.md`](./product-a/implementation_plan.md) for the build order and phase exit conditions, and [`product-a/tech_stack_recommendation.md`](./product-a/tech_stack_recommendation.md) for the reasoning behind the stack.

## Prerequisites

**Node ≥22** and **npm ≥12**, pinned via `.nvmrc` and `package.json` `engines` once the app is scaffolded.

```bash
nvm use          # or: fnm use
npm ci
npm run dev
```

## Branching and pull requests

- **Feature branches and pull requests only — never commit directly to `main`.**
- **Rebase is the merge strategy.** Squash and merge-commit are disabled at the repository level. Keep your branch rebased on `main` before merging.
- Every pull request needs green CI before merging.
- Branches are deleted automatically on merge.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced at commit time by `commitlint` via `.husky/commit-msg`. A message without a `type:` prefix is rejected.

```text
feat: add fuzzy title search to the catalog page
fix: stop reservation counts going negative under concurrent requests
docs: correct the RLS policy description in the tech stack doc
```

**Do not add AI `Co-Authored-By` trailers.** The same hook rejects any trailer naming an AI tool. Authorship stays with the person accountable for the code.

Don't commit with `--no-verify`. If a hook fails, fix the underlying issue.

## Tests

Coverage is enforced in CI once the test suite exists; the threshold will be set alongside Phase 0 scaffolding.

Per [`product-a/implementation_plan.md`](./product-a/implementation_plan.md), the cross-account RLS isolation test (customer A cannot read or write customer B's reservations or stamp balance) is a hard exit condition for Phase 1 and runs in CI from that point on — it is not optional coverage.

```bash
npm test              # once configured: Vitest with coverage
npm run test:watch
```

## Before you push

CI is the authoritative gate. In particular, neither Vitest nor ESLint type-checks, so a type error in a test file can be invisible locally until you run:

```bash
npm run typecheck
npm run lint && npm run lint:md
npm run format:check && npm run format:md:check
npm run build
```

## Code style

- **LF line endings everywhere**, enforced via `.gitattributes`. Don't bypass it.
- Prettier and ESLint for app code; Prettier and markdownlint-cli2 for Markdown. `proseWrap` is `"never"` — paragraphs stay on one unwrapped line.
- `eslint-plugin-jsx-a11y` is part of the lint config from Phase 0 on — accessibility issues (tap targets, paste-blocking on the one-time-code field, etc.) are lint errors, not review comments.
- Favor small, single-responsibility modules and dependency inversion at integration boundaries. Don't apply patterns ceremonially — the simplest thing that stays correct wins.

## The one non-negotiable rule

**Availability and reservation state are computed and constrained in the database, never assumed in application code.** The `inventory_reserved_sane` check constraint, the `not null` status column, and the RLS policies in `product-a/implementation_plan.md` are the source of truth. Application code may read and display that state; it must never work around a constraint instead of fixing the write path that hit it.
