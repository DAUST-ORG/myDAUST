// GitHub sync service for helpdesk tickets.
//
// Only tickets routed as `engineering` are mirrored. The upstream tracker is a
// real GitHub repo configured by HELPDESK_GITHUB_REPO + HELPDESK_GITHUB_TOKEN
// — when either is missing the service stays disabled, the ticket keeps its
// `pending` state, and staff see a "GitHub sync not configured" message in the
// audit trail.
//
// Calls are best-effort. A 4xx/5xx or network failure sets the ticket to
// `failed` with the upstream error text and writes an audit row; nothing
// downstream (notifications, attachments, audit) ever depends on the network
// being up. Idempotency: a sync request for a ticket that is already `linked`
// is a no-op that returns the existing issue number/url — there is no GitHub
// "update issue" path here because the ticket detail is the source of truth.

import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env.js";
import { HELP_DESK_GITHUB_LABELS } from "./helpdesk.constants.js";

export interface HelpdeskTicketForSync {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  routingType: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubSyncState: string;
  githubSyncError: string | null;
}

export interface HelpdeskGithubSyncResult {
  state: "pending" | "linked" | "failed";
  issueNumber: number | null;
  issueUrl: string | null;
  syncedAt: Date | null;
  error: string | null;
  /** True when no token/repo is configured; the caller should NOT mark the
   *  ticket as failed in this case — it stays `pending`. */
  disabled: boolean;
}

interface GithubCreateIssueResponse {
  number?: number;
  html_url?: string;
  message?: string;
}

@Injectable()
export class HelpdeskGithubSync {
  private readonly logger = new Logger(HelpdeskGithubSync.name);
  private readonly env = loadEnv();

  isConfigured(): boolean {
    return Boolean(this.env.HELPDESK_GITHUB_REPO && this.env.HELPDESK_GITHUB_TOKEN);
  }

  /** Build the JSON body sent to GitHub. Exposed for the unit tests. */
  buildIssueBody(ticket: HelpdeskTicketForSync): {
    title: string;
    body: string;
    labels: readonly string[];
  } {
    return {
      title: `[helpdesk] ${ticket.title}`,
      body: [
        `Mirror of in-app helpdesk ticket \`${ticket.id}\`.`,
        "",
        `**Category:** ${ticket.category}`,
        `**Priority:** ${ticket.priority}`,
        "",
        "---",
        "",
        ticket.description,
      ].join("\n"),
      labels: [...HELP_DESK_GITHUB_LABELS, ticket.category],
    };
  }

  /**
   * Sync a ticket to the upstream engineering tracker. Returns the result
   * without persisting — the caller is the helpdesk service and is responsible
   * for the DB write and the audit row.
   */
  async sync(
    ticket: HelpdeskTicketForSync,
    fetchImpl: typeof fetch = fetch,
  ): Promise<HelpdeskGithubSyncResult> {
    if (ticket.routingType !== "engineering") {
      // Anything not routed to engineering stays in whatever state it was in;
      // the caller will leave `githubSyncState` alone.
      return {
        state: (ticket.githubSyncState as "pending" | "linked" | "failed") ?? "pending",
        issueNumber: ticket.githubIssueNumber,
        issueUrl: ticket.githubIssueUrl,
        syncedAt: null,
        error: null,
        disabled: false,
      };
    }

    if (!this.isConfigured()) {
      return {
        state: "pending",
        issueNumber: null,
        issueUrl: null,
        syncedAt: null,
        error: null,
        disabled: true,
      };
    }

    // Idempotency: already linked, don't create a second issue.
    if (ticket.githubSyncState === "linked" && ticket.githubIssueNumber) {
      return {
        state: "linked",
        issueNumber: ticket.githubIssueNumber,
        issueUrl: ticket.githubIssueUrl,
        syncedAt: null,
        error: null,
        disabled: false,
      };
    }

    const repo = this.env.HELPDESK_GITHUB_REPO;
    const token = this.env.HELPDESK_GITHUB_TOKEN;
    const payload = this.buildIssueBody(ticket);

    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${repo}/issues`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "mydaust-helpdesk",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify(payload),
        },
      );
      const json = (await response.json().catch(() => ({}))) as GithubCreateIssueResponse;
      if (!response.ok) {
        const message =
          typeof json.message === "string"
            ? json.message
            : `GitHub returned ${response.status}`;
        this.logger.warn(
          `GitHub sync failed for helpdesk ticket ${ticket.id}: ${message}`,
        );
        return {
          state: "failed",
          issueNumber: null,
          issueUrl: null,
          syncedAt: null,
          error: message.slice(0, 500),
          disabled: false,
        };
      }
      const number = typeof json.number === "number" ? json.number : null;
      const url = typeof json.html_url === "string" ? json.html_url : null;
      if (number === null || url === null) {
        return {
          state: "failed",
          issueNumber: null,
          issueUrl: null,
          syncedAt: null,
          error: "GitHub response did not include issue number/url",
          disabled: false,
        };
      }
      return {
        state: "linked",
        issueNumber: number,
        issueUrl: url,
        syncedAt: new Date(),
        error: null,
        disabled: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `GitHub sync network error for helpdesk ticket ${ticket.id}: ${message}`,
      );
      return {
        state: "failed",
        issueNumber: null,
        issueUrl: null,
        syncedAt: null,
        error: message.slice(0, 500),
        disabled: false,
      };
    }
  }
}
