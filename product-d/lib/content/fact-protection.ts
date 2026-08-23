import { FactProtectionError, type FactRecord } from "./contracts";

const APPROVED_PLACEHOLDERS = [
  "{title}",
  "{author}",
  "{price}",
  "{event_date}",
  "{event_time}",
] as const;

type ApprovedPlaceholder = (typeof APPROVED_PLACEHOLDERS)[number];

const approvedPlaceholderSet = new Set<string>(APPROVED_PLACEHOLDERS);
const bracedPlaceholderPattern = /\{[^{}]*\}/g;
const datePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
const timePattern = /\b\d{1,2}:\d{2}\b/g;
const numberPattern = /\b\d+(?:\.\d+)?\b/g;
const properNamePattern = /\b[A-Z][A-Za-z'’.\-]*(?:\s+[A-Z][A-Za-z'’.\-]*)*/g;
const knownNonNameSentenceStarters = new Set([
  "A",
  "Ask",
  "Bring",
  "Find",
  "For",
  "Looking",
  "Meet",
  "Only",
  "Our",
  "Read",
  "Readers",
  "This",
]);

interface MatchRange {
  value: string;
  start: number;
  end: number;
}

function unknownPlaceholder(value: string): FactProtectionError {
  return new FactProtectionError(
    "UNKNOWN_PLACEHOLDER",
    `Unknown or malformed placeholder: ${value}`,
  );
}

function validatePlaceholders(template: string): void {
  const placeholders = template.match(bracedPlaceholderPattern) ?? [];

  for (const placeholder of placeholders) {
    if (!approvedPlaceholderSet.has(placeholder)) {
      throw unknownPlaceholder(placeholder);
    }
  }

  const remainingText = template.replace(bracedPlaceholderPattern, "");
  if (remainingText.includes("{") || remainingText.includes("}")) {
    throw unknownPlaceholder(template);
  }
}

function formatCents(priceCents: number): string {
  const dollars = Math.floor(priceCents / 100);
  const cents = String(priceCents % 100).padStart(2, "0");

  return `$${dollars}.${cents}`;
}

function placeholderValues(
  record: FactRecord,
): Record<ApprovedPlaceholder, string> {
  return {
    "{title}": record.title,
    "{author}": record.author ?? "",
    "{price}": record.priceCents === null ? "" : formatCents(record.priceCents),
    "{event_date}": record.eventDate ?? "",
    "{event_time}": record.eventTime ?? "",
  };
}

export function renderFactTemplate(
  template: string,
  record: FactRecord,
): string {
  validatePlaceholders(template);
  const values = placeholderValues(record);
  const rendered = template.replace(
    bracedPlaceholderPattern,
    (placeholder) => values[placeholder as ApprovedPlaceholder],
  );

  return rendered.replace(/\s+/g, " ").trim();
}

function collectMatches(text: string, pattern: RegExp): MatchRange[] {
  return Array.from(text.matchAll(pattern), (match) => {
    const start = match.index ?? 0;

    return {
      value: match[0],
      start,
      end: start + match[0].length,
    };
  });
}

function recordValues(record: FactRecord): string[] {
  return [
    record.title,
    record.author,
    record.priceCents === null ? null : formatCents(record.priceCents),
    record.eventDate,
    record.eventTime,
  ].filter((value): value is string => value !== null && value.length > 0);
}

function supportedRanges(caption: string, record: FactRecord): MatchRange[] {
  const ranges: MatchRange[] = [];

  for (const value of recordValues(record)) {
    let start = caption.indexOf(value);

    while (start !== -1) {
      ranges.push({ value, start, end: start + value.length });
      start = caption.indexOf(value, start + value.length);
    }
  }

  return ranges;
}

function overlaps(candidate: MatchRange, ranges: MatchRange[]): boolean {
  return ranges.some(
    (range) => candidate.start < range.end && candidate.end > range.start,
  );
}

function isKnownSentenceStarter(
  caption: string,
  candidate: MatchRange,
): boolean {
  if (!knownNonNameSentenceStarters.has(candidate.value)) return false;

  const prefix = caption.slice(0, candidate.start).trimEnd();
  return prefix.length === 0 || /[.!?]$/.test(prefix);
}

function pushUnique(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

export function findUnsupportedFacts(
  caption: string,
  record: FactRecord,
): string[] {
  const warnings: string[] = [];
  const supported = supportedRanges(caption, record);
  const dates = collectMatches(caption, datePattern);
  const times = collectMatches(caption, timePattern);
  const dateAndTimeRanges = [...dates, ...times];

  for (const candidate of collectMatches(caption, properNamePattern)) {
    if (
      overlaps(candidate, supported) ||
      isKnownSentenceStarter(caption, candidate)
    ) {
      continue;
    }

    pushUnique(warnings, `Unsupported proper name: "${candidate.value}"`);
  }

  for (const candidate of dateAndTimeRanges.sort(
    (left, right) => left.start - right.start,
  )) {
    if (overlaps(candidate, supported)) continue;

    pushUnique(warnings, `Unsupported date/time: "${candidate.value}"`);
  }

  for (const candidate of collectMatches(caption, numberPattern)) {
    if (
      overlaps(candidate, supported) ||
      overlaps(candidate, dateAndTimeRanges)
    ) {
      continue;
    }

    pushUnique(warnings, `Unsupported number: "${candidate.value}"`);
  }

  return warnings;
}
