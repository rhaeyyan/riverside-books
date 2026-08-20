import { describe, expect, it, vi } from "vitest";

import { FactProtectionError, type FactRecord } from "./contracts";
import { findUnsupportedFacts, renderFactTemplate } from "./fact-protection";

const bookRecord: FactRecord = {
  id: "book-left-hand-of-darkness",
  recordType: "book",
  title: "The Left Hand of Darkness",
  author: "Ursula K. Le Guin",
  priceCents: 1899,
  eventDate: null,
  eventTime: null,
};

const eventRecord: FactRecord = {
  id: "event-nk-jemisin",
  recordType: "event",
  title: "An Evening with N. K. Jemisin",
  author: "N. K. Jemisin",
  priceCents: null,
  eventDate: "2026-09-12",
  eventTime: "19:00",
};

describe("renderFactTemplate", () => {
  it.each([
    {
      name: "replaces a repeated title exactly",
      template: "{title} — yes, {title}.",
      record: bookRecord,
      expected: "The Left Hand of Darkness — yes, The Left Hand of Darkness.",
    },
    {
      name: "preserves punctuation around book fact tokens",
      template: "Read {title}, by {author}; now {price}!",
      record: bookRecord,
      expected:
        "Read The Left Hand of Darkness, by Ursula K. Le Guin; now $18.99!",
    },
    {
      name: "renders the approved event date and time tokens",
      template: "{title}: {event_date}, {event_time}.",
      record: eventRecord,
      expected: "An Evening with N. K. Jemisin: 2026-09-12, 19:00.",
    },
  ])("$name", ({ template, record, expected }) => {
    expect(renderFactTemplate(template, record)).toBe(expected);
  });

  it.each([
    { priceCents: 0, expected: "$0.00" },
    { priceCents: 5, expected: "$0.05" },
    { priceCents: 1999, expected: "$19.99" },
    { priceCents: 123456, expected: "$1234.56" },
  ])(
    "formats $priceCents cents deterministically as $expected",
    ({ priceCents, expected }) => {
      const numberFormatSpy = vi
        .spyOn(Intl, "NumberFormat")
        .mockImplementation(() => {
          throw new Error("Intl.NumberFormat must not format protected facts");
        });
      const localeStringSpy = vi
        .spyOn(Number.prototype, "toLocaleString")
        .mockImplementation(() => {
          throw new Error("toLocaleString must not format protected facts");
        });

      try {
        expect(
          renderFactTemplate("{price}", { ...bookRecord, priceCents }),
        ).toBe(expected);
      } finally {
        numberFormatSpy.mockRestore();
        localeStringSpy.mockRestore();
      }
    },
  );

  it("omits null optional facts and normalizes their surrounding whitespace", () => {
    const record: FactRecord = {
      ...eventRecord,
      author: null,
      eventDate: null,
      eventTime: null,
    };

    expect(
      renderFactTemplate(
        "Meet {author} at Riverside. {event_date} {event_time}",
        record,
      ),
    ).toBe("Meet at Riverside.");
    expect(renderFactTemplate("{title} costs {price} today.", record)).toBe(
      "An Evening with N. K. Jemisin costs today.",
    );
  });

  it.each([
    "Try {genre} next.",
    "Try {Title} next.",
    "Try {{title}} next.",
    "Try {title next.",
    "Try title} next.",
    "Join us on {event-date}.",
  ])("rejects an unknown or malformed placeholder in %j", (template) => {
    let caught: unknown;

    try {
      renderFactTemplate(template, bookRecord);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FactProtectionError);
    if (!(caught instanceof FactProtectionError)) return;

    expect(caught.code).toBe("UNKNOWN_PLACEHOLDER");
  });
});

describe("findUnsupportedFacts", () => {
  it("returns deterministic warnings for unsupported names, dates, times, and numbers", () => {
    expect(
      findUnsupportedFacts(
        "gather at Harbor Hall on 2027-01-02 at 20:30. Only 50 seats.",
        bookRecord,
      ),
    ).toEqual([
      'Unsupported proper name: "Harbor Hall"',
      'Unsupported date/time: "2027-01-02"',
      'Unsupported date/time: "20:30"',
      'Unsupported number: "50"',
    ]);
  });

  it.each([
    {
      name: "book facts",
      caption:
        "Read The Left Hand of Darkness by Ursula K. Le Guin for $18.99.",
      record: bookRecord,
    },
    {
      name: "event facts",
      caption: "An Evening with N. K. Jemisin is on 2026-09-12 at 19:00.",
      record: eventRecord,
    },
  ])("does not warn for supported $name", ({ caption, record }) => {
    expect(findUnsupportedFacts(caption, record)).toEqual([]);
  });
});
