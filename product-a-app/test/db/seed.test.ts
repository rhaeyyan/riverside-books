import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Client, QueryResultRow } from 'pg';

import { applyMigrations, asAnon, resetDb, withClient } from './harness';

// The module under test. It does not exist yet: this import is the TDD red,
// and it fails at COLLECTION time with "Cannot find module '../../seed/seed'"
// — which is the correct first failure, not a broken test.
//
// WHAT BUILDER MUST CREATE TO TURN THIS IMPORT GREEN:
//   product-a-app/seed/seed.ts            — the four exports below
//   product-a-app/seed/books.fixture.json — the committed catalog fixture
//
// Nothing else in this file can run until both exist. If you are reading a CI
// log that shows every test in this file failing with one resolution error,
// that is this comment, working as intended.
import {
  assertSeedTargetAllowed,
  loadFixture,
  seedCatalog,
  validateFixture,
} from '../../seed/seed';

// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 5 — seed script and fixture data (TDD red).
//
// This is the oracle for a committed, provenance-labeled catalog of exactly 150
// real titles and an idempotent, transactional seed that writes them into
// `books` and `inventory`. The point of the exercise is NOT "some rows exist".
// It is that the stock mix makes all three branches of Phase 2's status ladder
// (product-a/implementation_plan.md, "The stock status function") and Phase 2's
// fuzzy-search exit condition demonstrably reachable, against real rows, in
// SQL — rather than reachable in principle and empty in the demo.
//
// INTEGRITY BOUNDARY — data-integrity form (Products A/B). The seed writes
// `inventory.on_hand`, `reserved`, and `counted_at`. Every one of those values
// is admitted by the DATABASE — `inventory_reserved_sane`, the not-null
// columns, the foreign keys, `books.isbn13 unique` — never by the script's own
// judgement, and the seed adds no grant, no policy, and no role to reach them.
// Three consequences are asserted below rather than assumed:
//
//   1. `counted_at` is computed from the DATABASE's `now()` minus the fixture's
//      `counted_hours_ago` offset. Absolute timestamps must never be baked into
//      the fixture: a row committed as "fresh" today is stale in two days, and
//      Phase 2's first branch would silently stop being demonstrable — the
//      fixture would rot without any test moving. `counted_at is derived from
//      now()` therefore gets its own assertion, not a code review.
//   2. The seed never computes availability. `available = on_hand - reserved`
//      stays derived at read time in Phase 2, so every branch count below is
//      computed in SQL from the stored columns, never read from a column the
//      seed wrote.
//   3. The catalog surface visible to `anon` after the seed is decided by the
//      policies from 20260824121500_rls_policies.sql, unchanged. The policy set,
//      the grant set, and the role list are captured before the seed and
//      compared after it.
//
// WHY THE FIXTURE ASSERTIONS RE-DERIVE RATHER THAN RE-USE. The ISBN-13 check
// digit is recomputed here, in this file, from the modulus-10 alternating-weight
// rule. Importing builder's ISBN-10 -> ISBN-13 converter would make this test
// agree with that converter's bugs by construction — the two would be the same
// claim written twice, and a wrong check digit would ship green. The same
// reasoning is why the fixture is read and parsed here with `readFile` +
// `JSON.parse` rather than through `loadFixture()` for the group 1 assertions:
// `loadFixture` runs builder's validator, and a validator that is too lenient
// would hand this file exactly the data it failed to reject.
//
// `loadFixture` and `validateFixture` are still exercised — as their own
// assertions, against the file this test independently parsed.
//
// WHY THE STRUCTURAL TYPES BELOW ARE DECLARED LOCALLY rather than imported from
// builder's `CatalogFixture`: they are the contract this test asserts. Importing
// them would mean a wrong type in seed.ts silently redefines what "correct"
// means here, and `npm run typecheck` would go green on it.
//
// There is deliberately NO `skipIf`, no `.skip`, and no `.todo` in this file,
// and none must ever be added — the same hard rule as harness.test.ts,
// schema-constraints.test.ts and rls-isolation.test.ts. If the Supabase local
// stack is not up, the database tests below MUST fail and take `ci-product-a`
// red with them.
//
// The group 1 (pure fixture) and `assertSeedTargetAllowed` describes take their
// `beforeAll` locally rather than at file scope, so they still give a real
// signal on a laptop with no Docker. That is a scoping choice, not a skip: they
// fail there too if the fixture is wrong.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The declared mix. THIS TABLE IS THE CONTRACT between this oracle and the
// fixture builder commits — it is the [SPEC]'s table, restated as data so the
// assertions cannot drift from it.
// ---------------------------------------------------------------------------

/** Total catalog entries. `books` rows after the seed. */
const TOTAL_BOOKS = 150;

/** Entries carrying a `stock` block. `inventory` rows after the seed. */
const TOTAL_INVENTORY = 135;

/** Entries with `stock: null` — catalog-only, orderable, never on a shelf. */
const CATALOG_ONLY = 15;

const SHAPES = [
  'fresh_available',
  'stale_available',
  'none_on_hand',
  'fully_reserved',
] as const;

type StockShape = (typeof SHAPES)[number];

/** Exact per-shape counts. Not a floor and not a ceiling — an equality. */
const DECLARED_MIX: Record<StockShape, number> = {
  fresh_available: 60,
  stale_available: 45,
  none_on_hand: 20,
  fully_reserved: 10,
};

/**
 * Phase 2's freshness boundary, in hours: `counted_at within 24h` is the first
 * branch of the status ladder.
 */
