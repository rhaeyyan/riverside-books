/** Identifies the shared record shape whose protected facts may be rendered. */
export type RecordType = "book" | "event";

/**
 * Carries the trusted, structured facts that content generation is allowed to
 * reference, keeping database access outside the model boundary.
 */
export interface FactRecord {
  id: string;
  recordType: RecordType;
  title: string;
  author: string | null;
  priceCents: number | null;
  eventDate: string | null;
  eventTime: string | null;
}

/** Identifies a deterministic fact-protection validation failure. */
export type FactProtectionErrorCode = "UNKNOWN_PLACEHOLDER";

/** Reports an invalid template before unsupported content reaches the UI. */
export class FactProtectionError extends Error {
  readonly code: FactProtectionErrorCode;

  /**
   * Creates a fact-protection error with a stable machine-readable code.
   *
   * @param code - Stable category used by callers to handle the failure.
   * @param message - Human-readable explanation of the invalid template.
   */
  constructor(code: FactProtectionErrorCode, message: string) {
    super(message);
    this.name = "FactProtectionError";
    this.code = code;
  }
}

/** Selects the channel-specific deterministic content template set. */
export type Channel = "instagram" | "facebook";

/** Bundles one trusted record with the staff-selected destination channel. */
export interface GenerationRequest {
  record: FactRecord;
  channel: Channel;
}

/**
 * Represents one review-ready idea together with its protected caption source
 * and any deterministic fact warnings.
 */
export interface GeneratedVariant {
  captionTemplate: string;
  caption: string;
  postIdea: string;
  warnings: string[];
}

/** Defines the provider boundary used to stream grounded content variants. */
export interface ContentGenerator {
  /**
   * Generates review-ready variants without granting the provider direct data
   * access.
   *
   * @param request - Trusted record and channel selected by staff.
   * @returns An asynchronous stream of grounded content variants.
   */
  generate(request: GenerationRequest): AsyncIterable<GeneratedVariant>;
}
