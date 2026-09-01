// API-local Zod schemas for parsing `unknown` request bodies at the controller
// boundary. The shared module owns the canonical shapes (CreateHelpdeskTicketInput,
// UpdateHelpdeskTicketInput, CreateHelpdeskCommentInput, the transition map) and
// we re-parse through them here so ZodError becomes a 400 before reaching the
// service layer. Extra, API-only inputs (queue filters, attachment upload
// metadata) live below.
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import {
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  HelpdeskCategory,
  HelpdeskPriority,
  HelpdeskStatus,
  UpdateHelpdeskTicketInput,
} from "@mydaust/shared";

export {
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  UpdateHelpdeskTicketInput,
};

/** Image-only MIME types for helpdesk attachments (PDF is not allowed). */

/** Image-only MIME types for helpdesk attachments (PDF is not allowed). */
const HELPDESK_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export function validateHelpdeskImageMime(detected: string): boolean {
  return HELPDESK_IMAGE_MIME.has(detected);
}

/**
 * Attachment upload — the multipart `data` JSON alongside the file part.
 * Multipart clients typically send `data` as a single JSON-encoded string
 * (this is what `form.append("data", JSON.stringify({…}))` produces after the
 * boundary parser strips the surrounding MIME headers). The portal client does
 * that. We also accept an already-parsed object in case a caller POSTs the
 * body as form-urlencoded with structured fields, so the controller never has
 * to leak a parse error to the wire — we re-decode and surface 400 ourselves
 * for malformed JSON.
 */
const RawHelpdeskAttachmentData = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
]);

export const CreateHelpdeskAttachmentInput = z
  .preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      throw new BadRequestException("Attachment metadata must be valid JSON");
    }
  }, RawHelpdeskAttachmentData)
  .pipe(
    z.object({
      ticketId: z.string().trim().min(1).max(64),
      /** Optional original filename override; falls back to the multer originalname. */
      name: z.string().trim().min(1).max(200).optional(),
    }),
  );

export type CreateHelpdeskAttachmentInput = z.infer<
  typeof CreateHelpdeskAttachmentInput
>;

/** Staff queue filter — every field is optional. */
export const HelpdeskQueueFilter = z.object({
  status: HelpdeskStatus.optional(),
  category: HelpdeskCategory.optional(),
  priority: HelpdeskPriority.optional(),
  routingType: z.enum(["support", "engineering"]).optional(),
  assigneeId: z.string().trim().min(1).max(64).optional(),
  /** Restrict to tickets the caller has personally picked up. */
  mineOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  /** Free-text search applied to title + description. */
  q: z.string().trim().min(1).max(120).optional(),
});

export type HelpdeskQueueFilter = z.infer<typeof HelpdeskQueueFilter>;

/** Path parameter validator for `:id` (ticket or attachment). */
export const IdParam = z.object({ id: z.string().trim().min(1).max(64) });
