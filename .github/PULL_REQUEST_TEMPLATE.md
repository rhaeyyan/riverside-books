# Pull Request

## Summary

<!-- What does this PR do, and why? -->

## Changes

<!-- Bullet list of key changes -->

-

## Test plan

<!-- How did you verify this works? Check what applies. Coverage is deliberately
absent: no app in this repo collects it, so there is no figure to report. -->

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes (neither Vitest nor ESLint catches type errors)
- [ ] `npm run lint` / `npm run lint:md` pass
- [ ] `npm run test:db` passes (Product A only, or any product with a database oracle)
- [ ] Manually tested in the browser (describe below if applicable)

## Agent workflow

<!-- Delete this whole block for a hand-written or docs-only change; it applies only to work
that came out of the tech-lead → sdet → builder loop.

Paste the [COMPLETION-REPORT] and [COMPLIANCE-REPORT] blocks below. The field
schemas are canonical in AGENTS.md under "### Handoff Schemas" — this template
deliberately does not restate them, because a second copy of a shared contract is
how this repo's schema drifted before docs/schema.md existed.

Why they belong here rather than only in the agent session: the SPEC's declared
oracle, the Integrity Boundary verdict, and how many sdet cycles the task took
are otherwise readable only by whoever ran the session. This repo has no
SESSION_STATE.md and no persisted specs/ directory — both cut on purpose — so the
PR body is the one durable, reviewable place that record can live. -->

**sdet cycles to green:** <!-- 0, 1, or 2. Three means it should have gone to reviewer. -->

## Related

<!-- Link any related issue(s), e.g. "Closes #12" -->
