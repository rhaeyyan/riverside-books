// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 5 — the catalog seed.
//
// Reads seed/books.fixture.json from disk, validates it, and upserts it into
// `books` and `inventory` in ONE transaction. Nothing here touches the network:
// the retrieval happened once, in seed/fetch-open-library.ts, and its output is
// committed. A seed that fetched at run time would make every test that depends
// on it depend on openlibrary.org being up.
//
// INTEGRITY BOUNDARY — data-integrity form (Products A/B). Every value this
// module writes is admitted by the DATABASE, not by this module's judgement:
// `inventory_reserved_sane` decides whether a stock row is coherent,
// `books.isbn13 unique` decides what "already seeded" means, the not-null
// columns decide what a complete row is. Four consequences, each deliberate:
//
//   1. NOTHING IS DISABLED, DEFERRED, OR ROUTED AROUND. No
//      `set session_replication_role`, no `alter table ... disable trigger`, no
//      `set constraints ... deferred`, no dropped constraint restored
//      afterwards, and no policy, grant, or role created to reach a table. If
//      the fixture cannot be inserted, the constraint is right and the fixture
//      is wrong — `validateFixture` exists so that failure arrives as a named
//      entry index instead of as one 23514 from the middle of a rolled-back
//      transaction.
//   2. `counted_at` IS COMPUTED FROM THE DATABASE'S CLOCK:
//      `now() - make_interval(hours => counted_hours_ago)`, evaluated by
//      Postgres inside the transaction. The fixture carries an OFFSET and never
//      a timestamp. A fixture with absolute timestamps describes a shop whose
//      counts were fresh the day it was generated and stale the following week,
//      and Phase 2's "on the shelf as of {time}" branch would stop being
//      reachable without a single test having changed.
//   3. AVAILABILITY IS NEVER COMPUTED HERE. There is no `available` column and
//      this module does not derive one. `on_hand - reserved` stays a read-time
//      expression in Phase 2, so the seed cannot quietly become a second,
//      disagreeing definition of what is on the shelf.
//   4. RE-SEEDING UPSERTS; IT NEVER DELETES AND REINSERTS.
//      `reservations.book_id` references `books.id` and deliberately does NOT
//      cascade, so a delete-and-reinsert seed would either fail against live
//      reservations or orphan them. `on conflict ... do update` keeps every
//      `books.id` stable across runs.
//
// WHY seed/ AND NOT lib/. `lib/` is code the deployed app runs with the anon
// key. This module opens a direct, privileged Postgres connection, so putting
// it where `app/` can import it would put a superuser connection string one
// autocomplete away from a client bundle. It lives outside the app's import
// graph on purpose, and Vercel never builds it.
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

// ---------------------------------------------------------------------------
// The fixture contract.
// ---------------------------------------------------------------------------

export const STOCK_SHAPES = [
  'fresh_available',
  'stale_available',
  'none_on_hand',
  'fully_reserved',
] as const;

export type StockShape = (typeof STOCK_SHAPES)[number];

export const FORMATS = ['paperback', 'hardcover'] as const;

export type BookFormat = (typeof FORMATS)[number];

export type FixtureStock = {
  shape: StockShape;
  on_hand: number;
  reserved: number;
  /**
   * Hours before the seed runs, NOT a timestamp. Resolved against the
   * database's `now()` — see the Integrity Boundary note above.
   */
  counted_hours_ago: number;
};

export type FixtureBook = {
  isbn13: string;
  title: string;
  author: string;
  format: BookFormat;
  price_cents: number;
  published_on: string | null;
  /** Provenance only. `books` has no such column and never receives this. */
  ol_edition_key: string;
  stock: FixtureStock | null;
};

/** One fuzzy-search probe: a near-miss query and the entry it must return. */
export type SearchProbe = { query: string; isbn13: string };

export type FixtureMeta = {
  notice: string;
  catalog_source: string;
  catalog_license: string;
  retrieved_at: string;
  generated_by: string;
  invented_fields: string[];
  search_probes: SearchProbe[];
};

export type CatalogFixture = {
  $fixture: FixtureMeta;
  books: FixtureBook[];
};

export type SeedCounts = { books: number; inventory: number };