const FRESHNESS_BOUNDARY_HOURS = 24;

/**
 * The forbidden band, four hours either side of the 24-hour boundary. A row
 * counted 24h ago is fresh when the fixture is written and stale by the time
 * the suite runs; a row anywhere in [20,30] is a time-dependent flake waiting
 * for a slow CI runner. Nothing may sit here.
 */
const FORBIDDEN_BAND: readonly [number, number] = [20, 30];

/** `fresh_available` offsets live strictly below the forbidden band. */
const FRESH_HOURS: readonly [number, number] = [1, 19];

/** `stale_available` offsets live strictly above it. 9600h is ~400 days. */
const STALE_HOURS: readonly [number, number] = [31, 9600];

/**
 * 180 days in hours. At least 8 `stale_available` rows must be older than this,
 * so "last counted {date}" is exercised against a genuinely old date and not
 * only against yesterday-but-one.
 */
const VERY_STALE_HOURS = 4320;

/**
 * At least this many `fresh_available` rows must be PARTIALLY reserved
 * (`0 < reserved < on_hand`). Without them every available row has
 * `reserved = 0`, and `available = on_hand - reserved` is indistinguishable
 * from `available = on_hand` — Phase 2's subtraction would be untested by the
 * seed data it renders.
 */
const MIN_PARTIALLY_RESERVED = 12;

/** At least this many `stale_available` rows older than 180 days. */
const MIN_VERY_STALE = 8;

/** No shelf in this store holds more than six copies of one title. */
const MAX_ON_HAND = 6;

/** The seven keys of the `$fixture` provenance block. Exactly these. */
const FIXTURE_META_KEYS = [
  'catalog_license',
  'catalog_source',
  'generated_by',
  'invented_fields',
  'notice',
  'retrieved_at',
  'search_probes',
] as const;

/** Minimum `search_probes` entries, and how many must target a non-ASCII author. */
const MIN_SEARCH_PROBES = 5;
const MIN_NON_ASCII_PROBES = 3;

/** The two `books.format` values the catalog uses. */
const FORMATS = ['paperback', 'hardcover'] as const;

/** Public tables that must still be EMPTY after the seed runs. */
const MUST_STAY_EMPTY = [
  'customers',
  'events',
  'loyalty_stamps',
  'reservations',
  'rewards',
  'staff',
] as const;

// ---------------------------------------------------------------------------
// The fixture's shape, as this oracle requires it.
// ---------------------------------------------------------------------------

type FixtureStock = {
  shape: StockShape;
  on_hand: number;
  reserved: number;
  counted_hours_ago: number;
};

type FixtureBook = {
  isbn13: string;
  title: string;
  author: string;
  format: (typeof FORMATS)[number];
  price_cents: number;
  published_on: string | null;
  /** Provenance only. Never written to the database — `books` has no such column. */
  ol_edition_key: string;
  stock: FixtureStock | null;
};

/**
 * One fuzzy-search probe: the misspelled/partial query a customer types, and
 * the ISBN of the book it must return. This is the shape Phase 2's exit
 * condition is scored against ("A misspelled author name returns the right
 * book"), and the reason the fixture has to carry non-ASCII author names —
 * `pg_trgm` on an unaccented query against an accented author is the near-miss
 * case that actually breaks.
 */
type SearchProbe = {
  query: string;
  isbn13: string;
};

type FixtureMeta = Record<string, unknown> & { search_probes: SearchProbe[] };

type ParsedFixture = {
  $fixture: FixtureMeta;
  books: FixtureBook[];
};

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'seed',
  'books.fixture.json',
);

/**
 * Reads and parses the committed fixture WITHOUT going through builder's
 * `loadFixture`/`validateFixture` — see the header note on why this file does
 * its own parsing.
 *
 * Both failure modes are wrapped with a message naming the file, because the
 * raw ENOENT from `readFile` names a path and nothing about what is supposed to
 * be at it, and a `SyntaxError` from `JSON.parse` names neither.
 */
async function readFixtureIndependently(): Promise<ParsedFixture> {
  let raw: string;

  try {
    raw = await readFile(FIXTURE_PATH, 'utf8');
  } catch (cause) {
    throw new Error(
      `No catalog fixture at ${FIXTURE_PATH}. Phase 1 Task 5 requires this ` +
        'file to be COMMITTED — the seed reads it from disk and nothing ' +
        'touches the network at test time. Expected shape: ' +
        '{ "$fixture": { ...seven provenance keys... }, "books": [ ...150 ' +
        'entries... ] }.',
      { cause },
    );
  }

  try {
    return JSON.parse(raw) as ParsedFixture;
  } catch (cause) {
    throw new Error(
      `The catalog fixture at ${FIXTURE_PATH} is not valid JSON. It is ` +
        'committed data, so this is a generation bug in ' +
        'seed/fetch-open-library.ts, not a runtime condition.',
      { cause },
    );
  }
}

/**
 * The ISBN-13 check digit, recomputed from first principles: digits 1..12 take
 * alternating weights 1 and 3, and the check digit is whatever makes the
 * weighted sum a multiple of 10.
 *
 * Deliberately NOT imported from builder's converter. Open Library editions
 * frequently carry only an ISBN-10 (tech_stack_recommendation.md §6), so the
 * fixture generator has to convert — 978 prefix, recompute the check digit —
 * and an off-by-one in the weighting produces 150 plausible-looking ISBNs that
 * are all invalid. Sharing the converter between the generator and its test
 * makes that bug unobservable.
 */
