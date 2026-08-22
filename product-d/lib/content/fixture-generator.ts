import type {
  Channel,
  ContentGenerator,
  GeneratedVariant,
  GenerationRequest,
} from "./contracts";
import { findUnsupportedFacts, renderFactTemplate } from "./fact-protection";

interface FixtureTemplate {
  captionTemplate: string;
  postIdea: string;
}

const templatesByChannel = {
  instagram: [
    {
      captionTemplate:
        "A book for the shelves and the conversation: {title} by {author}, available for {price}.",
      postIdea:
        "Photograph the cover beside a warm reading chair with a small stack of staff picks.",
    },
    {
      captionTemplate:
        "Meet your next local read: {title} by {author}. Find it on our shelves for {price}.",
      postIdea:
        "Use a close shelf detail with the book pulled slightly forward and natural window light.",
    },
    {
      captionTemplate:
        "For readers who love a thoughtful conversation: {title} by {author}, {price}.",
      postIdea:
        "Pair the cover with a handwritten bookseller note naming a favorite reading mood.",
    },
  ],
  facebook: [
    {
      captionTemplate:
        "Our local shelves have a story worth sharing: {title} by {author}. This thoughtful read is available for {price}, ready for the next community conversation.",
      postIdea:
        "Share a welcoming shelf photo and invite local readers to mention what draws them to the book.",
    },
    {
      captionTemplate:
        "Looking for a book to discuss with neighbors? {title} by {author} is on our shelves for {price}. Ask a bookseller what makes it a rewarding read.",
      postIdea:
        "Show the book at the front counter beside a short staff recommendation card.",
    },
    {
      captionTemplate:
        "Readers gathering around a memorable book can start with {title} by {author}, available for {price}. Bring it into your next conversation together.",
      postIdea:
        "Photograph a small reading-group setup with the book centered among several chairs.",
    },
  ],
} as const satisfies Record<Channel, readonly FixtureTemplate[]>;

function templatesFor(channel: Channel): readonly FixtureTemplate[] {
  if (channel === "instagram" || channel === "facebook") {
    return templatesByChannel[channel];
  }

  throw new Error(`Unsupported channel: "${String(channel)}"`);
}

export class FixtureContentGenerator implements ContentGenerator {
  async *generate(request: GenerationRequest): AsyncIterable<GeneratedVariant> {
    for (const template of templatesFor(request.channel)) {
      const caption = renderFactTemplate(
        template.captionTemplate,
        request.record,
      );

      yield {
        captionTemplate: template.captionTemplate,
        caption,
        postIdea: template.postIdea,
        warnings: findUnsupportedFacts(caption, request.record),
      };
    }
  }
}
