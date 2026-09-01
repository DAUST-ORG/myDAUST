// Helpdesk module — role lists and audit/action constants.
//
// The queue is intentionally narrow: the five roles that own student-facing
// requests. The IT backlog (it_portal) is part of the supported categories, but
// routing into it_admin is still a queue decision, not a separate workflow.

import type { AppRole } from "@mydaust/shared";

/** Roles permitted to read and triage the shared staff queue. */
export const HELPDESK_QUEUE_ROLES = [
  "registrar",
  "admissions",
  "dining",
  "it_admin",
  "admin",
] as const satisfies readonly AppRole[];

/** Roles that may mutate ticket state (assign, transition, comment). */
export const HELPDESK_STAFF_ROLES = [
  ...HELPDESK_QUEUE_ROLES,
] as const satisfies readonly AppRole[];

/** Roles that may reclassify a ticket from `support` to `engineering`. */
export const HELPDESK_ROUTING_RECLASSIFY_ROLES = [
  "registrar",
  "it_admin",
  "admin",
] as const satisfies readonly AppRole[];

/** Audit-log entity names so the strings are not duplicated. */
export const HELP_DESK_TICKET_ENTITY = "HelpdeskTicket" as const;
export const HELP_DESK_COMMENT_ENTITY = "HelpdeskComment" as const;
export const HELP_DESK_ATTACHMENT_ENTITY = "HelpdeskAttachment" as const;

export const HELP_DESK_TICKET_ACTIONS = {
  created: "helpdesk-ticket-created",
  updated: "helpdesk-ticket-updated",
  statusTransitioned: "helpdesk-ticket-status-changed",
  assigned: "helpdesk-ticket-assigned",
  unassigned: "helpdesk-ticket-unassigned",
  routed: "helpdesk-ticket-routed",
  githubSyncStarted: "helpdesk-ticket-github-sync-started",
  githubSyncSucceeded: "helpdesk-ticket-github-sync-succeeded",
  githubSyncFailed: "helpdesk-ticket-github-sync-failed",
} as const;

export const HELP_DESK_COMMENT_ACTIONS = {
  created: "helpdesk-comment-created",
  internal: "helpdesk-comment-internal",
} as const;

export const HELP_DESK_ATTACHMENT_ACTIONS = {
  uploaded: "helpdesk-attachment-uploaded",
  streamed: "helpdesk-attachment-streamed",
} as const;

/** GitHub issue labels applied on create; keep the existing backlog label. */
export const HELP_DESK_GITHUB_LABELS = [
  "it-backlog",
  "helpdesk",
  "in-app",
] as const;
