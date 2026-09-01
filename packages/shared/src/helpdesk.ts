// Shared contract for the in-app helpdesk. This is the stable shape consumed by
// the API (request parsing, state-transition guard) and the portal (filters,
// forms, queue/detail projections). The API-local Zod instance re-parses every
// `unknown` body at the controller boundary, but the constants, enums, and
// transitions here are the single source of truth.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enumerated values.
// ---------------------------------------------------------------------------

/** Coarse area of the school a requester needs help with. */
export const HELPDESK_CATEGORIES = [
  "admissions",
  "academics",
  "student_affairs",
  "it_portal",
  "other",
] as const;

/** How urgently the requester needs a response. */
export const HELPDESK_PRIORITIES = ["low", "normal", "high"] as const;

/** Ticket lifecycle. Transitions are governed by `HELPDESK_STATUS_TRANSITIONS`. */
export const HELPDESK_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_requester",
  "resolved",
] as const;

/**
 * Where the ticket is worked. `support` is the default and the only initial
 * value; only support staff may reclassify a ticket as `engineering`.
 */
export const HELPDESK_ROUTING_TYPES = ["support", "engineering"] as const;

export const HelpdeskCategory = z.enum(HELPDESK_CATEGORIES);
export const HelpdeskPriority = z.enum(HELPDESK_PRIORITIES);
export const HelpdeskStatus = z.enum(HELPDESK_STATUSES);
export const HelpdeskRoutingType = z.enum(HELPDESK_ROUTING_TYPES);

export type HelpdeskCategory = z.infer<typeof HelpdeskCategory>;
export type HelpdeskPriority = z.infer<typeof HelpdeskPriority>;
export type HelpdeskStatus = z.infer<typeof HelpdeskStatus>;
export type HelpdeskRoutingType = z.infer<typeof HelpdeskRoutingType>;

// ---------------------------------------------------------------------------
// Display labels.
// ---------------------------------------------------------------------------

/** Human labels keyed by enum so screens stay in sync when a value is added. */
export const HELP_DESK_CATEGORY_LABELS: Record<HelpdeskCategory, string> = {
  admissions: "Admissions",
  academics: "Academics",
  student_affairs: "Student Affairs",
  it_portal: "IT / Portal",
  other: "Other",
};

export const HELP_DESK_PRIORITY_LABELS: Record<HelpdeskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export const HELP_DESK_STATUS_LABELS: Record<HelpdeskStatus, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_requester: "Waiting on requester",
  resolved: "Resolved",
};

export const HELP_DESK_ROUTING_LABELS: Record<HelpdeskRoutingType, string> = {
  support: "Support",
  engineering: "Engineering",
};

// ---------------------------------------------------------------------------
// State machine.
// ---------------------------------------------------------------------------

/**
 * The only approved status transitions. Every other change must be rejected.
 * - A `new` ticket cannot move straight to `resolved`; staff must show work.
 * - A `resolved` ticket can only be reopened by transitioning to `in_progress`,
 *   never back to `new`.
 */
export const HELPDESK_STATUS_TRANSITIONS: Readonly<
  Record<HelpdeskStatus, readonly HelpdeskStatus[]>
> = {
  new: ["in_progress", "waiting_on_requester"],
  in_progress: ["waiting_on_requester", "resolved"],
  waiting_on_requester: ["in_progress", "resolved"],
  resolved: ["in_progress"],
};

/** True iff `current -> next` is in the approved transition map. */
export function isValidHelpdeskStatusTransition(
  current: HelpdeskStatus,
  next: HelpdeskStatus,
): boolean {
  if (current === next) return false;
  const allowed = HELPDESK_STATUS_TRANSITIONS[current];
  return allowed?.includes(next) ?? false;
}

// ---------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------

/** The body a requester submits to open a ticket. */
export const CreateHelpdeskTicketInput = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(1).max(8000),
  category: HelpdeskCategory,
  priority: HelpdeskPriority.default("normal"),
  /**
   * Optional linked student. The API ignores this for student sessions
   * (forced to their own `Student.id`) and validates it against
   * `GuardianStudent` for parent sessions.
   */
  studentId: z.string().min(1).optional(),
});

export type CreateHelpdeskTicketInput = z.infer<typeof CreateHelpdeskTicketInput>;

/**
 * Staff-side patch. Every field is optional; at least one must be set so a
 * blank update is a client error rather than a silent no-op. `assigneeId: null`
 * is the documented way to unassign a ticket.
 */
export const UpdateHelpdeskTicketInput = z
  .object({
    category: HelpdeskCategory.optional(),
    priority: HelpdeskPriority.optional(),
    status: HelpdeskStatus.optional(),
    routingType: HelpdeskRoutingType.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    /**
     * Optimistic concurrency token: the ticket `version` the staff member
     * saw when they opened the editor. The API compares this to the stored
     * version and returns 409 on a mismatch. Staff updates require this token.
     */
    baseRevision: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.category !== undefined ||
      value.priority !== undefined ||
      value.status !== undefined ||
      value.routingType !== undefined ||
      value.assigneeId !== undefined,
    { message: "At least one ticket field is required" },
  );

export type UpdateHelpdeskTicketInput = z.infer<typeof UpdateHelpdeskTicketInput>;

/** Body for a new conversation entry. `isInternal` is staff-only and never returned to requesters. */
export const CreateHelpdeskCommentInput = z.object({
  body: z.string().trim().min(1).max(8000),
  isInternal: z.boolean().default(false),
});

export type CreateHelpdeskCommentInput = z.infer<typeof CreateHelpdeskCommentInput>;

// ---------------------------------------------------------------------------
// Read-model projections used by the portal and any staff screens.
// ---------------------------------------------------------------------------

/** What every authenticated user can see of their own ticket at a glance. */
export interface HelpdeskTicketSummary {
  id: string;
  title: string;
  category: HelpdeskCategory;
  priority: HelpdeskPriority;
  status: HelpdeskStatus;
  routingType: HelpdeskRoutingType;
  createdAt: string;
  updatedAt: string;
}

/** A row in the shared staff queue. Adds requester, optional student/assignee, and resolution timestamp. */
export interface HelpdeskQueueItem extends HelpdeskTicketSummary {
  requesterId: string;
  studentId?: string;
  assigneeId?: string;
  resolvedAt?: string;
}

/** Public-facing attachment metadata exposed alongside a ticket. */
export interface HelpdeskAttachmentSummary {
  id: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

/** Public-facing comment shown to requesters (i.e. internal notes filtered out). */
export interface HelpdeskCommentSummary {
  id: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

/** The full ticket shape used by detail screens, staff or requester. */
export interface HelpdeskTicketDetail extends HelpdeskQueueItem {
  description: string;
  comments: HelpdeskCommentSummary[];
  attachments: HelpdeskAttachmentSummary[];
  /** Optimistic concurrency token — send as `baseRevision` on PATCH. */
  version: number;
  /** One of "pending", "linked", or "failed". */
  githubSyncState: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubSyncError?: string;
  githubSyncedAt?: string;
}