function isbn13CheckDigit(first12: string): number {
  let sum = 0;

  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10;
}

function hasValidIsbn13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) {
    return false;
  }

  return isbn13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * True for a `YYYY-MM-DD` string naming a real calendar date. The round-trip is
 * the point: `new Date('2023-02-30')` does not throw, it rolls over to March 2,
 * so a regex alone accepts dates Postgres will reject with 22008.
 */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const NON_ASCII = /[^\x00-\x7F]/;

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Fixture entries carrying a stock block, paired with their ISBN. */
function stockedBooks(
  fixture: ParsedFixture,
): { isbn13: string; stock: FixtureStock }[] {
  return fixture.books
    .filter((b) => b.stock !== null)
    .map((b) => ({ isbn13: b.isbn13, stock: b.stock as FixtureStock }));
}

function ofShape(fixture: ParsedFixture, shape: StockShape): FixtureStock[] {
  return stockedBooks(fixture)
    .map((entry) => entry.stock)
    .filter((s) => s.shape === shape);
}

// ===========================================================================
// GROUP 1 — the fixture, as a pure fact about the committed file.
// ===========================================================================

describe('group 1 — the committed catalog fixture', () => {
  let fixture: ParsedFixture;

  beforeAll(async () => {
    fixture = await readFixtureIndependently();
  });

  it('carries exactly 150 catalog entries', () => {
    expect(Array.isArray(fixture.books)).toBe(true);
    expect(fixture.books).toHaveLength(TOTAL_BOOKS);
  });

  it('carries a $fixture provenance block with exactly the seven declared keys', () => {
    // The block is what keeps the labeling rule enforceable rather than
    // aspirational: tech_stack_recommendation.md §6 requires this data be
    // "labeled as fixture data wherever it appears", and price_cents is
    // outright invented (no bibliographic source carries retail price), which
    // `invented_fields` is where it gets admitted.
    expect(fixture.$fixture).toBeTypeOf('object');
    expect(fixture.$fixture).not.toBeNull();
    expect(Object.keys(fixture.$fixture).sort()).toEqual([
      ...FIXTURE_META_KEYS,
    ]);
  });

  it('gives every entry a 13-digit ISBN with a valid check digit', () => {
    // Reported as a list of offenders rather than one failed entry: a
    // systematically wrong conversion breaks most of the file at once, and the
    // useful signal is "94 of them" versus "one typo".
    const invalid = fixture.books
      .filter((b) => !hasValidIsbn13(b.isbn13))
      .map((b) => `${b.isbn13} (${b.title})`);

    expect(
      invalid,
      'These ISBN-13s are not 13 digits, or their check digit does not ' +
        'satisfy the alternating 1/3 weighted modulus-10 rule. Note this test ' +
        'recomputes the check digit itself and does NOT use seed.ts\'s ' +
        'converter, so a converter bug shows up here rather than cancelling ' +
        'itself out.',
    ).toEqual([]);
  });

  it('uses each ISBN once — books.isbn13 is unique in the database', () => {
    // The seed would otherwise die on 23505 partway through, which is a worse
    // way to learn this than a pure assertion over the file.
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const book of fixture.books) {
      if (seen.has(book.isbn13)) {
        duplicates.add(book.isbn13);
      }

      seen.add(book.isbn13);
    }

    expect([...duplicates]).toEqual([]);
  });

  it('gives every entry a title, an author, a known format and an Open Library key', () => {
    const bad = fixture.books
      .filter(
        (b) =>
          typeof b.title !== 'string' ||
          b.title.trim() === '' ||
          typeof b.author !== 'string' ||
          b.author.trim() === '' ||
          !FORMATS.includes(b.format) ||
          typeof b.ol_edition_key !== 'string' ||
          b.ol_edition_key.trim() === '',
      )
      .map((b) => b.isbn13);

    expect(
      bad,
      'Each entry needs a non-empty title and author, a format of ' +
        `${FORMATS.join('|')}, and a non-empty ol_edition_key. The edition ` +
        'key is provenance only and is never written to the database — books ' +
        'has no such column — but it is what makes a wrong row traceable back ' +
        'to the record it came from.',
    ).toEqual([]);
  });

  it('prices every entry as a positive integer number of cents', () => {
    const bad = fixture.books
      .filter((b) => !isPositiveInteger(b.price_cents))
      .map((b) => `${b.isbn13}: ${String(b.price_cents)}`);

    expect(bad).toEqual([]);
  });

  it('gives every entry a real calendar date for published_on, or null', () => {
    const bad = fixture.books
      .filter(
        (b) =>
          b.published_on !== null &&
          (typeof b.published_on !== 'string' || !isIsoDate(b.published_on)),
      )
      .map((b) => `${b.isbn13}: ${String(b.published_on)}`);

    expect(
      bad,
      'published_on must be null or a YYYY-MM-DD string naming a date that ' +
        'actually exists. Open Library publish dates are free text ("1998", ' +
        '"March 1998", "n.d."), so this is the field the generator most often ' +
        'passes through unnormalised.',
    ).toEqual([]);
  });

  it('matches the declared stock mix exactly, shape by shape', () => {
    const counts = Object.fromEntries(
      SHAPES.map((shape) => [shape, ofShape(fixture, shape).length]),
    );

    // Equality, not a floor: the three status-ladder branch counts asserted in
    // SQL in group 2 are derived from these numbers, so a fixture that drifts
    // here and a seed that faithfully writes it would agree with each other
    // and disagree with Phase 2.
    expect(counts).toEqual(DECLARED_MIX);

    expect(stockedBooks(fixture)).toHaveLength(TOTAL_INVENTORY);
    expect(fixture.books.filter((b) => b.stock === null)).toHaveLength(
      CATALOG_ONLY,
    );
  });

  it('keeps every stock row inside the database constraint it will be admitted by', () => {
    // `inventory_reserved_sane` is `reserved >= 0 and reserved <= on_hand`.
    // This is not a substitute for the constraint — the constraint is what
    // actually enforces it, and schema-constraints.test.ts proves that from
    // rejected writes. This is here so a bad fixture fails as a readable list
    // of offending entries rather than as one 23514 from row 78 of a
    // transaction that then rolls the other 149 back.
    const bad = stockedBooks(fixture)
      .filter(
        ({ stock }) =>
          !Number.isInteger(stock.on_hand) ||
          !Number.isInteger(stock.reserved) ||
          stock.reserved < 0 ||
          stock.reserved > stock.on_hand ||
          stock.on_hand > MAX_ON_HAND,
      )
      .map(
        ({ isbn13, stock }) =>
          `${isbn13}: on_hand=${stock.on_hand} reserved=${stock.reserved}`,
      );

    expect(
      bad,
      `Every stock row needs integer 0 <= reserved <= on_hand <= ${MAX_ON_HAND}.`,
    ).toEqual([]);
  });

  it('puts no row in the [20,30] hour band around Phase 2\'s 24-hour boundary', () => {
    // THE FLAKE THIS PREVENTS. Phase 2's first branch is `counted_at within
    // 24h`. A row seeded at exactly 24 hours ago is on the boundary, and which
    // side of it the row lands on depends on how long the seed took, how long
    // the migrations took, and how loaded the CI runner is. The whole band gets
    // a four-hour margin either side so no amount of runner slowness can move a
    // row across.
    const offenders = stockedBooks(fixture)
      .filter(
        ({ stock }) =>
          stock.counted_hours_ago >= FORBIDDEN_BAND[0] &&
          stock.counted_hours_ago <= FORBIDDEN_BAND[1],
      )
      .map(({ isbn13, stock }) => `${isbn13}: ${stock.counted_hours_ago}h`);

    expect(
      offenders,
      `No counted_hours_ago may fall in [${FORBIDDEN_BAND[0]},` +
        `${FORBIDDEN_BAND[1]}] — a 4-hour margin either side of Phase 2's ` +
        `${FRESHNESS_BOUNDARY_HOURS}h boundary. A row in this band is a ` +
        'time-dependent flake, not a test case.',
    ).toEqual([]);
  });

  it('makes the "on the shelf as of {time}" branch reachable — 60 fresh available rows', () => {
    const fresh = ofShape(fixture, 'fresh_available');

    expect(fresh).toHaveLength(DECLARED_MIX.fresh_available);

    const bad = fresh
      .filter(
        (s) =>
          s.on_hand - s.reserved < 1 ||
          !Number.isInteger(s.counted_hours_ago) ||
          s.counted_hours_ago < FRESH_HOURS[0] ||
          s.counted_hours_ago > FRESH_HOURS[1],
      )
      .map((s) => `on_hand=${s.on_hand} reserved=${s.reserved} ${s.counted_hours_ago}h`);

    expect(
      bad,
      `fresh_available rows need available >= 1 and an integer ` +
        `counted_hours_ago in ${FRESH_HOURS[0]}..${FRESH_HOURS[1]}.`,
    ).toEqual([]);
  });

  it('exercises the subtraction — at least 12 fresh rows are partially reserved', () => {
    // `available = on_hand - reserved`. If every available row has
    // reserved = 0, that expression is indistinguishable from `on_hand` in
    // every row Phase 2 renders, and a status function that forgot to subtract
    // would look right against the whole seeded catalog.
    const partiallyReserved = ofShape(fixture, 'fresh_available').filter(
      (s) => s.reserved > 0 && s.reserved < s.on_hand,
    );

    expect(partiallyReserved.length).toBeGreaterThanOrEqual(
      MIN_PARTIALLY_RESERVED,
    );
  });

  it('makes the "likely on the shelf, last counted {date}" branch reachable — 45 stale available rows', () => {
    const stale = ofShape(fixture, 'stale_available');

    expect(stale).toHaveLength(DECLARED_MIX.stale_available);

    const bad = stale
      .filter(
        (s) =>
          s.on_hand - s.reserved < 1 ||
          !Number.isInteger(s.counted_hours_ago) ||
          s.counted_hours_ago < STALE_HOURS[0] ||
          s.counted_hours_ago > STALE_HOURS[1],
      )
      .map((s) => `on_hand=${s.on_hand} reserved=${s.reserved} ${s.counted_hours_ago}h`);

    expect(
      bad,
      `stale_available rows need available >= 1 and an integer ` +
        `counted_hours_ago in ${STALE_HOURS[0]}..${STALE_HOURS[1]}.`,
    ).toEqual([]);

    // Staleness is the product's main risk (implementation_plan.md Phase 2),
    // and a "stale" set that is entirely 31-hours-old never shows the interface
    // saying so about something genuinely ancient.
    const veryStale = stale.filter(
      (s) => s.counted_hours_ago > VERY_STALE_HOURS,
    );

    expect(
      veryStale.length,
      `At least ${MIN_VERY_STALE} stale rows must be older than 180 days ` +
        `(> ${VERY_STALE_HOURS}h).`,
    ).toBeGreaterThanOrEqual(MIN_VERY_STALE);
  });

  it('makes the "not on the shelf right now" branch reachable from both directions', () => {
    // Two genuinely different ways to be unavailable, and Phase 2 renders them
    // identically on purpose: nothing on the shelf, versus copies on the shelf
    // that are all spoken for. A fixture with only the first would leave
    // `available <= 0` untested for any row where on_hand > 0 — the case where
    // a status function that reads `on_hand` instead of `on_hand - reserved`
    // would wrongly claim the book is available.
    const none = ofShape(fixture, 'none_on_hand');
    const fully = ofShape(fixture, 'fully_reserved');

    expect(none).toHaveLength(DECLARED_MIX.none_on_hand);
    expect(fully).toHaveLength(DECLARED_MIX.fully_reserved);

    expect(
      none.filter((s) => s.on_hand !== 0 || s.reserved !== 0),
      'none_on_hand rows must be exactly on_hand = 0, reserved = 0.',
    ).toEqual([]);

    expect(
      fully.filter((s) => s.on_hand < 1 || s.reserved !== s.on_hand),
      'fully_reserved rows must be on_hand = reserved >= 1.',
    ).toEqual([]);

    // "Spread across both freshness bands": a shop that has been out of a title
    // for a year and one counted this morning are different claims about how
    // much the store knows, and both need to exist.
    const freshNone = none.filter(
      (s) => s.counted_hours_ago < FORBIDDEN_BAND[0],
    );
    const staleNone = none.filter(
      (s) => s.counted_hours_ago > FORBIDDEN_BAND[1],
    );

    expect(freshNone.length).toBeGreaterThanOrEqual(1);
    expect(staleNone.length).toBeGreaterThanOrEqual(1);
  });

  it('carries fuzzy-search probes that resolve to real entries, at least three with a non-ASCII author', () => {
    // Phase 2's exit condition is "A misspelled author name returns the right
    // book". These probes are what that will be scored against, so they are
    // committed alongside the data they refer to rather than invented later
    // against whatever happens to be in the catalog.
    const probes = fixture.$fixture.search_probes;

    expect(Array.isArray(probes)).toBe(true);
    expect(probes.length).toBeGreaterThanOrEqual(MIN_SEARCH_PROBES);

    const byIsbn = new Map(fixture.books.map((b) => [b.isbn13, b]));

    const malformed = probes
      .filter(
        (p) =>
          typeof p?.query !== 'string' ||
          p.query.trim() === '' ||
          typeof p?.isbn13 !== 'string' ||
          !byIsbn.has(p.isbn13),
      )
      .map((p) => JSON.stringify(p));

    expect(
      malformed,
      'Each search probe is { query, isbn13 }: the near-miss string a ' +
        'customer types, and the ISBN of the entry it must return. Every ' +
        'isbn13 must name an entry in this same fixture.',
    ).toEqual([]);

    // Non-ASCII authors are the case pg_trgm actually has to earn: an
    // unaccented query against an accented name. A probe set of purely ASCII
    // names would let a plain `ilike` pass for fuzzy matching.
    const nonAscii = probes.filter((p) => {
      const target = byIsbn.get(p.isbn13);
      return target !== undefined && NON_ASCII.test(target.author);
    });

    expect(
      nonAscii.length,
      `At least ${MIN_NON_ASCII_PROBES} probes must target a book whose ` +
        'author contains a non-ASCII character.',
    ).toBeGreaterThanOrEqual(MIN_NON_ASCII_PROBES);
  });

  it('is accepted by validateFixture and returned intact by loadFixture', () => {
    // Builder's own entry points, checked against the file this test parsed
    // independently. `loadFixture` must resolve the path from import.meta.url
    // and read it at runtime — NOT `resolveJsonModule` — so the same module
    // works from a compiled build and the fixture is data rather than a
    // bundled constant.
    expect(() => validateFixture(fixture)).not.toThrow();
  });

  it('is rejected by validateFixture with the offending index named', async () => {
    // The negative direction. A validator that accepts everything passes the
    // test above while proving nothing, so a known-bad copy has to be refused
    // — and refused with the index, because "invalid fixture" against 150
    // entries is not a diagnosis.
    const broken = (await readFixtureIndependently()) as ParsedFixture;
    broken.books[42] = { ...broken.books[42], price_cents: -1 };

    let thrown: unknown;

    try {
      validateFixture(broken);
    } catch (cause) {
      thrown = cause;
    }

    expect(
      thrown,
      'validateFixture must throw on an entry with a negative price.',
    ).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain('42');
  });

  it('loads the same 150 entries through loadFixture', async () => {
    // Asserted against THIS file's structural type rather than builder's
    // `CatalogFixture`, for the reason in the header: importing that type would
    // let a wrong declaration in seed.ts redefine what this test checks.
    const loaded = (await loadFixture()) as ParsedFixture;

    expect(loaded.books).toHaveLength(TOTAL_BOOKS);
    expect(loaded.books.map((b) => b.isbn13)).toEqual(
      fixture.books.map((b) => b.isbn13),
    );
  });
});