/** The seven `$fixture` provenance keys. Exactly these — no more, no fewer. */
const FIXTURE_META_KEYS = [
  'catalog_license',
  'catalog_source',
  'generated_by',
  'invented_fields',
  'notice',
  'retrieved_at',
  'search_probes',
] as const;

/** The declared mix, restated so `seed:validate` can catch drift offline. */
const DECLARED_MIX: Record<StockShape, number> = {
  fresh_available: 60,
  stale_available: 45,
  none_on_hand: 20,
  fully_reserved: 10,
};

const TOTAL_BOOKS = 150;
const MAX_ON_HAND = 6;

/** Four hours either side of Phase 2's 24-hour freshness boundary. */
const FORBIDDEN_BAND: readonly [number, number] = [20, 30];

const FRESH_HOURS: readonly [number, number] = [1, 19];
const STALE_HOURS: readonly [number, number] = [31, 9600];

/** 180 days. At least MIN_VERY_STALE stale rows must be older than this. */
const VERY_STALE_HOURS = 4320;
const MIN_VERY_STALE = 8;
const MIN_PARTIALLY_RESERVED = 12;
const MIN_SEARCH_PROBES = 5;
const MIN_NON_ASCII_PROBES = 3;

const NON_ASCII = /[^\x00-\x7F]/;

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

class FixtureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(
      `${message}\n\nseed/books.fixture.json is COMMITTED data, so this is a ` +
        'bug in seed/fetch-open-library.ts (or a hand edit to its output), ' +
        'not a runtime condition. Re-run the generator rather than patching ' +
        'the JSON.',
      options,
    );
    this.name = 'FixtureError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0;

  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10;
}

function hasValidIsbn13(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) {
    return false;
  }

  return isbn13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * True for a `YYYY-MM-DD` string naming a date that exists. The round-trip is
 * the point: `new Date('2023-02-30')` rolls over to March 2 rather than
 * throwing, so a regex alone accepts dates Postgres rejects with 22008.
 */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validates one entry. EVERY message names the entry's index, because
 * "invalid fixture" against a 150-entry file is not a diagnosis — it is a
 * request to go and read 150 entries by hand.
 */
function validateBook(value: unknown, index: number): FixtureBook {
  const at = `books[${String(index)}]`;

  if (!isRecord(value)) {
    throw new FixtureError(`${at} is not an object.`);
  }

  if (!hasValidIsbn13(value.isbn13)) {
    throw new FixtureError(
      `${at}.isbn13 (${JSON.stringify(value.isbn13)}) is not 13 digits with a ` +
        'check digit satisfying the alternating 1/3 weighted modulus-10 rule.',
    );
  }

  if (!isNonEmptyString(value.title)) {
    throw new FixtureError(`${at}.title must be a non-empty string.`);
  }

  if (!isNonEmptyString(value.author)) {
    throw new FixtureError(`${at}.author must be a non-empty string.`);
  }

  if (
    typeof value.format !== 'string' ||
    !(FORMATS as readonly string[]).includes(value.format)
  ) {
    throw new FixtureError(
      `${at}.format is ${JSON.stringify(value.format)}; it must be one of ` +
        `${FORMATS.join(' | ')}. A missing binding is filtered out by the ` +
        'generator, never defaulted.',
    );
  }

  if (!isPositiveInteger(value.price_cents)) {
    throw new FixtureError(
      `${at}.price_cents is ${JSON.stringify(value.price_cents)}; it must be ` +
        'a positive integer number of cents.',
    );
  }

  if (
    value.published_on !== null &&
    (typeof value.published_on !== 'string' || !isIsoDate(value.published_on))
  ) {
    throw new FixtureError(
      `${at}.published_on is ${JSON.stringify(value.published_on)}; it must ` +
        'be null or a YYYY-MM-DD string naming a date that exists.',
    );
  }

  if (!isNonEmptyString(value.ol_edition_key)) {
    throw new FixtureError(
      `${at}.ol_edition_key must be a non-empty string. It is never written ` +
        'to the database, but it is what makes a wrong row traceable back to ' +
        'the Open Library record it came from.',
    );
  }

  return {
    isbn13: value.isbn13,
    title: value.title,
    author: value.author,
    format: value.format as BookFormat,
    price_cents: value.price_cents,
    published_on: value.published_on as string | null,
    ol_edition_key: value.ol_edition_key,
    stock: validateStock(value.stock, at),
  };
}

