# Code standards — documentation comments and module size

**Status: PROPOSED.** Nothing here is settled. It needs @Cheewaiyip, @humaali-create, and @crystalwatson-art to accept, reject, or reshape it before it becomes policy — it's a standard for everyone's code, not just Product A's. Tracked as a cross-team item in [`TODO.md`](../TODO.md#cross-team--blocks-more-than-one-product).

Sits alongside [`schema.md`](schema.md), [`assumptions.md`](assumptions.md), and [`model-access.md`](model-access.md) as a shared contract: written once, referenced by all four products rather than restated per-product.

## The gap this fills

Three docs already say to follow SOLID — [`CLAUDE.md`](../CLAUDE.md), [`AGENTS.md`](../AGENTS.md), and [`CONTRIBUTING.md`](../CONTRIBUTING.md) all carry some version of "favor small, single-responsibility modules and dependency inversion at integration boundaries." None of them is enforced, and a fourth restatement wouldn't change that.

**Documentation comments are a different case: genuinely absent, and genuinely enforceable.** There is no docstring convention anywhere in this repo today — no mention in any doc, and the one scaffolded app runs a stock `eslint-config-next` with nothing requiring them. A lint rule can fix that; no lint rule can check whether a module respects the dependency inversion principle.

So this document does two different things, and is explicit about which is which:

| | Mechanism | Enforced? |
| --- | --- | --- |
| TSDoc on exported symbols | `eslint-plugin-jsdoc` + `eslint-plugin-tsdoc` | **Yes** — lint error, fails CI |
| Function size / complexity | ESLint core rules | **Warning only** — visible, doesn't block |
| SOLID itself | Code review, `reviewer` agent's coupling/bloat trigger | No, and can't be |

**Now is the cheap moment.** The whole repo holds ~160 lines of application code, all in `product-c-app`. Products A, B, and D have none. A documentation convention set now costs nothing because there is nothing to retrofit; the same convention set at Phase 2 across four apps is a backfill nobody will do.

## TSDoc, not Google-style

