// ---------------------------------------------------------------------------
// Product A, Phase 1, Task 5 — the ONE-TIME, NETWORKED fixture generator.
//
// This file is not part of the seed and is never run by the test suite, by CI,
// or by `npm run seed`. It exists so that `seed/books.fixture.json` is a
// *record of a retrieval* rather than a list somebody typed: 150 real editions,
// each traceable back to the Open Library record it came from via its
// `ol_edition_key`. A hand-written catalogue would satisfy every assertion in
// test/db/seed.test.ts — a fabricated ISBN with a correct check digit is
// indistinguishable from a real one — and would still be fiction. Running this
// is what makes the difference, and it is why the generator is committed
// alongside its output: the provenance claim in `$fixture` is only checkable if
// the thing that produced it is readable.
//
//   OPENLIBRARY_CONTACT=you@example.com npm run seed:fetch
//
// WHAT IS REAL AND WHAT IS INVENTED. Everything bibliographic — isbn13, title,
// author, format, published_on, ol_edition_key — comes from Open Library and is
// passed through, normalised, or dropped. Nothing bibliographic is filled in
// from a default. Everything commercial and physical — price_cents, and the
// whole `stock` block — is INVENTED here, because no bibliographic source
// carries a retail price or a shelf count for a bookshop that does not exist
// (docs/assumptions.md). The `$fixture.invented_fields` list is where that is
// admitted in the data itself rather than only in this comment.
//
// DETERMINISM. Given the same Open Library responses this script produces a
// byte-identical fixture: there is no `Math.random()` anywhere, and the only
// `Date.now()` calls are the rate limiter's clock and `$fixture.retrieved_at`
// (which *is* the retrieval timestamp — provenance, not content). Every
// invented value is a pure function of the entry's ISBN-13 and its position in
// the ISBN-sorted catalogue. That is what makes a re-run reviewable as a diff
// instead of a wall of churn.
//
// POLITENESS. Open Library asks for an identifying User-Agent with a contact
// address and for traffic to stay slow. Both are enforced here rather than
// documented: the script refuses to start without OPENLIBRARY_CONTACT, and one
// request per second is the floor for every request it makes, searches
// included. The address is read from the environment and never committed.
// ---------------------------------------------------------------------------

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// The shape of the file this produces. Deliberately re-declared here rather
// than imported from ./seed: the generator writes the fixture and the validator
// reads it, and the only thing that should couple them is the JSON on disk.
// ---------------------------------------------------------------------------

type StockShape =
  | 'fresh_available'
  | 'stale_available'
  | 'none_on_hand'
  | 'fully_reserved';

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
  format: 'paperback' | 'hardcover';
  price_cents: number;
  published_on: string | null;
  ol_edition_key: string;
  stock: FixtureStock | null;
};

type SearchProbe = { query: string; isbn13: string };

// ---------------------------------------------------------------------------
// Retrieval settings.
// ---------------------------------------------------------------------------

const TARGET_BOOKS = 150;

/** One request per second, for every request, including the searches. */
const MIN_REQUEST_GAP_MS = 1000;

/** Works pulled per author search. */
const WORKS_PER_AUTHOR = 12;

/** Editions pulled per work. */
const EDITIONS_PER_WORK = 50;

/**
 * At most this many editions of the same work. A catalogue that is fifteen
 * printings of one novel technically satisfies every count in the oracle and is
 * useless for the fuzzy-search probes, which need distinct titles and authors
 * to be a meaningful test of anything.
 */
const MAX_EDITIONS_PER_WORK = 2;

/**
 * Search terms, in the order they are queried — a mix chosen so the catalogue
 * has enough authors whose names carry diacritics to build the non-ASCII search
 * probes from. `pg_trgm` against an unaccented query for an accented name is
 * the near-miss case Phase 2's exit condition actually turns on, and a
 * catalogue of Orwell and Austen alone would let a plain `ilike` pass for fuzzy
 * matching.
 *
 * If a run comes up short of 150 usable editions, WIDEN THIS LIST. Do not
 * loosen `normaliseFormat` — an edition with no stated binding is an edition
 * whose binding is unknown, and guessing it is exactly the invention this whole
 * file is arranged to avoid.
 */
