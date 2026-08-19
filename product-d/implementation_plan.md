# Riverside Books (Product D): Implementation Plan

Staff-facing marketing content generator. Select a current book or upcoming event, generate three Instagram or Facebook caption and post-idea variations, review and edit one, then copy it, save it as a draft, or mark it ready.

The build order below is driven by one judgment: fluent text is the easy part; protecting store facts while making the workflow faster than a blank page is the product. The model is therefore introduced only after the data boundary, deterministic generator, placeholder substitution, and review workflow are testable without it.

## Phase 0: Walking skeleton, deployed

**Goal.** A teammate opens a real URL, selects one fixture book, and sees three deterministic caption cards.

- Next.js App Router project, TypeScript, Tailwind, Vitest, ESLint, Prettier, and the repository's Markdown checks.
- Separate Vercel deployment for Product D, following the same deployable-at-every-phase rule as Products A and B.
- One committed fixture book and one deterministic fake generator. No Supabase or live model dependency yet.
- One server-rendered page with a record selector, Instagram/Facebook selector, Generate action, and three visibly different results.
- CI runs lint, format check, typecheck, tests with coverage, and build using the root commands once the shared scaffold exists.

**Exit condition.** A teammate opens the preview URL on their phone, selects the fixture book, switches channels, and sees three deterministic variations. Refreshing or rebuilding produces the same outputs.

Nothing after this phase may break deployment. If a phase cannot ship, split it rather than holding a broken branch.

## Phase 1: Staff access and the shared data boundary

Product D reads store data; it does not create a second catalog or events source. This phase replaces the Phase 0 fixture selector with adapters over the shared Supabase project.

### Blocking team contract

