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

The four products are not independent apps that happen to share a repo. A writes the inventory data; B reconciles it; C answers questions against it. That shared dependency is the project's highest-risk open item — see [the cross-team schema contract](product-a/implementation_plan.md#the-cross-team-schema-contract).

## Current status

**Planning stage — no application code exists yet.** Every product has market/strategy docs; none is scaffolded.

| Product | Docs | Code |
| --- | --- | --- |
| A | market strategy, tech stack recommendation, phased implementation plan | none — Phase 0 is the next gate |
| B | kickoff context notes, market & feature strategy | none |
| C | workspace README, market strategy | none |
| D | market research workbook, market strategy | none |

### The open question that blocks everything

Products A, B, and C all touch the same inventory rows. If each teammate stands up a separate Supabase project, B has nothing real to display and C cannot do what its brief describes — and that failure doesn't surface as an error, it surfaces on the last afternoon before the demo.

The proposal on the table is **one shared Supabase project**: Product A owns and migrates `books`, `inventory`, and `reservations`; B and C read them; B gets a write path to `inventory.on_hand` and `counted_at`; the staff role check is shared. **This is unresolved and blocks Product A's Phase 1.** Details and the remaining open decisions are in [`product-a/implementation_plan.md`](product-a/implementation_plan.md).

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
- **Open your own PR.** GitHub attributes authorship to whoever runs `gh pr create`, and an author can't approve their own PR — having someone else open it creates exactly the review deadlock `CODEOWNERS` exists to prevent. A workflow auto-opens a PR if you forget, but a bot-authored PR doesn't trigger CI.
- **Conventional Commits**, enforced by a `commit-msg` hook. No AI `Co-Authored-By` trailers.
- **Rebase is the merge strategy** — squash and merge commits are disabled. Keep branches rebased on `main`.
- **Don't use `--no-verify`.** If a hook fails, fix the cause.

CI (lint, format, typecheck, test with coverage, build) runs on every push and PR. It won't do anything useful until Phase 0 scaffolding lands.

## The non-negotiable rule

Availability and reservation state are computed and constrained **in the database** — check constraints, `not null` columns, RLS policies — never assumed in application code. A reserved book is a book somebody expects to find behind the counter, and two customers cannot be promised the same copy. The cross-account RLS isolation test is a hard exit condition for Product A's Phase 1.

## License

[MIT](LICENSE) © 2026 Rayan Khan