function validateStock(value: unknown, at: string): FixtureStock | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    throw new FixtureError(`${at}.stock must be null or an object.`);
  }

  const { shape, on_hand: onHand, reserved, counted_hours_ago: hours } = value;

  if (
    typeof shape !== 'string' ||
    !(STOCK_SHAPES as readonly string[]).includes(shape)
  ) {
    throw new FixtureError(
      `${at}.stock.shape is ${JSON.stringify(shape)}; it must be one of ` +
        `${STOCK_SHAPES.join(' | ')}.`,
    );
  }

  if (
    typeof onHand !== 'number' ||
    !Number.isInteger(onHand) ||
    onHand < 0 ||
    onHand > MAX_ON_HAND
  ) {
    throw new FixtureError(
      `${at}.stock.on_hand is ${JSON.stringify(onHand)}; it must be an ` +
        `integer in 0..${String(MAX_ON_HAND)}.`,
    );
  }

  // Mirrors `inventory_reserved_sane`. This does NOT replace the constraint —
  // the constraint is what enforces it, and schema-constraints.test.ts proves
  // that from rejected writes. It is here so a bad fixture fails as a named
  // entry rather than as one 23514 that rolls the other 149 back.
  if (
    typeof reserved !== 'number' ||
    !Number.isInteger(reserved) ||
    reserved < 0 ||
    reserved > onHand
  ) {
    throw new FixtureError(
      `${at}.stock.reserved is ${JSON.stringify(reserved)}; it must be an ` +
        `integer with 0 <= reserved <= on_hand (${String(onHand)}). This is ` +
        'the shape of inventory_reserved_sane, checked early so the ' +
        'database does not have to reject the whole transaction to say so.',
    );
  }

  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1) {
    throw new FixtureError(
      `${at}.stock.counted_hours_ago is ${JSON.stringify(hours)}; it must be ` +
        'a positive INTEGER number of hours before the seed runs. It is an ' +
        'offset, never a timestamp.',
    );
  }

  if (hours >= FORBIDDEN_BAND[0] && hours <= FORBIDDEN_BAND[1]) {
    throw new FixtureError(
      `${at}.stock.counted_hours_ago is ${String(hours)}, inside the ` +
        `forbidden [${String(FORBIDDEN_BAND[0])},${String(FORBIDDEN_BAND[1])}] ` +
        'band — a four-hour margin either side of Phase 2\'s 24-hour ' +
        'freshness boundary. A row in that band changes status depending on ' +
        'how slow the CI runner was, which is a flake rather than a test case.',
    );
  }

  const stock: FixtureStock = {
    shape: shape as StockShape,
    on_hand: onHand,
    reserved,
    counted_hours_ago: hours,
  };

  assertShapeInvariant(stock, at);

  return stock;
}

function assertShapeInvariant(stock: FixtureStock, at: string): void {
  const available = stock.on_hand - stock.reserved;
  const describe = `on_hand=${String(stock.on_hand)} reserved=${String(stock.reserved)} counted_hours_ago=${String(stock.counted_hours_ago)}`;

  const fail = (requirement: string): never => {
    throw new FixtureError(
      `${at}.stock is labelled ${stock.shape} but ${describe} — ${requirement}`,
    );
  };

  switch (stock.shape) {
    case 'fresh_available':
      if (available < 1) {
        fail('a fresh_available row needs on_hand - reserved >= 1.');
      }

      if (
        stock.counted_hours_ago < FRESH_HOURS[0] ||
        stock.counted_hours_ago > FRESH_HOURS[1]
      ) {
        fail(
          `a fresh_available row needs counted_hours_ago in ${String(FRESH_HOURS[0])}..${String(FRESH_HOURS[1])}.`,
        );
      }

      break;

    case 'stale_available':
      if (available < 1) {
        fail('a stale_available row needs on_hand - reserved >= 1.');
      }

      if (
        stock.counted_hours_ago < STALE_HOURS[0] ||
        stock.counted_hours_ago > STALE_HOURS[1]
      ) {
        fail(
          `a stale_available row needs counted_hours_ago in ${String(STALE_HOURS[0])}..${String(STALE_HOURS[1])}.`,
        );
      }

      break;

    case 'none_on_hand':
      if (stock.on_hand !== 0 || stock.reserved !== 0) {
        fail('a none_on_hand row is exactly on_hand = 0, reserved = 0.');
      }

      break;

    case 'fully_reserved':
      if (stock.on_hand < 1 || stock.reserved !== stock.on_hand) {
        fail('a fully_reserved row is on_hand = reserved >= 1.');
      }

      break;
  }
}

