# Riverside Books

Cycle 4 team project — **Team 13, Direct-to-Consumer Retail**. Four products for one independent bookstore, built by four collaborators in a single repo.

Riverside Books is a single-location independent bookstore selling new books, cards, and small gifts, with occasional author events. The owner and two part-time booksellers currently run inventory, orders, and customer communication on memory, sticky notes, and a spreadsheet. The goal is to modernize the customer experience and staff operations **without** turning the store into a large e-commerce business — customers still shop by walking in or calling ahead.

Full brief: [`docs/Cycle 4_ Project briefs.md`](docs/Cycle%204_%20Project%20briefs.md).

## The product suite

| Product | What it does | Owner | Directory |
| --- | --- | --- | --- |
| **A** — Customer Ordering & Loyalty App | Search the catalog, see live stock, place a pre-order for pickup, earn loyalty stamps | [@rhaeyyan](https://github.com/rhaeyyan) | [`product-a/`](product-a/) |
| **B** — Staff Inventory & Ops Dashboard | Live stock by title, low/out-of-stock flags, pending pre-orders to prepare | [@Cheewaiyip](https://github.com/Cheewaiyip) | [`product-b/`](product-b/) |
| **C** — Customer Support Chatbot | Answers questions against real inventory, hours, and policies — not a static FAQ | [@humaali-create](https://github.com/humaali-create) | [`product-c/`](product-c/) |
| **D** — Marketing Content Generator | Turns a book or event into a short social caption and post idea for staff review | [@crystalwatson-art](https://github.com/crystalwatson-art) | [`product-d/`](product-d/) |

The four products are not independent apps that happen to share a repo. A writes the inventory data; B reconciles it; C answers questions against it. That shared dependency is governed by one contract — [`docs/schema.md`](docs/schema.md), which Product A owns and migrates.

## Current status

**Three of the four products are scaffolded; Product A is deployed and building out the shared data model.**

| Product | Docs | Code | State |
| --- | --- | --- | --- |
| A | market strategy, tech stack, implementation plan | [`product-a-app/`](product-a-app/) | **Phase 1 in progress** — live at [product-a-app.vercel.app](https://product-a-app.vercel.app), deployed from CI on merge to `main`. All seven shared tables are migrated with their constraints enforced in Postgres, verified by a real-database test suite that runs in `ci-product-a`. RLS is enabled on all seven but no policies are written yet, so they are deny-all to client roles; the policies and the cross-account isolation test that gates this phase are the next step. |
| B | context notes, market strategy, tech stack, implementation plan | [`product-b-app/`](product-b-app/) | Phase 0 walking skeleton scaffolded ([#38](https://github.com/rhaeyyan/riverside-books/issues/38)) |
| C | market strategy, tech stack, implementation plan | [`product-c-app/`](product-c-app/) | Phase 0 walking skeleton scaffolded |
| D | market strategy, implementation plan | none on `main` yet | tech stack doc and a Phase 0 walking skeleton are proposed in [#49](https://github.com/rhaeyyan/riverside-books/pull/49), still unmerged ([#39](https://github.com/rhaeyyan/riverside-books/issues/39)) |

### The shared-data question, and how it was settled

Products A, B, and C all touch the same inventory rows. Separate Supabase projects would have left B with nothing real to display and C unable to do what its brief describes — a failure that surfaces on the last afternoon before the demo rather than as an error.

That is **resolved: one shared Supabase project.** Product A owns and migrates every table that crosses a product boundary; B and C read them; B gets a write path to `inventory.on_hand` and `counted_at`. The field-level contract is [`docs/schema.md`](docs/schema.md) — read it rather than restating field lists locally, which is how three independently-invented `events` shapes came to exist before that file did.

The live risk log is [Section 7 of `docs/PRD.md`](docs/PRD.md). Three items there are open. Product C's is the oldest and the only true blocker: no table exists for store `hours` or return `policy`, which two of its four intents are specified against. Product B is waiting on Product A to approve the `reservations` staff-read RLS policy its pre-order queue needs. And a repo-wide row now covers deploy credentials and CI secrets, added after Product A's deploy job failed on every run for days against a mis-scoped Vercel token — Products B and D each need their own, and Product A's will not work for them.

## Repo layout

```
docs/                 Shared: the project brief, look & feel references, retros
product-a/ … d/       One directory per product, owned by one collaborator
.github/              CI, CODEOWNERS, issue/PR templates
CONTRIBUTING.md       Branching, commits, hooks, and test rules in prose
AGENTS.md             Protocols for coding agents (CLAUDE.md symlinks to it)
SECURITY.md           Data and auth model (currently Product A's)
```

## Working in this repo

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before your first PR. The rules that bite most often:

- **Feature branches and PRs only.** Direct pushes to `main` are blocked by branch protection, admins included. Every PR needs one approving review.
- **Open your own PR.** GitHub attributes authorship to whoever runs `gh pr create`, and an author can't approve their own PR — having someone else open it creates exactly the review deadlock `CODEOWNERS` exists to prevent. Nothing catches a forgotten PR — the workflow that used to do it was removed for opening bot-authored PRs that CI never runs on.
- **Conventional Commits**, enforced by a `commit-msg` hook. No AI `Co-Authored-By` trailers.
- **Rebase is the merge strategy** — squash and merge commits are disabled. Keep branches rebased on `main`.
- **Don't use `--no-verify`.** If a hook fails, fix the cause.

CI runs lint, typecheck, test, and build on every push and PR, as one job per scaffolded app (`ci` for Product C, `ci-product-a`, `ci-product-b`) plus a repo-wide `docs` check. There is **no format check and no coverage gate** — neither is wired up in any app, so nothing here can report a coverage figure. `ci`, `docs`, and `ci-product-a` are required checks on `main`; `ci-product-a` also deploys Product A to production on merge.

## The non-negotiable rule

Availability and reservation state are computed and constrained **in the database** — check constraints, `not null` columns, RLS policies — never assumed in application code. A reserved book is a book somebody expects to find behind the counter, and two customers cannot be promised the same copy. The cross-account RLS isolation test is a hard exit condition for Product A's Phase 1.

## License

[MIT](LICENSE) © 2026 Rayan Khan