// ===========================================================================
// GROUPS 2 & 3 — the seed against a real Postgres.
//
// One expensive setup, many cheap assertions. The seed runs TWICE in the
// `beforeAll` and every observation either side is captured there, because
// idempotency and the before/after policy comparison are claims about a
// SEQUENCE — they cannot be re-derived from a per-test snapshot.
// ===========================================================================

type PolicyRow = QueryResultRow & {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
};

type GrantRow = QueryResultRow & {
  grantee: string;
  table_name: string;
  privilege_type: string;
};

type RoleRow = QueryResultRow & { rolname: string };

type SchemaSnapshot = {
  policies: PolicyRow[];
  grants: GrantRow[];
  roles: RoleRow[];
};

type TableCount = QueryResultRow & { table_name: string; row_count: string };

type SeedResult = { books: number; inventory: number };

/**
 * The policy set, the table-grant set, and the role list for schema `public`.
 *
 * These three are exactly what the [SPEC]'s Integrity Boundary says the seed
 * must not touch: "it adds no grant, no policy, and no role". A seed that
 * quietly granted itself reach — or ran as `service_role`, or added a
 * permissive policy to make its own writes land — would be invisible in row
 * counts and obvious here.
 */
async function snapshotSchema(c: Client): Promise<SchemaSnapshot> {
  const policies = await c.query<PolicyRow>(
    `select tablename, policyname, permissive, roles::text as roles,
            cmd, qual, with_check
       from pg_policies
      where schemaname = 'public'
      order by tablename, policyname`,
  );

  const grants = await c.query<GrantRow>(
    `select grantee, table_name, privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public'
      order by table_name, grantee, privilege_type`,
  );

  const roles = await c.query<RoleRow>(
    'select rolname from pg_roles order by rolname',
  );

  return {
    policies: policies.rows,
    grants: grants.rows,
    roles: roles.rows,
  };
}