/**
 * The whole-catalogue claims: the exact mix, and the sub-quotas that keep each
 * of Phase 2's branches genuinely exercised rather than merely present.
 *
 * These are aggregates, so they name counts rather than an index — there is no
 * single offending entry when the fixture has 59 fresh rows instead of 60.
 */
function validateAggregate(books: FixtureBook[], meta: FixtureMeta): void {
  if (books.length !== TOTAL_BOOKS) {
    throw new FixtureError(
      `The catalogue has ${String(books.length)} entries; exactly ` +
        `${String(TOTAL_BOOKS)} are declared.`,
    );
  }

  const seen = new Map<string, number>();

  books.forEach((book, index) => {
    const first = seen.get(book.isbn13);

    if (first !== undefined) {
      throw new FixtureError(
        `books[${String(index)}].isbn13 (${book.isbn13}) already appears at ` +
          `books[${String(first)}]. books.isbn13 is unique, so the seed would ` +
          'otherwise die on 23505 partway through.',
      );
    }

    seen.set(book.isbn13, index);
  });

  const stocked = books.flatMap((b) => (b.stock === null ? [] : [b.stock]));

  for (const shape of STOCK_SHAPES) {
    const got = stocked.filter((s) => s.shape === shape).length;

    if (got !== DECLARED_MIX[shape]) {
      throw new FixtureError(
        `The catalogue has ${String(got)} ${shape} entries; the declared mix ` +
          `requires exactly ${String(DECLARED_MIX[shape])}. This is an ` +
          'equality, not a floor: Phase 2 asserts these counts in SQL against ' +
          'the seeded rows.',
      );
    }
  }

  const partiallyReserved = stocked.filter(
    (s) =>
      s.shape === 'fresh_available' && s.reserved > 0 && s.reserved < s.on_hand,
  ).length;

  if (partiallyReserved < MIN_PARTIALLY_RESERVED) {
    throw new FixtureError(
      `Only ${String(partiallyReserved)} fresh_available rows are partially ` +
        `reserved; at least ${String(MIN_PARTIALLY_RESERVED)} must be. With ` +
        'every available row at reserved = 0, `available = on_hand - ' +
        'reserved` renders identically to `available = on_hand`, and a status ' +
        'function that forgot to subtract would look right against the whole ' +
        'catalogue.',
    );
  }

  const veryStale = stocked.filter(
    (s) =>
      s.shape === 'stale_available' && s.counted_hours_ago > VERY_STALE_HOURS,
  ).length;

  if (veryStale < MIN_VERY_STALE) {
    throw new FixtureError(
      `Only ${String(veryStale)} stale_available rows are older than 180 ` +
        `days; at least ${String(MIN_VERY_STALE)} must be, so "last counted ` +
        '{date}" is exercised against something genuinely old.',
    );
  }

  const none = stocked.filter((s) => s.shape === 'none_on_hand');

  if (
    !none.some((s) => s.counted_hours_ago < FORBIDDEN_BAND[0]) ||
    !none.some((s) => s.counted_hours_ago > FORBIDDEN_BAND[1])
  ) {
    throw new FixtureError(
      'none_on_hand rows must be spread across both freshness bands. A shop ' +
        'that counted this morning and has none is a different claim about ' +
        'what it knows than one that has not counted since last year.',
    );
  }

  validateProbes(meta.search_probes, books);
}

