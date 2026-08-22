# Riverside Books (Product D): Tech Stack Recommendation

This document records the technical decisions for Product D's Phase 0 walking skeleton. [GitHub Issue #39](https://github.com/rhaeyyan/riverside-books/issues/39) is the Phase 0 epic; this decision record is its first task, not authorization to scaffold the app or complete the epic in one change.

## 1. App location and ownership

The Product D application will live directly in `product-d/`, alongside its `market_strategy.md` and `implementation_plan.md`, rather than in a new `product-d-app/` directory. Product D remains one independently installable npm project with its own `package.json`, dependency lockfile, and configuration. Keeping the app in the existing Product D-owned directory avoids a new app-location convention and does not require a shared-root or `CODEOWNERS` change.

There is no root npm project. Commands for Product D will run from `product-d/`, and Product D will own the scripts and tooling described below.

## 2. Application stack

- **Framework:** Next.js App Router, using Server Components by default. Client Components are limited to interactions that need browser state or APIs, such as channel selection, generation controls, and later clipboard/editing behavior.
- **Language:** TypeScript with strict mode enabled. Generator requests, source records, variants, placeholders, and warnings use explicit types so the model-fact boundary is checked at compile time as well as at runtime.
- **Styling:** Tailwind CSS, with responsive behavior designed for the Phase 0 phone verification rather than added after desktop work.
- **Runtime:** Node.js `22.x`, matching the repository's current CI major. Product D declares that exact major in `package.json` and will select it in Vercel rather than inherit a platform default that can advance independently, keeping local, CI, and deployed builds aligned.

Phase 0 is a deterministic walking skeleton. It has no Supabase client, Supabase Auth, provider SDK, model API key, or live model/network call. Shared data and staff access begin in later phases after the fixture path is deployable.

## 3. Code quality and exact scripts

Product D will use ESLint with the Next.js configuration and Prettier while inheriting the repository root [`.prettierrc.json`](../.prettierrc.json). Product D intentionally owns local format and coverage tooling even though the currently scaffolded app does not yet provide those capabilities.

The future `product-d/package.json` will define these exact scripts:

| Script         | Command                        |
| -------------- | ------------------------------ |
| `dev`          | `next dev`                     |
| `build`        | `next build`                   |
| `start`        | `next start`                   |
| `lint`         | `eslint .`                     |
| `format`       | `prettier --write .`           |
| `format:check` | `prettier --check .`           |
| `typecheck`    | `next typegen && tsc --noEmit` |
| `test`         | `vitest run --coverage`        |
| `test:watch`   | `vitest`                       |

`next typegen` precedes TypeScript checking so generated App Router types are present. The repository's Markdown checks remain a separate repository concern; current root guidance mentions future Markdown npm commands, but there is no root `package.json` providing them today. This document therefore does not claim that a root Markdown npm script is currently runnable.

## 4. Testing and coverage policy

Vitest is the test runner. Deterministic unit and contract tests cover the generator, channel behavior, output validation, placeholder allowlisting and substitution, and unsupported-fact warnings. UI behavior uses Testing Library with `jsdom` only where a browser-like DOM is needed.

Product D will install and configure `@vitest/coverage-v8`. CI will enforce an initial minimum of **80% each for statements, branches, functions, and lines** across Product D's testable source modules. Generated files, declaration files, framework/bootstrap-only entry points, fixture data, build output, and configuration files are excluded from the denominator; application and integrity-boundary logic are not. Thresholds may increase when the suite provides evidence for doing so, but they must not be lowered merely to make CI pass. CI tests use deterministic fixtures and make no live database, model-provider, or other network calls.

## 5. Deterministic Phase 0 generator

Phase 0 will commit one fixture book and implement a `FixtureContentGenerator`. Given the same structured record and channel, it returns exactly three stable, visibly distinct variants. The output cannot depend on randomness, the current time, network access, the host locale, or iteration order that can drift between builds.

Each variant follows the output contract in the [implementation plan](./implementation_plan.md#output-contract):

- `captionTemplate`: deterministic caption text containing only approved fact placeholders;
- `caption`: the rendered caption after protected facts are substituted;
- `postIdea`: a short visual or staging concept, not a generated image; and
- `warnings`: unsupported-fact findings for human review.

Channel choice changes the content, not only a label. Instagram variants are concise and visual-first; Facebook variants are more contextual and conversational. Phase 0 adds no hashtags because they are a later, unaccepted scope item. All three variants within each channel remain meaningfully different while producing the same result on every refresh and rebuild.

## 6. Model-fact integrity boundary

Product D follows the mechanical boundary in [`docs/model-access.md`](../docs/model-access.md#4-fact-protection-mechanically-product-d) and the suite requirements in [`docs/PRD.md`](../docs/PRD.md#5-technical-requirements):

1. Generation accepts only the selected structured book or event record, the selected channel, and fixed Riverside voice rules. The MVP has no arbitrary free-text prompt.
2. A model never queries the database and never supplies a trusted hard fact. Titles, authors or guests, prices, stock or availability wording, dates, times, and event fields come only from the structured record.
3. Generated templates may use approved placeholders such as `{title}`, `{author}`, `{price}`, `{event_date}`, and `{event_time}`. The application rejects unknown placeholders and substitutes approved values from the structured record after generation.
4. Any remaining unsupported number, date, or capitalized name is highlighted for human review. Missing facts are omitted or flagged, never guessed.
5. Nothing auto-publishes. A staff member must review and edit or copy/save/mark ready in the later workflow.

The Phase 0 fixture generator exercises this same template, validation, substitution, and warning boundary without calling a model. A later live generator must implement the same contract rather than introduce a second, less-protected path.

## 7. Deployment and CI direction

Product D will have a separate Vercel project whose root directory is `product-d/`, independent of the other three products. It will explicitly use Node.js `22.x`, overriding Vercel's platform default so a default-runtime change cannot silently move the deployed app off the version tested in CI. It will install with `npm ci`, build with `npm run build`, and create preview deployments for branches and pull requests. The Phase 0 exit condition is a deployable phone-width workflow, and every later phase must preserve deployment. Creating or linking the Vercel project is deferred to the scaffold/deployment task; this documentation task performs no deployment setup.

When the app is scaffolded, the shared workflow will gain a Product D job scoped to the `product-d/` working directory. That job will install from Product D's lockfile and run lint, format check, typecheck, coverage-enforced tests, and build. The shared [CI workflow](../.github/workflows/ci.yml) is deliberately not modified in this task.

## 8. Current documentation inconsistency

Product D's `market_strategy.md` and `implementation_plan.md` still describe the shared schema, event ownership, and staff contract as unresolved. [`docs/schema.md`](../docs/schema.md) now resolves the shared field list, assigns Product A as table owner/migrator, Product B as the event write surface, and Products C and D as event readers; it also defines the shared `staff` identity check used by Product D. The allowed values for `staff.role` remain Product A's later schema decision, but Phase 0 does not use Supabase or auth, so this does not block the walking skeleton.

Correcting those older Product D planning passages is out of scope for this one-file task. Future Issue #39 tasks should use the current shared contract rather than repeat the stale blocker language.