/**
 * Row counts for every base table in `public`, read from the catalog rather
 * than a hardcoded list — same reasoning as `resetDb`: a table added by a later
 * migration is covered without anyone remembering to come back here.
 */
async function tableCounts(c: Client): Promise<Record<string, number>> {
  const { rows } = await c.query<TableCount>(
    `select cls.relname as table_name,
            (xpath('/row/n/text()',
                   query_to_xml(format('select count(*) as n from public.%I',
                                       cls.relname),
                                false, true, '')))[1]::text as row_count
       from pg_class cls
       join pg_namespace ns on ns.oid = cls.relnamespace
      where ns.nspname = 'public' and cls.relkind = 'r'
      order by cls.relname`,
  );

  return Object.fromEntries(rows.map((r) => [r.table_name, Number(r.row_count)]));
}

async function bookIdFor(c: Client, isbn13: string): Promise<string | null> {
  const { rows } = await c.query<{ id: string }>(
    'select id::text as id from public.books where isbn13 = $1',
    [isbn13],
  );

  return rows[0]?.id ?? null;
}

describe('groups 2 & 3 — seedCatalog against a real Postgres', () => {
  let fixture: ParsedFixture;

  /** The ISBN whose `books.id` must survive a re-seed. Taken from the fixture's own probes. */
  let pinnedIsbn: string;

  let firstResult: SeedResult;
  let before: SchemaSnapshot;
  let after: SchemaSnapshot;
  let countsAfterFirst: Record<string, number>;
  let countsAfterSecond: Record<string, number>;
  let pinnedIdAfterFirst: string | null;
  let pinnedIdAfterSecond: string | null;

  beforeAll(async () => {
    fixture = await readFixtureIndependently();

    // Named explicitly rather than reached into: without this, a fixture with
    // no probes fails the whole describe with `Cannot read properties of
    // undefined (reading 'isbn13')` from a hook, which says nothing about what
    // is wrong. Group 1 asserts the probes properly; this only has to fail
    // legibly.
    const probes = fixture.$fixture?.search_probes;

    if (!Array.isArray(probes) || probes.length === 0) {
      throw new Error(
        'The fixture\'s $fixture.search_probes is missing or empty, so there ' +
          'is no probe ISBN to pin the idempotency assertion to. See the ' +
          'group 1 search-probe test for the required shape.',
      );
    }

    pinnedIsbn = probes[0].isbn13;

    await applyMigrations();
    await resetDb();

    await withClient(async (c) => {
      before = await snapshotSchema(c);

      firstResult = await seedCatalog(c);
      countsAfterFirst = await tableCounts(c);
      pinnedIdAfterFirst = await bookIdFor(c, pinnedIsbn);

      // The second run is the idempotency claim. It happens on the same
      // connection, against a database the first run already populated —
      // which is the situation that actually occurs (a developer re-running
      // the seed, or CI seeding a stack the previous job left warm), not a
      // synthetic one.
      await seedCatalog(c);
      countsAfterSecond = await tableCounts(c);
      pinnedIdAfterSecond = await bookIdFor(c, pinnedIsbn);

      after = await snapshotSchema(c);
    });
  }, 180_000);

  // Leaves the database EMPTY for whatever file runs next. Every other db file
  // resets in `beforeEach`, so this is belt-and-braces rather than load-bearing
  // for them — but 150 books and 135 inventory rows sitting underneath
  // rls-isolation.test.ts's fixtures is exactly the kind of residue that turns
  // an `expect(rows).toEqual([...])` into a confusing failure in a file that
  // did nothing wrong.
  afterAll(async () => {
    await resetDb();
  }, 60_000);

  describe('group 2 — what lands in the database', () => {
    it('writes 150 books and 135 inventory rows', async () => {
      expect(countsAfterFirst.books).toBe(TOTAL_BOOKS);
      expect(countsAfterFirst.inventory).toBe(TOTAL_INVENTORY);

      // The reported result has to agree with what is actually in the tables.
      // A seed that returns its intent rather than its effect is how a partly
      // failed run gets reported as a success.
      expect(firstResult).toEqual({
        books: TOTAL_BOOKS,
        inventory: TOTAL_INVENTORY,
      });
    });

    it('leaves 15 books with no inventory row at all', async () => {
      // Catalog-only titles: the store knows the book exists and has never
      // had a copy. tech_stack_recommendation.md §6 — "The catalog is the set
      // of titles the store knows about. Stock is a number attached to some of
      // them. Keeping those separate is what makes 'we can order that for you'
      // expressible." A left join with no match is a different state from
      // on_hand = 0, and Phase 2 must be able to tell them apart.
      const [row] = await withClient(async (c) => {
        const { rows } = await c.query<{ n: string }>(
          `select count(*) as n
             from public.books b
             left join public.inventory i on i.book_id = b.id
            where i.book_id is null`,
        );
        return rows;
      });

      expect(Number(row.n)).toBe(CATALOG_ONLY);
    });

    it('makes all three status-ladder branches reachable, counted in SQL against real rows', async () => {
      // THE ASSERTION THIS WHOLE TASK EXISTS FOR. The branches are computed
      // here the way Phase 2 will compute them — `on_hand - reserved` against
      // `now() - interval '24 hours'`, in the database — not read back from
      // the fixture's `shape` label. A seed that wrote every row with the same
      // counted_at would satisfy every shape count in group 1 and fail here,
      // which is the failure worth catching.
      const [row] = await withClient(async (c) => {
        const { rows } = await c.query<{
          fresh: string;
          stale: string;
          unavailable: string;
          unavailable_with_stock: string;
        }>(
          `select
             count(*) filter (
               where on_hand - reserved >= 1
                 and counted_at > now() - interval '24 hours'
             ) as fresh,
             count(*) filter (
               where on_hand - reserved >= 1
                 and counted_at <= now() - interval '24 hours'
             ) as stale,
             count(*) filter (where on_hand - reserved <= 0) as unavailable,
             count(*) filter (
               where on_hand - reserved <= 0 and on_hand > 0
             ) as unavailable_with_stock
           from public.inventory`,
        );
        return rows;
      });

      expect({
        fresh: Number(row.fresh),
        stale: Number(row.stale),
        unavailable: Number(row.unavailable),
        unavailable_with_stock: Number(row.unavailable_with_stock),
      }).toEqual({
        fresh: DECLARED_MIX.fresh_available,
        stale: DECLARED_MIX.stale_available,
        unavailable: DECLARED_MIX.none_on_hand + DECLARED_MIX.fully_reserved,
        unavailable_with_stock: DECLARED_MIX.fully_reserved,
      });
    });

    it('is idempotent — a second run changes no row count', async () => {
      expect(countsAfterSecond.books).toBe(TOTAL_BOOKS);
      expect(countsAfterSecond.inventory).toBe(TOTAL_INVENTORY);
    });

    it('is idempotent — a second run does not re-key an existing book', async () => {
      // Row counts alone cannot tell "did nothing" from "deleted all 150 and
      // reinserted them". The difference matters: `reservations.book_id`
      // references `books.id` and deliberately does NOT cascade
      // (schema-constraints.test.ts), so a delete-and-reinsert seed would
      // either fail against live reservations or silently orphan them. The
      // primary key surviving is the observable form of "upsert, not replace".
      expect(pinnedIdAfterFirst).not.toBeNull();
      expect(pinnedIdAfterSecond).toBe(pinnedIdAfterFirst);
    });

    it('touches no table other than books and inventory', async () => {
      const nonEmpty = Object.entries(countsAfterSecond)
        .filter(([table]) => (MUST_STAY_EMPTY as readonly string[]).includes(table))
        .filter(([, n]) => n !== 0)
        .map(([table, n]) => `${table}=${n}`);

      expect(
        nonEmpty,
        'The catalog seed writes books and inventory and nothing else. ' +
          'Customers, staff, reservations, stamps, rewards and events are ' +
          'created by real use, not fabricated here.',
      ).toEqual([]);

      // Guards the list itself: if a migration adds a public table, it has to
      // be classified here rather than silently escaping the check above.
      expect(Object.keys(countsAfterSecond).sort()).toEqual(
        ['books', 'inventory', ...MUST_STAY_EMPTY].sort(),
      );
    });
  });

  describe('group 3 — Integrity Boundary (data-integrity form)', () => {
    it('adds no policy, no grant, and no role', async () => {
      // The seed connects with the direct Postgres credential (DATABASE_URL) —
      // not an anon/authenticated client, and NOT a service_role key. Whichever
      // it used, the observable rule is the same: the access-control surface of
      // schema public is byte-identical either side of the run.
      expect(after.policies, 'The seed changed the RLS policy set.').toEqual(
        before.policies,
      );
      expect(after.grants, 'The seed changed the table grant set.').toEqual(
        before.grants,
      );
      expect(after.roles, 'The seed created or dropped a role.').toEqual(
        before.roles,
      );
    });

    it('derives counted_at from the database clock, not from a timestamp in the fixture', async () => {
      // FORCE 4, made observable. If the generator baked absolute timestamps
      // into the committed fixture, every one of these rows drifts one hour
      // further from its declared offset per hour of wall-clock time since the
      // fixture was generated — so this passes on the day it is written and
      // rots silently, taking Phase 2's first branch with it. Comparing the
      // stored counted_at against `now()` is what makes that rot a failure.
      const observed = await withClient(async (c) => {
        const { rows } = await c.query<{ isbn13: string; hours_ago: number }>(
          `select b.isbn13,
                  (extract(epoch from (now() - i.counted_at)) / 3600.0)::float8
                    as hours_ago
             from public.inventory i
             join public.books b on b.id = i.book_id`,
        );
        return rows;
      });

      const expected = new Map(
        stockedBooks(fixture).map(({ isbn13, stock }) => [
          isbn13,
          stock.counted_hours_ago,
        ]),
      );

      expect(observed).toHaveLength(TOTAL_INVENTORY);

      // 15 minutes of slack: enough for migrations, the seed itself, and a
      // loaded runner; far tighter than the 4-hour margin around the freshness
      // boundary, so this can never be the thing that flakes.
      const drifted = observed
        .filter((row) => {
          const want = expected.get(row.isbn13);
          return want === undefined || Math.abs(row.hours_ago - want) > 0.25;
        })
        .map(
          (row) =>
            `${row.isbn13}: stored ${row.hours_ago.toFixed(3)}h ago, fixture ` +
            `declares ${String(expected.get(row.isbn13))}h`,
        );

      expect(
        drifted,
        'counted_at must be written as now() - the fixture\'s ' +
          'counted_hours_ago offset, resolved by the DATABASE clock. No ' +
          'absolute timestamp may appear in books.fixture.json.',
      ).toEqual([]);
    });

    it('shows an anonymous visitor the catalog and nothing else', async () => {
      // Read as `anon`, the role a signed-out browser actually reaches Postgres
      // with. The seed must not have widened what that role can see: books and
      // inventory are public by policy (books_public_read,
      // inventory_public_read), and everything else answers "nothing here"
      // rather than raising, because 20260824121500 grants select on all of
      // them and backs none of them with a policy for anon.
      const counts = await withClient(async (c) => {
        await asAnon(c);

        // The disguise has to be PROVEN, not assumed. A privileged session
        // bypasses RLS entirely and would make every zero below pass for the
        // wrong reason — the tables are empty anyway, so the zeroes are only
        // evidence if the session genuinely has no way to see rows it should
        // not.
        const { rows: identity } = await c.query<{
          who: string;
          bypasses_rls: boolean;
          owns_public_tables: boolean;
        }>(
          `select current_user::text as who,
                  exists (
                    select 1 from pg_roles
                     where rolname = current_user
                       and (rolsuper or rolbypassrls)
                  ) as bypasses_rls,
                  exists (
                    select 1 from pg_tables
                     where schemaname = 'public' and tableowner = current_user
                  ) as owns_public_tables`,
        );

        expect(identity[0]).toEqual({
          who: 'anon',
          bypasses_rls: false,
          owns_public_tables: false,
        });

        const { rows } = await c.query<Record<string, string>>(
          `select (select count(*) from public.books) as books,
                  (select count(*) from public.inventory) as inventory,
                  (select count(*) from public.customers) as customers,
                  (select count(*) from public.reservations) as reservations,
                  (select count(*) from public.loyalty_stamps) as loyalty_stamps,
                  (select count(*) from public.staff) as staff,
                  (select count(*) from public.rewards) as rewards,
                  (select count(*) from public.events) as events`,
        );

        return Object.fromEntries(
          Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]),
        );
      });

      expect(counts).toEqual({
        books: TOTAL_BOOKS,
        inventory: TOTAL_INVENTORY,
        customers: 0,
        reservations: 0,
        loyalty_stamps: 0,
        staff: 0,
        rewards: 0,
        events: 0,
      });
    });
  });
});