function validateProbes(probes: SearchProbe[], books: FixtureBook[]): void {
  if (probes.length < MIN_SEARCH_PROBES) {
    throw new FixtureError(
      `$fixture.search_probes has ${String(probes.length)} entries; at least ` +
        `${String(MIN_SEARCH_PROBES)} are required.`,
    );
  }

  const byIsbn = new Map(books.map((b) => [b.isbn13, b]));

  probes.forEach((probe, index) => {
    const at = `$fixture.search_probes[${String(index)}]`;

    if (!isRecord(probe) || !isNonEmptyString(probe.query)) {
      throw new FixtureError(`${at}.query must be a non-empty string.`);
    }

    if (!byIsbn.has(probe.isbn13)) {
      throw new FixtureError(
        `${at}.isbn13 (${JSON.stringify(probe.isbn13)}) does not name an ` +
          'entry in this fixture.',
      );
    }
  });

  const nonAscii = probes.filter((p) => {
    const target = byIsbn.get(p.isbn13);

    return target !== undefined && NON_ASCII.test(target.author);
  }).length;

  if (nonAscii < MIN_NON_ASCII_PROBES) {
    throw new FixtureError(
      `Only ${String(nonAscii)} search probes target a book with a non-ASCII ` +
        `author; at least ${String(MIN_NON_ASCII_PROBES)} must. An unaccented ` +
        'query against an accented name is the case pg_trgm has to earn — a ' +
        'purely ASCII probe set would let a plain `ilike` pass for fuzzy ' +
        'matching.',
    );
  }
}

function validateMeta(value: unknown): FixtureMeta {
  if (!isRecord(value)) {
    throw new FixtureError('$fixture must be an object.');
  }

  const keys = Object.keys(value).sort();

  if (keys.join(',') !== [...FIXTURE_META_KEYS].join(',')) {
    throw new FixtureError(
      `$fixture has keys [${keys.join(', ')}]; it must have exactly ` +
        `[${FIXTURE_META_KEYS.join(', ')}]. The provenance block is what ` +
        'keeps "labelled as fixture data wherever it appears" enforceable ' +
        'rather than aspirational.',
    );
  }

  for (const key of ['notice', 'catalog_source', 'catalog_license', 'retrieved_at', 'generated_by'] as const) {
    if (!isNonEmptyString(value[key])) {
      throw new FixtureError(`$fixture.${key} must be a non-empty string.`);
    }
  }

  if (
    !Array.isArray(value.invented_fields) ||
    value.invented_fields.length === 0 ||
    !value.invented_fields.every((f) => isNonEmptyString(f))
  ) {
    throw new FixtureError(
      '$fixture.invented_fields must be a non-empty array of field names. ' +
        'price_cents and the stock block have no bibliographic source; this ' +
        'is where the fixture admits it.',
    );
  }

  if (!Array.isArray(value.search_probes)) {
    throw new FixtureError('$fixture.search_probes must be an array.');
  }

  return {
    notice: value.notice as string,
    catalog_source: value.catalog_source as string,
    catalog_license: value.catalog_license as string,
    retrieved_at: value.retrieved_at as string,
    generated_by: value.generated_by as string,
    invented_fields: value.invented_fields as string[],
    search_probes: value.search_probes as SearchProbe[],
  };
}

/**
 * Validates an already-parsed fixture and returns it typed, or throws naming
 * the offending entry.
 *
 * Deliberately strict about the whole declared mix and not only about each
 * entry in isolation: `npm run seed:validate` is the offline feedback loop for
 * a catalogue whose real oracle needs a Postgres, and a validator that only
 * checked field types would let a 59/46 mix through to fail in CI instead.
 */
export function validateFixture(value: unknown): CatalogFixture {
  if (!isRecord(value)) {
    throw new FixtureError('The fixture must be a JSON object.');
  }

  if (!Array.isArray(value.books)) {
    throw new FixtureError('The fixture needs a `books` array.');
  }

  const meta = validateMeta(value.$fixture);
  const books = value.books.map((book, index) => validateBook(book, index));

  validateAggregate(books, meta);

  return { $fixture: meta, books };
}

// ---------------------------------------------------------------------------
// Loading.
// ---------------------------------------------------------------------------

/**
 * Resolved from `import.meta.url` at run time rather than through
 * `resolveJsonModule`. Importing the JSON would bake 150 entries into whatever
 * bundle compiled this module and make the fixture a build-time constant; it is
 * data, and it is read from disk.
 */
const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'books.fixture.json',
);