The repository does not yet contain the proposed `docs/schema.md`, and event-table ownership remains open in [`TODO.md`](../TODO.md#cross-team--blocks-more-than-one-product). Product D can define its boundary types now, but binding those types to concrete database columns blocks on the team contract.

Product D's accepted position is:

- Product D does not migrate or write `books`, `inventory`, or `events`.
- Product D reads them through a small adapter instead of scattering Supabase queries through components.
- Product D may own its later `content_drafts` table because that table is product-specific workflow state, not store truth.

The minimum boundary Product D needs is:

```ts
interface BookContentRecord {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  priceCents: number | null;
  availabilityLabel: string | null;
}

interface EventContentRecord {
  id: string;
  title: string;
  guestName: string | null;
  startsAt: string;
  description: string | null;
}
```

These are Product D's required meanings, not a claim that the shared database already uses these column names. The adapter maps the published team schema into them.

### Staff access

- Reuse Supabase Auth and the shared `staff (user_id, role)` check once the team confirms it.
- Anonymous and customer sessions cannot read the Product D workspace or saved drafts.
- API keys and provider calls remain server-only. No model credential is sent to the browser.

### Tests

- Adapter tests map a book and an event row into the boundary types without dropping required fields.
- Missing optional fields remain `null`; they are never replaced with invented values.
- A non-staff session is rejected from the Product D page and data endpoints.

**Exit condition.** An authenticated staff session selects a real book and a real event from the shared project. A non-staff session cannot reach either dataset. Concrete database mappings reference the team's published schema rather than duplicating it in this plan.

## Phase 2: Deterministic generation and fact protection

Build the complete generation core without a live model. This makes the highest-risk logic fast, deterministic, and safe to run in CI.

### Provider boundary

```ts
interface ContentGenerator {
  generate(request: GenerationRequest): AsyncIterable<GeneratedVariant>;
}
```

Implementations:

- `FixtureContentGenerator`: deterministic outputs for tests, CI, local development, and the Phase 0–4 demo path.
- `LiveContentGenerator`: added in Phase 5 and selected through server-side configuration.

The request contains a selected structured record, the channel, and the fixed Riverside voice rules. There is no arbitrary free-text prompt in the MVP.

### Fact protection

Follow [`docs/model-access.md`](../docs/model-access.md#4-fact-protection-mechanically), mechanically rather than through hopeful prompt wording:

1. Convert the selected record into an allowlisted fact block.
2. Generate prose around placeholder tokens such as `{title}`, `{author}`, `{price}`, `{event_date}`, and `{event_time}`.
3. Reject unknown placeholder tokens.
4. Substitute the real values after generation.
5. Highlight any remaining number, date, or capitalized name that does not appear in the fact block.

The highlighter is a review aid, not a publishing gate. Human review stays mandatory, and missing fields are omitted or visibly flagged rather than guessed.

### Output contract

Every request returns exactly three variants. Each variant contains:

- `captionTemplate`: caption text with approved placeholders before substitution.
- `caption`: rendered caption after substitution.
- `postIdea`: a short visual or staging concept, not a generated image.
- `warnings`: possible unsupported facts for the reviewer to inspect.

### Tests

- Every approved placeholder substitutes the exact selected-record value.
- Missing optional facts do not produce fabricated filler.
- Unknown placeholders fail safely.
- A number, date, or proper name absent from the fact block becomes a warning.
- Instagram and Facebook requests produce channel-specific deterministic fixtures.
- Exactly three variants are returned and no live network call occurs in tests.

**Exit condition.** Table-driven tests prove that a model-shaped output cannot change a title, author, price, event date, or event time during substitution, and the deterministic generator returns three channel-specific variants.

## Phase 3: The select → generate → review workflow

Build the complete user experience against the deterministic generator before adding a live provider.

### Select

- Choose Book or Event, then search the shared records.
- Show the selected source facts beside the generation controls.
- Choose Instagram or Facebook. Instagram is the default.
- Do not expose a general prompt box.

### Generate

- Stream visible progress so the screen never appears frozen.
- Render three accessible variation cards with caption, post idea, and any fact warnings.
- Keep the selected record and channel stable while generation runs.
- A retry replaces the current unsaved set only after the new request succeeds.

### Review

- Select one variation and edit its caption or post idea.
- Keep the source-fact panel visible during editing.
- Re-run the warning highlighter after edits.
- Provide Copy, Save Draft, and Mark Ready actions. Copy uses the browser clipboard; the other two persist in Phase 4.
- Nothing auto-publishes or connects to a social account.

### Accessibility

- All controls have visible labels and keyboard focus states.
- Variation selection is exposed as a named group, not conveyed by card color alone.
- Streaming updates use a restrained live region that does not announce every token.
- Fact warnings include text and an icon; color is supplementary.
- The full workflow works at phone and tablet widths.

**Exit condition.** A staff tester selects a fixture book or event, changes the channel, generates three options, edits one, reviews warnings against the visible source facts, and copies it without help.

## Phase 4: Draft persistence and review state

Product D owns one workflow table in the shared Supabase project:

```text
content_drafts
  id uuid primary key
  source_type text not null check (source_type in ('book', 'event'))
  source_id uuid not null
  source_snapshot jsonb not null
  channel text not null check (channel in ('instagram', 'facebook'))
  variants jsonb not null
  selected_variant int not null check (selected_variant between 0 and 2)
  edited_caption text not null
  post_idea text not null
  warnings jsonb not null default '[]'
  status text not null check (status in ('draft', 'ready'))
  created_by uuid not null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
```

`source_snapshot` is an audit record of the facts reviewed with that draft. It is not used as the source for a new generation and does not replace the shared book or event tables.

### Write rules

- All writes run server-side and require a shared staff role.
- Save Draft creates or updates one draft; repeated saves update that row rather than creating duplicates.
- Mark Ready persists the latest edits and changes only `status` to `ready`.
- A warning does not block Mark Ready, but the UI requires the reviewer to see the warning panel first.
- There is no `published` status in the MVP because Product D does not publish.

### Row Level Security

- Staff may read, insert, and update drafts.
- Anonymous and customer sessions have no access.
- Delete is omitted from the MVP; archival can be designed later if the store needs it.

### Tests

- Non-staff sessions cannot read or write drafts.
- Repeated Save Draft updates one row.
- Mark Ready stores the latest edits and source snapshot.
- A saved draft reloads with the same selected variation, caption, post idea, warnings, and status.

**Exit condition.** An authenticated staff user saves a draft, reloads it, edits it, and marks it ready. A non-staff session sees no draft rows and cannot create one.

## Phase 5: Live model adapter

Only after the safe workflow works end to end with the deterministic generator:

- Choose a provider from [`docs/model-access.md`](../docs/model-access.md#7-provider-options) based on demo-day quality and latency, not hardcoded preference.
- Read the provider and model identifier from server-side environment variables.
- Implement the same `ContentGenerator` interface used by the fixture generator.
- Stream output from a server route; never expose the provider key to the client.
- Preserve the placeholder contract and run the same substitution and warning pipeline used for fixtures.
- Apply a timeout, one bounded retry for transient failures, and a useful retry message. Never fall back to fabricated content.
- Keep live-provider tests out of CI. Use contract tests with recorded, non-sensitive fixtures around the adapter boundary.

**Exit condition.** Switching one server-side configuration value changes the generator from deterministic fake to live provider. Both paths produce the same validated three-variant contract, and CI still makes zero live model calls.

## Phase 6: Demo readiness and measurement

- Seed at least one book, one complete event, and one event with a missing optional field.
- Run three to five timed staff-style walkthroughs from selection to review; target under one minute.
- Rate each selected draft as publishable, minor edits, or major rewrite.
- Review outputs against the agreed voice checklist: warm, local, knowledgeable, community-focused, specific, and free of big-box hype or invented urgency.
- Run keyboard-only and automated accessibility checks.
- Verify phone and tablet layouts, slow-network behavior, empty states, provider errors, and retry behavior.
- Prepare a demo script that shows a hard fact surviving generation unchanged and a suspicious unsupported detail being highlighted.

**Exit condition.** The core path completes repeatedly without a broken state, all hard facts match their source records, and most test drafts need no more than minor edits.

## Testing, throughout

| Test | Failure it prevents |
| --- | --- |
| Staff-only access | A customer or anonymous visitor reaches the internal generator or drafts |
| Shared-record adapter mapping | Product D silently drops or renames a required store fact |
| Placeholder allowlist and substitution | A fluent draft changes a title, price, author, date, or time |
| Unsupported-fact highlighter | A suspicious generated detail passes review unnoticed |
| Deterministic provider contract | CI becomes flaky or burns live-model quota |
| Draft save idempotency | Repeated clicks create duplicate drafts |
| Draft reload and ready transition | Staff lose edits or approve stale content |

## Task decomposition

Each task should touch at most five files.

| # | Task | Phase |
| ---: | --- | ---: |
| 1 | Scaffold Product D, lint, test, build, and deploy | 0 |
| 2 | Fixture record selector and deterministic three-variant page | 0 |
| 3 | Define book/event boundary types and data-source interface | 1 |
| 4 | Bind adapters to the published shared schema | 1 |
| 5 | Reuse shared staff auth and add access tests | 1 |
| 6 | Define generator interface and deterministic fixture implementation | 2 |
| 7 | Implement placeholder allowlist, substitution, and tests | 2 |
| 8 | Implement unsupported-fact highlighter and tests | 2 |
| 9 | Build book/event and channel selectors | 3 |
| 10 | Build streaming three-variation review UI | 3 |
| 11 | Add edit, Copy, warning, and responsive accessibility behavior | 3 |
| 12 | Add `content_drafts` migration and staff-only RLS | 4 |
| 13 | Implement Save Draft, reload, and Mark Ready flows | 4 |
| 14 | Implement the configurable live-provider adapter | 5 |
| 15 | Add adapter contract tests, timeout, retry, and error states | 5 |
| 16 | Run accessibility, mobile, timing, and edit-burden checks | 6 |
| 17 | Seed the demo cases and write the demo script | 6 |

## Accepted Product D decisions

- **Channels:** Instagram and Facebook.
- **Output:** three variations per generation.
- **Voice:** warm, local, knowledgeable, community-focused; avoid big-box hype and invented urgency.
- **Review actions:** Edit, Copy, Save Draft, and Mark Ready.
- **Approval:** authenticated staff; no automatic publishing.
- **Visuals:** text and a post concept in the MVP; image generation and design-tool integrations later.
- **Data:** shared books and events only; no Product D store-data copy.
- **Model:** provider-independent streaming interface, deterministic fake in tests, live provider chosen through configuration later.

## Blocking cross-team decisions

- **Publish the shared schema field list.** Product D will not bind to guessed database columns.
- **Assign ownership of the events migration and staff write surface.** Product D is a reader, not the owner.
- **Confirm the shared `staff` table and role check.** Product D will reuse it rather than inventing a separate authorization system.

These block the corresponding database bindings, not Phase 0 or the deterministic core. Work can proceed through the fixture-based workflow while the team resolves them.

## Explicitly deferred

- Direct social publishing or account connections.
- Image generation, template design, and Canva or Adobe Express integration.
- Hashtag generation unless the core text path is stable and time remains.
- Scheduling, analytics, best-time recommendations, social inboxes, listening, and A/B testing.
- Automatic approval or any path that bypasses staff review.

## Unverified

No Product D application is scaffolded yet. The `content_drafts` schema, RLS policies, streaming adapter, and provider behavior have not been executed against a real Supabase or model account. They remain design commitments until their phase exit tests run in the deployed application.