const AUTHOR_QUERIES: readonly string[] = [
  'Gabriel García Márquez',
  'Antoine de Saint-Exupéry',
  'Émile Zola',
  'Stanisław Lem',
  'Karel Čapek',
  'Heinrich Böll',
  'José Saramago',
  'Selma Lagerlöf',
  'Julio Cortázar',
  'Federico García Lorca',
  'Günter Grass',
  'Kenzaburō Ōe',
  'Halldór Laxness',
  'Jules Verne',
  'Albert Camus',
  'Italo Calvino',
  'Umberto Eco',
  'Milan Kundera',
  'Isabel Allende',
  'Haruki Murakami',
  'Yasunari Kawabata',
  'Orhan Pamuk',
  'Chinua Achebe',
  'Toni Morrison',
  'James Baldwin',
  'Ursula K. Le Guin',
  'Octavia E. Butler',
  'Kazuo Ishiguro',
  'Zadie Smith',
  'Virginia Woolf',
  'George Orwell',
  'Jane Austen',
  'Charles Dickens',
  'Mary Shelley',
  'Bram Stoker',
  'Arthur Conan Doyle',
  'Agatha Christie',
  'Terry Pratchett',
  'Ernest Hemingway',
  'Fyodor Dostoyevsky',
];

// ---------------------------------------------------------------------------
// The declared mix, as a repeating 30-slot pattern.
//
// 150 entries / 30 = exactly 5 repetitions, and one repetition holds exactly
// one fifth of every declared count: 12 fresh, 9 stale, 4 none_on_hand, 2
// fully_reserved, 3 catalog-only. So the pattern gives the oracle's exact
// totals by construction (5 x 12 = 60, 5 x 9 = 45, 5 x 4 = 20, 5 x 2 = 10,
// 5 x 3 = 15) while interleaving the shapes through the ISBN-sorted catalogue
// instead of leaving them in five contiguous blocks. `assertPlanMatchesMix`
// below re-derives the totals from this array and halts if they ever drift.
//
// WHY POSITION AND NOT A HASH decides the shape: the oracle asserts equality on
// every count, not a floor, and no per-ISBN hash lands on 60/45/20/10/15 except
// by luck. Position fixes the counts; the ISBN hash then fixes the magnitudes
// within each shape, so the fixture is still reproducible from its own ISBNs.
// ---------------------------------------------------------------------------

const BLOCK_PATTERN: readonly (StockShape | null)[] = [
  'fresh_available',
  'stale_available',
  'fresh_available',
  'stale_available',
  'fresh_available',
  'none_on_hand',
  'fresh_available',
  'stale_available',
  'fresh_available',
  null,
  'fresh_available',
  'stale_available',
  'fresh_available',
  'fully_reserved',
  'fresh_available',
  'stale_available',
  'fresh_available',
  'none_on_hand',
  'fresh_available',
  'stale_available',
  'fresh_available',
  null,
  'fresh_available',
  'stale_available',
  'none_on_hand',
  'stale_available',
  null,
  'fully_reserved',
  'stale_available',
  'none_on_hand',
];

const DECLARED_MIX: Record<StockShape | 'catalog_only', number> = {
  fresh_available: 60,
  stale_available: 45,
  none_on_hand: 20,
  fully_reserved: 10,
  catalog_only: 15,
};

/** Every fourth fresh row is partially reserved: 15 of 60, oracle floor is 12. */
const PARTIAL_RESERVE_EVERY = 4;

/** Every fourth stale row is older than 180 days: 12 of 45, oracle floor is 8. */
const VERY_STALE_EVERY = 4;

// ---------------------------------------------------------------------------
// HTTP, at one request per second.
// ---------------------------------------------------------------------------

function contactAddress(): string {
  const contact = process.env.OPENLIBRARY_CONTACT?.trim();

  if (contact === undefined || contact === '') {
    throw new Error(
      'OPENLIBRARY_CONTACT is not set. Open Library asks that automated ' +
        'clients identify themselves with a contact address, so this script ' +
        'refuses to make a single request without one:\n\n' +
        '  OPENLIBRARY_CONTACT=you@example.com npm run seed:fetch\n\n' +
        'The address is read from the environment and is deliberately never ' +
        'written into a committed file.',
    );
  }

  return contact;
}