export async function loadFixture(): Promise<CatalogFixture> {
  let raw: string;

  try {
    raw = await readFile(FIXTURE_PATH, 'utf8');
  } catch (cause) {
    throw new FixtureError(`No catalog fixture at ${FIXTURE_PATH}.`, { cause });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new FixtureError(
      `The catalog fixture at ${FIXTURE_PATH} is not valid JSON.`,
      { cause },
    );
  }

  return validateFixture(parsed);
}

// ---------------------------------------------------------------------------
// The write.
// ---------------------------------------------------------------------------

/**
 * Both statements are set-based: the fixture goes down as ONE jsonb parameter
 * and Postgres expands it with `jsonb_to_recordset`. A 150-iteration insert
 * loop would be 150 round trips and, worse, 150 separate opportunities for a
 * partially-applied catalogue if anything went wrong halfway.
 */
const UPSERT_BOOKS = `
  insert into public.books (isbn13, title, author, format, price_cents, published_on)
  select x.isbn13, x.title, x.author, x.format, x.price_cents, x.published_on
    from jsonb_to_recordset($1::jsonb)
      as x(isbn13 text, title text, author text, format text,
           price_cents integer, published_on date)
  on conflict (isbn13) do update
     set title = excluded.title,
         author = excluded.author,
         format = excluded.format,
         price_cents = excluded.price_cents,
         published_on = excluded.published_on
`;

/**
 * `now() - make_interval(hours => x.counted_hours_ago)` — THE DATABASE's clock,
 * not the host's and not a value from the fixture. `now()` is transaction start
 * time, so all 135 rows are dated from one instant.
 *
 * Joined to `books` on `isbn13` rather than carrying a `book_id`: the fixture
 * cannot know the uuid Postgres assigned, and looking it up here is what keeps
 * `books.id` free to stay stable across re-seeds.
 */
const UPSERT_INVENTORY = `
  insert into public.inventory (book_id, on_hand, reserved, counted_at)
  select b.id, x.on_hand, x.reserved,
         now() - make_interval(hours => x.counted_hours_ago)
    from jsonb_to_recordset($1::jsonb)
      as x(isbn13 text, on_hand integer, reserved integer,
           counted_hours_ago integer)
    join public.books b on b.isbn13 = x.isbn13
  on conflict (book_id) do update
     set on_hand = excluded.on_hand,
         reserved = excluded.reserved,
         counted_at = excluded.counted_at
`;

/**
 * Upserts the fixture into `books` and `inventory` in one transaction, and
 * returns the number of rows each statement actually affected.
 *
 * Takes the `pg.Client` rather than opening its own, so a caller — the oracle
 * in test/db/seed.test.ts, for one — can run it inside an existing session and
 * observe the result on the same connection.
 *
 * The returned counts come from the statements' own `rowCount`: they are what
 * the database did, not what this function set out to do. A seed that reports
 * its intent is how a half-applied run gets logged as a success.
 */
export async function seedCatalog(
  client: Client,
  fixture?: CatalogFixture,
): Promise<SeedCounts> {
  const catalog = fixture ?? (await loadFixture());

  const bookRows = catalog.books.map((book) => ({
    isbn13: book.isbn13,
    title: book.title,
    author: book.author,
    format: book.format,
    price_cents: book.price_cents,
    published_on: book.published_on,
  }));

  const stockRows = catalog.books.flatMap((book) =>
    book.stock === null
      ? []
      : [
          {
            isbn13: book.isbn13,
            on_hand: book.stock.on_hand,
            reserved: book.stock.reserved,
            counted_hours_ago: book.stock.counted_hours_ago,
          },
        ],
  );

  await client.query('begin');

  try {
    const books = await client.query(UPSERT_BOOKS, [JSON.stringify(bookRows)]);
    const inventory = await client.query(UPSERT_INVENTORY, [
      JSON.stringify(stockRows),
    ]);

    await client.query('commit');

    return { books: books.rowCount ?? 0, inventory: inventory.rowCount ?? 0 };
  } catch (cause) {
    // Rollback failure must never mask the error that caused it.
    await client.query('rollback').catch(() => undefined);

    throw cause;
  }
}

// ---------------------------------------------------------------------------
// The guard on where the seed may point.
// ---------------------------------------------------------------------------

/**
 * The database port of the Supabase CLI local stack, per supabase/config.toml.
 * Matches the test harness's default so `npm run seed` and `npm run test:db`
 * cannot disagree about which database "local" means.
 */
