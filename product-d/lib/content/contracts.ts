export type RecordType = "book" | "event";

export interface FactRecord {
  id: string;
  recordType: RecordType;
  title: string;
  author: string | null;
  priceCents: number | null;
  eventDate: string | null;
  eventTime: string | null;
}

export type FactProtectionErrorCode = "UNKNOWN_PLACEHOLDER";

export class FactProtectionError extends Error {
  readonly code: FactProtectionErrorCode;

  constructor(code: FactProtectionErrorCode, message: string) {
    super(message);
    this.name = "FactProtectionError";
    this.code = code;
  }
}

export type Channel = "instagram" | "facebook";

export interface GenerationRequest {
  record: FactRecord;
  channel: Channel;
}

export interface GeneratedVariant {
  captionTemplate: string;
  caption: string;
  postIdea: string;
  warnings: string[];
}

export interface ContentGenerator {
  generate(request: GenerationRequest): AsyncIterable<GeneratedVariant>;
}