const USER_AGENT = `riverside-books-product-a-seed/0.1 (+https://github.com/rhaeyyan/riverside-books; ${contactAddress()})`;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * One GET, never sooner than a second after the previous one.
 *
 * Any non-OK response throws. There is no fallback path and no synthesised
 * record: a generator that quietly invents an entry when the API is having a
 * bad afternoon produces a fixture whose provenance block is a lie, and the lie
 * would be undetectable afterwards.
 */
async function politeGet(url: string): Promise<unknown> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();

  if (wait > 0) {
    await sleep(wait);
  }

  lastRequestAt = Date.now();

  let response: Response;

  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
  } catch (cause) {
    throw new Error(`Request to ${url} failed at the network level.`, {
      cause,
    });
  }

  if (!response.ok) {
    throw new Error(
      `Request to ${url} returned HTTP ${String(response.status)}. This ` +
        'script halts rather than filling the gap with invented data.',
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Narrowing helpers. Everything off the wire is `unknown` until proven
// otherwise; a wrong assumption about a field is how "thin record" turns into
// "undefined in the committed fixture".
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}

// ---------------------------------------------------------------------------
// ISBN handling.
// ---------------------------------------------------------------------------

function isbn13CheckDigit(first12: string): number {
  let sum = 0;

  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10;
}

/** A 13-digit ISBN with a real 978/979 prefix and a check digit that holds. */
function normaliseIsbn13(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');

  if (!/^97[89]\d{10}$/.test(digits)) {
    return null;
  }

  return isbn13CheckDigit(digits.slice(0, 12)) === Number(digits[12])
    ? digits
    : null;
}

/**
 * ISBN-10 to ISBN-13: prefix 978, drop the ISBN-10 check digit, recompute the
 * ISBN-13 one. The source check digit is verified first — an ISBN-10 that does
 * not validate is a typo in the catalogue record, and converting it produces a
 * *valid-looking* ISBN-13 for a book that does not have one.
 *
 * Never truncated and never padded. Those are the two ways this goes wrong
 * silently, and both yield thirteen digits.
 */
function isbn10ToIsbn13(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase();

  if (!/^\d{9}[\dX]$/.test(cleaned)) {
    return null;
  }

  let sum = 0;

  for (let i = 0; i < 10; i += 1) {
    const char = cleaned[i];
    sum += (char === 'X' ? 10 : Number(char)) * (10 - i);
  }

  if (sum % 11 !== 0) {
    return null;
  }

  const first12 = `978${cleaned.slice(0, 9)}`;

  return `${first12}${String(isbn13CheckDigit(first12))}`;
}

// ---------------------------------------------------------------------------
// Field normalisation: filter, never default.
// ---------------------------------------------------------------------------

/**
 * `physical_format` is free text on Open Library — this run saw "paperback",
 * "Paperback", "mass market paperback", "Taschenbuch", "audio cd", "Unknown
 * Binding" and "Paperback with case" among others. Only the strings in these
 * two allowlists are accepted; everything else, INCLUDING A MISSING FIELD, is
 * dropped.
 *
 * `books.format` is `not null`, so an entry has to carry one of two values, and
 * the tempting shortcut is to default the unknowns to 'paperback'. That would
 * put a claim about a physical object into the catalogue that no source
 * supports — and "Paperback with case" is the reminder of why substring
 * matching is not a safer version of the same shortcut.
 */
function normaliseFormat(raw: unknown): 'paperback' | 'hardcover' | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');

  const PAPERBACK = new Set([
    'paperback',
    'paperbacks',
    'trade paperback',
    'mass market paperback',
    'mass-market paperback',
    'perfect paperback',
    'softcover',
    'soft cover',
    'paperback / softback',
    'pbk',
    'pbk.',
  ]);

  const HARDCOVER = new Set([
    'hardcover',
    'hardcovers',
    'hardback',
    'hard cover',
    'hardcover with dust jacket',
    'tankobon hardcover',
    // A reinforced hardcover binding sold to libraries. Still a hardcover.
    'library binding',
  ]);

  if (PAPERBACK.has(value)) {
    return 'paperback';
  }

  if (HARDCOVER.has(value)) {
    return 'hardcover';
  }

  return null;
}