const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * The environment `assertSeedTargetAllowed` reads, as a plain string map.
 *
 * NOT `NodeJS.ProcessEnv`, which is the obvious annotation and the wrong one
 * here: this is a Next.js project, and Next augments `ProcessEnv` so that
 * `NODE_ENV` is REQUIRED. Under that declaration a caller cannot pass a small
 * literal like `{}` or `{ SEED_ALLOW_REMOTE: '1' }` to say "an environment
 * where this variable is unset / set" — it would have to invent a NODE_ENV it
 * has no opinion about, purely to satisfy a type. The oracle in
 * test/db/seed.test.ts calls it exactly that way, and neither Vitest nor ESLint
 * would have noticed the mismatch; `npm run typecheck` is what surfaced it.
 *
 * `process.env` satisfies this type too — `ProcessEnv` has a
 * `[key: string]: string | undefined` index signature — so the CLI below passes
 * the real environment unchanged.
 */
export type SeedEnv = Readonly<Record<string, string | undefined>>;

/**
 * Refuses any target that is not the local stack, unless SEED_ALLOW_REMOTE is
 * exactly '1'.
 *
 * The shared Supabase project is one exported DATABASE_URL away from any
 * developer's shell, and this seed writes 150 books and 135 inventory rows.
 * Fixture data appearing in the environment Products B, C and D read is a
 * cross-team incident, not a local mess — so the default is refusal and the
 * opt-in is explicit.
 *
 * '1' and nothing else: '0' and 'false' are what somebody types when they mean
 * "off", and a presence check would read both as consent.
 */
export function assertSeedTargetAllowed(
  databaseUrl: string,
  env: SeedEnv,
): void {
  let host: string;

  try {
    host = new URL(databaseUrl).hostname;
  } catch (cause) {
    throw new Error(
      `DATABASE_URL is not a parseable URL, so the seed cannot tell which ` +
        'host it would write to. It refuses to guess.',
      { cause },
    );
  }

  const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

  if (LOCAL_HOSTS.has(host)) {
    return;
  }

  if (env.SEED_ALLOW_REMOTE === '1') {
    return;
  }

  throw new Error(
    `Refusing to seed a non-local database. DATABASE_URL points at ` +
      `${host}, and this script only runs against the Supabase local stack ` +
      'by default. It writes 150 books and 135 inventory rows of clearly ' +
      'labelled FIXTURE data, and the shared Supabase project is read by ' +
      'Products B, C and D.\n\n' +
      'If you genuinely mean it, opt in explicitly:\n\n' +
      '  SEED_ALLOW_REMOTE=1 npm run seed\n\n' +
      'Only the exact value 1 counts as consent.',
  );
}

// ---------------------------------------------------------------------------
// CLI. Connect, guard, seed, report, disconnect — and nothing else. Every
// decision it makes is made by one of the exported functions above, so what
// `npm run seed` does is exactly what the oracle tests.
// ---------------------------------------------------------------------------

function isDirectRun(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const fixture = await loadFixture();
  const stocked = fixture.books.filter((b) => b.stock !== null).length;

  // `npm run seed:validate` — the offline half of the loop. It stops here,
  // before any connection, so the fixture can be checked on a laptop with no
  // Docker and no database. Its whole implementation is `loadFixture` above.
  if (process.argv.includes('--validate-only')) {
    process.stdout.write(
      `${fixture.$fixture.notice}\n\n` +
        `Fixture VALID: ${String(fixture.books.length)} catalog entries, ` +
        `${String(stocked)} with stock, ` +
        `${String(fixture.$fixture.search_probes.length)} search probes.\n` +
        `Retrieved ${fixture.$fixture.retrieved_at} from ${fixture.$fixture.catalog_source}.\n`,
    );

    return;
  }

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  assertSeedTargetAllowed(databaseUrl, process.env);

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const counts = await seedCatalog(client, fixture);

    process.stdout.write(
      `${fixture.$fixture.notice}\n\n` +
        `Seeded ${String(counts.books)} books and ` +
        `${String(counts.inventory)} inventory rows into ${databaseUrl}.\n`,
    );
  } finally {
    await client.end();
  }
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