Google-style docstrings (`Args:` / `Returns:` / `Raises:`) are a **Python** convention, from the Google Python Style Guide. This repo is TypeScript end to end, so the applicable equivalent is [**TSDoc**](https://tsdoc.org/) — the standard TypeScript itself uses, and what editor tooltips, `typedoc`, and API Extractor read. Same intent, different syntax.

```ts
/**
 * Reserves a copy for a customer, atomically.
 *
 * Uses a single conditional `UPDATE` rather than check-then-write, so two
 * simultaneous requests for the last copy cannot both succeed — see the
 * Integrity Boundary in CLAUDE.md.
 *
 * @param bookId - Catalog id of the title.
 * @param userId - Reserving customer.
 * @returns The reservation, or `null` if no copy was available.
 * @throws {RlsDenied} If the session may not write reservations.
 */
export async function reserveCopy(
  bookId: string,
  userId: string,
): Promise<Reservation | null> {
  // ...
}
```

## What requires a doc comment

**Exported symbols only** — each module's public surface: exported functions, classes, types, interfaces, and React components. Non-exported helpers are exempt.

This is deliberate. Requiring a comment on every function reliably produces filler (`/** Gets the name. */ getName()`), which is worse than nothing: it adds noise, it goes stale silently, and it trains people to write comments that restate the signature. The exported surface is where a comment earns its place, because that's what another product's owner reads when they consume your module.

Write the *why*, not the *what*. The signature already says what the types are.

## Proposed ESLint config

Each product app adds this to its own `eslint.config.mjs` at Phase 0. Per the Directory boundary rule in `CLAUDE.md`, that's each owner's own change to make in their own directory — this document proposes the block, it doesn't edit anyone's app.

```bash
npm i -D eslint-plugin-jsdoc eslint-plugin-tsdoc
```

```js
// eslint.config.mjs — added to the existing defineConfig([...]) array
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

  {
    files: ["**/*.{ts,tsx}"],
    plugins: { jsdoc, tsdoc },
    rules: {
      // Required on the public surface, and only there.
      "jsdoc/require-jsdoc": ["error", {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: true,
          MethodDefinition: true,
        },
        contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
      }],
      // A doc block that exists must be valid and must match the signature.
      "tsdoc/syntax": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      // Types live in TypeScript, not in the comment — don't duplicate them.
      "jsdoc/no-types": "error",

      // SOLID proxies. Warnings on purpose: they don't measure SOLID, they
      // just make the god-function visible. Not worth failing a build over.
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
      "complexity": ["warn", { max: 12 }],
      "max-depth": ["warn", 4],
    },
  },
```

## Verified, not assumed

This config was run against a throwaway copy of `product-c-app` before being proposed — `eslint-plugin-jsdoc` 64.2.1, `eslint-plugin-tsdoc` 0.5.2, ESLint 9, Node 22, on 2026-08-19. Both directions were checked:

**Against the existing code, it reports exactly three things:**

```text
app/layout.tsx
  20:16  error    Missing JSDoc comment                                           jsdoc/require-jsdoc

app/page.tsx
  19:16  error    Missing JSDoc comment                                           jsdoc/require-jsdoc
  19:16  warning  Function 'Home' has too many lines (93). Maximum allowed is 60  max-lines-per-function

✖ 3 problems (2 errors, 1 warning)
```

**So the concrete adoption cost for Product C is two doc comments** — one on `RootLayout`, one on `Home` — plus a judgment call on whether the 93-line `Home` component is worth splitting. That warning firing once, on the only substantial component in the repo, is a reasonable sign the 60-line threshold is set somewhere useful: not so loose it never speaks, not so tight it becomes noise.

**And a correct TSDoc block satisfies all five documentation rules together.** Confirmed on a probe module that a documented exported function, a documented exported type, a documented exported arrow function, and an *un*documented non-exported helper all pass clean (`exit 0`) — so `jsdoc/no-types` and `tsdoc/syntax` don't contradict each other, and the `publicOnly` exemption for internals genuinely works.

## What is deliberately not enforced

**SOLID itself.** No linter checks whether a dependency is inverted or a responsibility is single. The three size/complexity rules above are proxies, not measurements — a 60-line function is a hint, not a violation, which is why they're warnings. Treating them as errors would mostly generate `eslint-disable` comments on legitimately long route handlers and React components, which teaches people to disable rules.

SOLID stays where it is: a review-time judgment call, plus the `reviewer` agent's "coupling/bloat smell" trigger once [PR #31](https://github.com/rhaeyyan/riverside-books/pull/31) lands.

**Framework choice.** Already settled per-product in each `tech_stack_recommendation.md` (Next.js App Router, TypeScript, Tailwind, Supabase, Vitest). Not reopened here.

## Adoption

1. **Ratify this document** — the three other owners accept, reject, or reshape it.
2. **Each owner adds the config block** to their own app's `eslint.config.mjs`, as part of that product's Phase 0. Product C is the only app that exists today, so it's the only one with anything to retrofit — ~160 lines, three files.
3. **Then, and only then, add the CI check** that asserts each scaffolded app has the rules enabled. Landing that check before anyone has adopted would just make `main` red — the same sequencing mistake as documenting a script before writing it. The check belongs in the `docs` job added by [PR #34](https://github.com/rhaeyyan/riverside-books/pull/34). It must diff each product's rule block against the canonical one in this document, not just confirm the plugins are present — the rule block itself is a shared contract pasted into four files, and "enabled" would pass even if one product quietly loosened it (e.g. `max-lines-per-function` raised from 60 to 200).
4. **Once ratified**, `CLAUDE.md`, `AGENTS.md`, and `CONTRIBUTING.md` each get a one-line pointer here — not a copy of the rules. Restating a shared contract per-file is how this repo's schema drifted before `docs/schema.md` existed.