const MONTHS: Record<string, number | undefined> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDateIfReal(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);

  // The round-trip is the check: `new Date('2023-02-30')` does not throw, it
  // rolls over to March 2, and Postgres would reject the original with 22008.
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

/**
 * Open Library's `publish_date` is free text: "1967", "March 1998", "n.d.",
 * "1970-01-01", "Sep 01, 2004", and — seen in this run — "O5/06/1995", with a
 * letter O for a zero.
 *
 * Only a full year-month-day is accepted. A bare year could be turned into
 * January 1st and a bare month into the 1st, and both would put a precise date
 * into the catalogue that the source never stated. `books.published_on` is
 * nullable precisely so this can decline.
 */
function normalisePublishedOn(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (iso) {
    return isoDateIfReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const monthFirst = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);

  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase().slice(0, 4)] ?? MONTHS[monthFirst[1].toLowerCase().slice(0, 3)];

    return month === undefined
      ? null
      : isoDateIfReal(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(value);

  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase().slice(0, 4)] ?? MONTHS[dayFirst[2].toLowerCase().slice(0, 3)];

    return month === undefined
      ? null
      : isoDateIfReal(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Retrieval.
// ---------------------------------------------------------------------------

type WorkRef = { workKey: string; author: string };

/**
 * Works for one author. A doc is kept only when one of its `author_name`
 * entries is EXACTLY the queried name — Open Library's relevance search happily
 * returns books about an author alongside books by them, and the name that ends
 * up in `books.author` has to be one the source actually attached to the work.
 */
async function searchWorks(author: string): Promise<WorkRef[]> {
  const url =
    'https://openlibrary.org/search.json?q=' +
    encodeURIComponent(`author:"${author}"`) +
    `&fields=key,title,author_name&limit=${String(WORKS_PER_AUTHOR)}`;

  const payload = await politeGet(url);
  const docs = isRecord(payload) && Array.isArray(payload.docs) ? payload.docs : [];
  const refs: WorkRef[] = [];

  for (const doc of docs) {
    if (!isRecord(doc)) {
      continue;
    }

    const workKey = stringField(doc.key);
    const names = stringArray(doc.author_name);

    if (workKey === null || !workKey.startsWith('/works/')) {
      continue;
    }

    if (!names.includes(author)) {
      continue;
    }

    refs.push({ workKey, author });
  }

  return refs;
}

type Candidate = Omit<FixtureBook, 'stock' | 'price_cents'>;

/**
 * The usable editions of one work, capped at MAX_EDITIONS_PER_WORK.
 *
 * English-language editions only. The store is an English-language bookshop
 * (docs/assumptions.md), and without the filter a search for García Márquez
 * returns mostly Spanish, Portuguese and Italian printings — a catalogue the
 * fuzzy-search probes could not be read against. The filter is on the source's
 * own `languages` field, so an edition with no stated language is dropped
 * rather than assumed to be English.
 */
async function editionsOf(work: WorkRef): Promise<Candidate[]> {
  const payload = await politeGet(
    `https://openlibrary.org${work.workKey}/editions.json?limit=${String(EDITIONS_PER_WORK)}`,
  );

  const entries =
    isRecord(payload) && Array.isArray(payload.entries) ? payload.entries : [];

  const kept: Candidate[] = [];

  for (const entry of entries) {
    if (kept.length >= MAX_EDITIONS_PER_WORK) {
      break;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const languages = Array.isArray(entry.languages) ? entry.languages : [];
    const isEnglish = languages.some(
      (l) => isRecord(l) && l.key === '/languages/eng',
    );

    if (!isEnglish) {
      continue;
    }

    const format = normaliseFormat(entry.physical_format);

    if (format === null) {
      continue;
    }

    const title = stringField(entry.title);
    const editionKey = stringField(entry.key);

    if (title === null || editionKey === null) {
      continue;
    }

    const isbn13 =
      stringArray(entry.isbn_13)
        .map(normaliseIsbn13)
        .find((v) => v !== null) ??
      stringArray(entry.isbn_10)
        .map(isbn10ToIsbn13)
        .find((v) => v !== null) ??
      null;

    if (isbn13 === null) {
      continue;
    }

    kept.push({
      isbn13,
      title,
      author: work.author,
      format,
      published_on: normalisePublishedOn(entry.publish_date),
      ol_edition_key: editionKey,
    });
  }

  return kept;
}

// ---------------------------------------------------------------------------
// The invented fields.
// ---------------------------------------------------------------------------

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

/** A stable value in [0, n) for one entry and one field. */
function pick(isbn13: string, field: string, n: number): number {
  return fnv1a(`${isbn13}:${field}`) % n;
}

/** GBP 6.99 to GBP 29.99, in whole pounds and ninety-nine pence. */
function priceCentsFor(isbn13: string): number {
  return 699 + pick(isbn13, 'price', 24) * 100;
}

/**
 * The shape for every one of `total` catalogue positions: BLOCK_PATTERN,
 * repeated, with the resulting totals checked against DECLARED_MIX.
 *
 * The check is on the WHOLE plan rather than on one block, and it is called
 * before the first network request rather than after the last one — the first
 * version of this compared a single 30-slot block against the 150-entry totals,
 * declared a drift that was not there, and only said so after four minutes of
 * polite, rate-limited retrieval had already finished. A guard on the arithmetic
 * is worth having; a guard that spends the whole retrieval budget before firing
 * is not.
 */
function stockPlan(total: number): (StockShape | null)[] {
  if (total % BLOCK_PATTERN.length !== 0) {
    throw new Error(
      `A catalogue of ${String(total)} entries is not a whole number of ` +
        `${String(BLOCK_PATTERN.length)}-slot blocks, so repeating ` +
        'BLOCK_PATTERN cannot land on the declared mix exactly.',
    );
  }

  const plan = Array.from(
    { length: total },
    (_, index) => BLOCK_PATTERN[index % BLOCK_PATTERN.length],
  );

  const counts: Record<string, number | undefined> = { catalog_only: 0 };

  for (const shape of plan) {
    const key = shape ?? 'catalog_only';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  for (const [key, want] of Object.entries(DECLARED_MIX)) {
    if (counts[key] !== want) {
      throw new Error(
        `The stock plan produces ${String(counts[key] ?? 0)} ${key} entries, ` +
          `but the declared mix requires ${String(want)}. BLOCK_PATTERN and ` +
          'DECLARED_MIX have drifted apart.',
      );
    }
  }

  return plan;
}

/**
 * The stock block for one entry.
 *
 * `counted_hours_ago` is an OFFSET, never a timestamp — the seed resolves it
 * against the database's own `now()` at write time. A fixture carrying absolute
 * timestamps would describe a catalogue that was fresh on the day it was
 * generated and is stale by the following week, and Phase 2's first status
 * branch would stop being reachable without any test having changed.
 *
 * Nothing is ever produced in [20,30] hours: that is a four-hour margin either
 * side of Phase 2's 24-hour freshness boundary, and a row inside it would flip
 * branches depending on how slow the CI runner was that morning.
 */
function stockFor(
  isbn13: string,
  shape: StockShape,
  ordinal: number,
): FixtureStock {
  const freshHours = (): number => 1 + pick(isbn13, 'hours', 19);
  const staleHours = (): number => 31 + pick(isbn13, 'hours', 9570);

  if (shape === 'fresh_available' || shape === 'stale_available') {
    const partial =
      shape === 'fresh_available'
        ? ordinal % PARTIAL_RESERVE_EVERY === 0
        : ordinal % 5 === 0;

    // A partially reserved row needs room for `0 < reserved < on_hand`, so it
    // starts at two copies. Without these rows every available row would have
    // `reserved = 0`, and `available = on_hand - reserved` would render
    // identically to `available = on_hand` across the whole catalogue.
    const onHand = partial ? 2 + pick(isbn13, 'on_hand', 5) : 1 + pick(isbn13, 'on_hand', 6);
    const reserved = partial ? 1 + pick(isbn13, 'reserved', onHand - 1) : 0;

    if (shape === 'fresh_available') {
      return {
        shape,
        on_hand: onHand,
        reserved,
        counted_hours_ago: freshHours(),
      };
    }

    // Every fourth stale row is older than 180 days, so "last counted {date}"
    // is exercised against something genuinely ancient and not only against
    // yesterday-but-one.
    return {
      shape,
      on_hand: onHand,
      reserved,
      counted_hours_ago:
        ordinal % VERY_STALE_EVERY === 0
          ? 4321 + pick(isbn13, 'hours', 5280)
          : 31 + pick(isbn13, 'hours', 4290),
    };
  }

  // The two unavailable shapes alternate across the freshness bands: a title
  // the shop counted this morning and has none of is a different claim about
  // how much the shop knows than one it has not counted since last year, and
  // Phase 2 has to be able to say both.
  const hours = ordinal % 2 === 0 ? freshHours() : staleHours();

  if (shape === 'none_on_hand') {
    return { shape, on_hand: 0, reserved: 0, counted_hours_ago: hours };
  }

  const onHand = 1 + pick(isbn13, 'on_hand', 6);

  return {
    shape,
    on_hand: onHand,
    reserved: onHand,
    counted_hours_ago: hours,
  };
}

function applyMix(candidates: Candidate[]): FixtureBook[] {
  const plan = stockPlan(candidates.length);

  // Sorted by ISBN so the assignment depends only on WHICH books were
  // retrieved, not on the order Open Library happened to return them in.
  const sorted = [...candidates].sort((a, b) => a.isbn13.localeCompare(b.isbn13));
  const ordinals: Record<string, number | undefined> = {};

  return sorted.map((candidate, index) => {
    const shape = plan[index];

    if (shape === null) {
      return {
        ...candidate,
        price_cents: priceCentsFor(candidate.isbn13),
        stock: null,
      };
    }

    const ordinal = ordinals[shape] ?? 0;
    ordinals[shape] = ordinal + 1;

    return {
      ...candidate,
      price_cents: priceCentsFor(candidate.isbn13),
      stock: stockFor(candidate.isbn13, shape, ordinal),
    };
  });
}

// ---------------------------------------------------------------------------
// Fuzzy-search probes.
// ---------------------------------------------------------------------------

const NON_ASCII = /[^\x00-\x7F]/;

const TRANSLITERATE: Record<string, string | undefined> = {
  ß: 'ss',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ı: 'i',
};

/**
 * The name as somebody types it on an English keyboard: combining marks
 * stripped, and the handful of letters that do not decompose mapped by hand.
 */
function deaccent(value: string): string {
  return [...value]
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Swaps two adjacent letters in the longest word — an ordinary typing slip. */
function transposeLongestWord(value: string): string {
  const parts = value.split(' ');
  let target = 0;

  for (let i = 1; i < parts.length; i += 1) {
    if (parts[i].length > parts[target].length) {
      target = i;
    }
  }

  const word = parts[target];

  if (word.length < 4) {
    return value;
  }

  parts[target] = `${word.slice(0, 2)}${word[3]}${word[2]}${word.slice(4)}`;

  return parts.join(' ');
}

/**
 * The probes Phase 2's "a misspelled author name returns the right book" exit
 * condition is scored against, committed alongside the data they refer to
 * rather than invented later against whatever happened to be in the catalogue.
 *
 * Authors with a single entry in the catalogue are preferred: a probe naming an
 * author with six titles has no single right answer.
 */
function buildProbes(books: FixtureBook[]): SearchProbe[] {
  const byAuthor = new Map<string, FixtureBook[]>();

  for (const book of [...books].sort((a, b) => a.isbn13.localeCompare(b.isbn13))) {
    const entries = byAuthor.get(book.author) ?? [];
    entries.push(book);
    byAuthor.set(book.author, entries);
  }

  const authors = [...byAuthor.entries()].sort(
    (a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]),
  );

  const accented: SearchProbe[] = [];
  const plain: SearchProbe[] = [];

  for (const [author, entries] of authors) {
    const isbn13 = entries[0].isbn13;

    if (NON_ASCII.test(author)) {
      const query = deaccent(author).toLowerCase();

      // An unaccented query against an accented name. This is the case pg_trgm
      // has to earn; a name whose deaccented form is unchanged is not one.
      if (query !== author.toLowerCase() && accented.length < 4) {
        accented.push({ query, isbn13 });
      }

      continue;
    }

    const query = transposeLongestWord(author).toLowerCase();

    if (query !== author.toLowerCase() && plain.length < 3) {
      plain.push({ query, isbn13 });
    }
  }

  if (accented.length < 3) {
    throw new Error(
      `Only ${String(accented.length)} catalogue authors carry a non-ASCII ` +
        'name, and at least 3 search probes must target one. Widen ' +
        'AUTHOR_QUERIES with more authors whose names have diacritics and ' +
        're-run — do not hand-edit a probe in, and do not accent a name that ' +
        'Open Library returned unaccented.',
    );
  }

  return [...accented, ...plain];
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'books.fixture.json',
);

function note(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  // Before a single request: the mix arithmetic has to hold for the catalogue
  // size this run is going to build, or there is no point retrieving it.
  stockPlan(TARGET_BOOKS);

  note(`Retrieving from Open Library as: ${USER_AGENT}`);

  const works: WorkRef[] = [];

  for (const author of AUTHOR_QUERIES) {
    const found = await searchWorks(author);
    note(`  search ${author}: ${String(found.length)} works`);
    works.push(...found);
  }

  const candidates: Candidate[] = [];
  const seenIsbn = new Set<string>();
  const seenTitle = new Set<string>();

  for (const work of works) {
    if (candidates.length >= TARGET_BOOKS) {
      break;
    }

    for (const candidate of await editionsOf(work)) {
      const titleKey = `${candidate.author}::${candidate.title.toLowerCase()}`;

      if (seenIsbn.has(candidate.isbn13) || seenTitle.has(titleKey)) {
        continue;
      }

      seenIsbn.add(candidate.isbn13);
      seenTitle.add(titleKey);
      candidates.push(candidate);

      if (candidates.length >= TARGET_BOOKS) {
        break;
      }
    }

    note(`  ${work.workKey} -> ${String(candidates.length)}/${String(TARGET_BOOKS)}`);
  }

  if (candidates.length < TARGET_BOOKS) {
    throw new Error(
      `Only ${String(candidates.length)} usable editions were retrieved, and ` +
        `${String(TARGET_BOOKS)} are required. WIDEN AUTHOR_QUERIES and ` +
        're-run. Do not loosen the format filter and do not top the ' +
        'catalogue up by hand: an entry that did not come from a retrieval ' +
        'has no ol_edition_key that means anything.',
    );
  }

  const books = applyMix(candidates);
  const probes = buildProbes(books);

  const fixture = {
    $fixture: {
      notice:
        'FIXTURE DATA — not a real bookshop catalogue. Bibliographic fields ' +
        '(isbn13, title, author, format, published_on, ol_edition_key) were ' +
        'retrieved from Open Library and are real. Everything commercial and ' +
        'physical (price_cents and the whole stock block) is INVENTED for ' +
        'demonstration: Riverside Books is a fictional store with no POS ' +
        'system to take a price or a shelf count from (docs/assumptions.md). ' +
        'Label this data as fixture data wherever it is displayed.',
      catalog_source: 'Open Library (https://openlibrary.org) — search.json and works/*/editions.json',
      catalog_license:
        'https://openlibrary.org/developers/licensing — "The Internet Archive ' +
        'does not assert any new copyright or other proprietary rights over ' +
        'any of the material in the Open Library database."',
      retrieved_at: new Date().toISOString(),
      generated_by: 'product-a-app/seed/fetch-open-library.ts',
      invented_fields: [
        'price_cents',
        'stock.shape',
        'stock.on_hand',
        'stock.reserved',
        'stock.counted_hours_ago',
      ],
      search_probes: probes,
    },
    books,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  note(
    `Wrote ${String(books.length)} entries to ${OUTPUT_PATH} ` +
      `(${String(books.filter((b) => b.stock !== null).length)} with stock, ` +
      `${String(probes.length)} search probes).`,
  );
}

main().catch((error: unknown) => {
  note(String(error instanceof Error ? error.stack ?? error.message : error));
  process.exitCode = 1;
});