// ===========================================================================
// GROUP 3 (continued) — the guard on where the seed is allowed to point.
//
// Pure, and deliberately outside the database describe: this is the one part of
// the seed whose whole job is to run BEFORE a connection is made.
// ===========================================================================

describe('group 3 — assertSeedTargetAllowed refuses a non-local target', () => {
  const LOCAL_URLS = [
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@localhost:54322/postgres',
  ];

  const REMOTE_URL =
    'postgresql://postgres:hunter2@db.riversidebooks.supabase.co:5432/postgres';

  it.each(LOCAL_URLS)('allows the local stack at %s', (url) => {
    expect(() => assertSeedTargetAllowed(url, {})).not.toThrow();
  });

  it('throws for a remote host with no opt-in', () => {
    // FORCE 3: refusing to run against a non-local database by default beats
    // frictionless seeding. The seed truncates nothing, but it does insert 150
    // rows, and the shared Supabase project is one exported DATABASE_URL away
    // from any developer's shell. Fixture data in the environment the other
    // three products read is a cross-team incident, not a local mess.
    expect(() => assertSeedTargetAllowed(REMOTE_URL, {})).toThrow();
  });

  it('allows a remote host only with SEED_ALLOW_REMOTE=1', () => {
    expect(() =>
      assertSeedTargetAllowed(REMOTE_URL, { SEED_ALLOW_REMOTE: '1' }),
    ).not.toThrow();
  });

  it('treats any other SEED_ALLOW_REMOTE value as no opt-in', () => {
    // '0' and 'false' are the values a developer reaches for when they mean
    // "off". An implementation testing only for presence would read both as
    // consent — the inverse of what was typed.
    expect(() =>
      assertSeedTargetAllowed(REMOTE_URL, { SEED_ALLOW_REMOTE: '0' }),
    ).toThrow();
    expect(() =>
      assertSeedTargetAllowed(REMOTE_URL, { SEED_ALLOW_REMOTE: 'false' }),
    ).toThrow();
  });
});
