import { describe, expect, it, vi } from "vitest";

import type {
  Channel,
  FactRecord,
  GeneratedVariant,
  GenerationRequest,
} from "./contracts";
import { fixtureBook } from "./book.fixture";
import { FixtureContentGenerator } from "./fixture-generator";

async function collectVariants(
  generator: FixtureContentGenerator,
  request: GenerationRequest,
): Promise<GeneratedVariant[]> {
  const variants: GeneratedVariant[] = [];

  for await (const variant of generator.generate(request)) {
    variants.push(variant);
  }

  return variants;
}

function fixturePrice(record: FactRecord): string {
  if (record.priceCents === null) {
    throw new Error("The Phase 0 fixture book must include a price");
  }

  const dollars = Math.floor(record.priceCents / 100);
  const cents = String(record.priceCents % 100).padStart(2, "0");

  return `$${dollars}.${cents}`;
}

function expectVariantContract(variant: GeneratedVariant): void {
  expect(variant).toEqual({
    captionTemplate: expect.any(String),
    caption: expect.any(String),
    postIdea: expect.any(String),
    warnings: expect.any(Array),
  });
  expect(variant.captionTemplate).not.toHaveLength(0);
  expect(variant.caption).not.toHaveLength(0);
  expect(variant.postIdea).not.toHaveLength(0);
  expect(variant.warnings.every((warning) => typeof warning === "string")).toBe(
    true,
  );
}

describe("FixtureContentGenerator", () => {
  it.each<Channel>(["instagram", "facebook"])(
    "returns exactly three grounded %s variants",
    async (channel) => {
      const variants = await collectVariants(new FixtureContentGenerator(), {
        record: fixtureBook,
        channel,
      });
      const expectedPrice = fixturePrice(fixtureBook);
      const expectedAuthor = fixtureBook.author;

      if (expectedAuthor === null) {
        throw new Error("The Phase 0 fixture book must include an author");
      }

      expect(variants).toHaveLength(3);

      for (const variant of variants) {
        expectVariantContract(variant);
        expect(variant.captionTemplate).toContain("{title}");
        expect(variant.captionTemplate).toContain("{author}");
        expect(variant.captionTemplate).toContain("{price}");
        expect(variant.captionTemplate).not.toContain(fixtureBook.title);
        expect(variant.captionTemplate).not.toContain(expectedAuthor);
        expect(variant.captionTemplate).not.toContain(expectedPrice);
        expect(variant.caption).toContain(fixtureBook.title);
        expect(variant.caption).toContain(expectedAuthor);
        expect(variant.caption).toContain(expectedPrice);
        expect(variant.warnings).toEqual([]);
      }
    },
  );

  it.each<Channel>(["instagram", "facebook"])(
    "is deeply deterministic for repeated %s requests",
    async (channel) => {
      const generator = new FixtureContentGenerator();
      const request: GenerationRequest = { record: fixtureBook, channel };

      const first = await collectVariants(generator, request);
      const second = await collectVariants(generator, request);

      expect(second).toEqual(first);
    },
  );

  it("makes every variant distinct and changes substantive content by channel", async () => {
    const generator = new FixtureContentGenerator();
    const instagram = await collectVariants(generator, {
      record: fixtureBook,
      channel: "instagram",
    });
    const facebook = await collectVariants(generator, {
      record: fixtureBook,
      channel: "facebook",
    });

    for (const variants of [instagram, facebook]) {
      expect(
        new Set(variants.map(({ captionTemplate }) => captionTemplate)).size,
      ).toBe(3);
      expect(new Set(variants.map(({ caption }) => caption)).size).toBe(3);
      expect(new Set(variants.map(({ postIdea }) => postIdea)).size).toBe(3);
    }

    expect(
      new Set([
        ...instagram.map(({ captionTemplate }) => captionTemplate),
        ...facebook.map(({ captionTemplate }) => captionTemplate),
      ]).size,
    ).toBe(6);
    expect(
      new Set([
        ...instagram.map(({ postIdea }) => postIdea),
        ...facebook.map(({ postIdea }) => postIdea),
      ]).size,
    ).toBe(6);
    expect(instagram.map(({ caption }) => caption)).not.toEqual(
      facebook.map(({ caption }) => caption),
    );
  });

  it.each<Channel>(["instagram", "facebook"])(
    "keeps every %s variant warm and community-minded without hype or hashtags",
    async (channel) => {
      const variants = await collectVariants(new FixtureContentGenerator(), {
        record: fixtureBook,
        channel,
      });
      const communityVoice =
        /\b(Riverside|community|local|neighbors|readers|booksellers|shelves|conversation|together)\b/i;
      const hypeOrUrgency =
        /\b(buy now|act now|hurry|limited time|must-have|game-changing|unbeatable|don['’]t miss out)\b/i;

      for (const variant of variants) {
        const content = `${variant.captionTemplate} ${variant.caption} ${variant.postIdea}`;

        expect(content).toMatch(communityVoice);
        expect(content).not.toMatch(hypeOrUrgency);
        expect(content).not.toContain("#");
      }
    },
  );

  it("does not mutate a frozen input record", async () => {
    const frozenRecord = Object.freeze({ ...fixtureBook });
    const before = { ...frozenRecord };

    await expect(
      collectVariants(new FixtureContentGenerator(), {
        record: frozenRecord,
        channel: "instagram",
      }),
    ).resolves.toHaveLength(3);
    expect(frozenRecord).toEqual(before);
  });

  it("fails clearly when a runtime caller bypasses the channel type", async () => {
    const invalidRequest = {
      record: fixtureBook,
      channel: "tiktok",
    } as unknown as GenerationRequest;

    await expect(
      collectVariants(new FixtureContentGenerator(), invalidRequest),
    ).rejects.toThrow('Unsupported channel: "tiktok"');
  });

  it("never calls fetch while generating fixture variants", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Fixture generation must not call the network");
    });

    try {
      const generator = new FixtureContentGenerator();

      await collectVariants(generator, {
        record: fixtureBook,
        channel: "instagram",
      });
      await collectVariants(generator, {
        record: fixtureBook,
        channel: "facebook",
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
