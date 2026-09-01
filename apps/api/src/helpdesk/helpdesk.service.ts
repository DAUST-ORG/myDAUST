// Helpdesk service — the campus in-app support workflow.
//
// Authorization model:
//   - Students may only see their own tickets and are forced to their own
//     Student.id when creating one.
//   - Parents may only act on tickets that are linked to one of their
//     GuardianStudent children.
//   - Staff (HELPDESK_STAFF_ROLES) may read the queue, comment on any ticket,
//     and edit ticket state.
//   - Internal notes are staff-only — never returned to requesters.
//   - Optimistic concurrency on PATCH /tickets/:id: the staff member sends
//     baseRevision; a stale value returns 409 with the current version.
//
// Notification semantics:
//   - Creating a ticket notifies staff; notifications are best-effort and a
//     failed notification cannot roll back the write.
//   - Reassigning and transitioning status notifies the requester.
//
// GitHub sync:
//   - Mirroring only runs for `engineering`-routed tickets and only when the
//     env configures HELPDESK_GITHUB_REPO + HELPDESK_GITHUB_TOKEN. The sync is
//     triggered explicitly by POST /tickets/:id/github-sync (so staff can
//     re-try a failed sync), and also fires implicitly on a routing change to
//     `engineering`. Disabled, linked, and failed states are explicit.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  type HelpdeskAttachmentSummary,
  type HelpdeskCategory,
  type HelpdeskCommentSummary,
  type HelpdeskPriority,
  type HelpdeskQueueItem,
  type HelpdeskRoutingType,
  type HelpdeskStatus,
  type HelpdeskTicketDetail,
  type HelpdeskTicketSummary,
  type UpdateHelpdeskTicketInput,
  isValidHelpdeskStatusTransition,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { MailDelivery } from "../notifications/mail-delivery.js";
import {
  resolveRecipients,
  type NotificationRecipient,
} from "../notifications/recipient-resolver.js";
import { loadEnv } from "../config/env.js";
import {
  UploadsStorage,
  detectedUploadMime,
  isInlineSafe,
} from "../uploads/uploads.storage.js";
import {
  HELP_DESK_ATTACHMENT_ACTIONS,
  HELP_DESK_COMMENT_ACTIONS,
  HELP_DESK_TICKET_ACTIONS,
  HELP_DESK_ATTACHMENT_ENTITY,
  HELP_DESK_COMMENT_ENTITY,
  HELP_DESK_TICKET_ENTITY,
  HELPDESK_QUEUE_ROLES,
  HELPDESK_ROUTING_RECLASSIFY_ROLES,
  HELPDESK_STAFF_ROLES,
} from "./helpdesk.constants.js";
import { HelpdeskGithubSync } from "./helpdesk.github.js";
import type { HelpdeskQueueFilter } from "./helpdesk.schemas.js";
import { validateHelpdeskImageMime } from "./helpdesk.schemas.js";

interface PrismaLike {
  helpdeskTicket: {
    findUnique: (args: unknown) => Promise<TicketRow | null>;
    findMany: (args: unknown) => Promise<TicketRow[]>;
    findFirst: (args: unknown) => Promise<TicketRow | null>;
    create: (args: unknown) => Promise<TicketRow>;
    update: (args: unknown) => Promise<TicketRow>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    count: (args: unknown) => Promise<number>;
  };
  helpdeskComment: {
    create: (args: unknown) => Promise<CommentRow>;
    findMany: (args: unknown) => Promise<CommentRow[]>;
  };
  helpdeskAttachment: {
    create: (args: unknown) => Promise<AttachmentRow>;
    findUnique: (args: unknown) => Promise<AttachmentRow | null>;
  };
  guardianStudent: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  };
  person: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      roles: string[];
      student: { id: string } | null;
    } | null>;
  };
  auditLog: { create: (args: unknown) => Promise<unknown> };
  $transaction: <T>(work: (tx: PrismaLike) => Promise<T>) => Promise<T>;
}

interface TicketRow {
  id: string;
  requesterId: string;
  studentId: string | null;
  assigneeId: string | null;
  title: string;
  description: string;
  category: HelpdeskCategory;
  priority: HelpdeskPriority;
  status: HelpdeskStatus;
  routingType: HelpdeskRoutingType;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubSyncState: string;
  githubSyncError: string | null;
  githubSyncedAt: Date | null;
  resolvedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CommentRow {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

interface AttachmentRow {
  id: string;
  ticketId: string;
  uploaderId: string;
  url: string;
  /**
   * Private storage key (S3 key or local path under `helpdesk/`). Bytes are
   * never served from the public `/uploads/:filename` route — read only
   * via `UploadsStorage.getHelpdeskImage` after ticket ownership has been
   * verified against `ticketId`. Older rows (pre-migration) may carry an
   * empty string here, in which case the read path 404s.
   */
  storageKey: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: Date;
}

@Injectable()
export class HelpdeskService {
  private readonly env = loadEnv();
  private readonly logger = new Logger(HelpdeskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: UploadsStorage,
    private readonly github: HelpdeskGithubSync,
    private readonly notifications: NotificationsService,
    @Optional() private readonly mail?: MailDelivery,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads.
  // ---------------------------------------------------------------------------

  /** List the requester's own tickets (newest first). Students + parents only. */
  async listMine(user: AuthUser): Promise<HelpdeskTicketSummary[]> {
    const owned = await this.prisma.helpdeskTicket.findMany({
      where: this.requesterScope(user),
      orderBy: { updatedAt: "desc" },
    });
    return owned.map(toSummary);
  }

  /**
   * Single ticket detail with comments and attachments. Requesters see only
   * public comments; staff see internal notes too. Returns null on 404 so the
   * controller can throw NotFoundException with a stable message.
   */
  async getTicket(
    user: AuthUser,
    id: string,
  ): Promise<HelpdeskTicketDetail | null> {
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id },
      include: {
        comments: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return null;
    if (!(await this.canRead(user, ticket))) {
      throw new ForbiddenException("You cannot view this ticket");
    }
    const isStaff = HELPDESK_STAFF_ROLES.some((r) => user.roles.includes(r));
    return toDetail(ticket, isStaff);
  }

  /** Staff queue with filters. Caller must be a queue-role. */
  async listQueue(
    user: AuthUser,
    filter: HelpdeskQueueFilter,
  ): Promise<HelpdeskQueueItem[]> {
    if (!HELPDESK_QUEUE_ROLES.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException("Helpdesk queue is staff-only");
    }
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;
    if (filter.category) where.category = filter.category;
    if (filter.priority) where.priority = filter.priority;
    if (filter.routingType) where.routingType = filter.routingType;
    if (filter.assigneeId) where.assigneeId = filter.assigneeId;
    if (filter.mineOnly) where.assigneeId = user.personId;
    if (filter.q) {
      where.OR = [
        { title: { contains: filter.q, mode: "insensitive" } },
        { description: { contains: filter.q, mode: "insensitive" } },
      ];
    }
    const rows = await this.prisma.helpdeskTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });
    return rows.map(toQueueItem);
  }

  // ---------------------------------------------------------------------------
  // Writes.
  // ---------------------------------------------------------------------------

  /** Open a new ticket. Student/parent/staff all flow through here. */
  async createTicket(
    user: AuthUser,
    input: CreateHelpdeskTicketInput,
  ): Promise<HelpdeskTicketDetail> {
    const { studentId, linkGuardians } = await this.resolveStudentLink(user, input.studentId);

    // Ticket row + audit log are one atomic write — if the audit insert
    // fails the ticket does not exist, so we never end up with an
    // un-tracked helpdesk ticket.
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.helpdeskTicket.create({
        data: {
          requesterId: user.personId,
          studentId,
          title: input.title,
          description: input.description,
          category: input.category,
          priority: input.priority,
          status: "new",
          routingType: "support",
          githubSyncState: "pending",
          version: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: HELP_DESK_TICKET_ENTITY,
          entityId: created.id,
          action: HELP_DESK_TICKET_ACTIONS.created,
          actorId: user.personId,
          data: {
            category: created.category,
            priority: created.priority,
            studentId,
            linkedGuardians: linkGuardians,
          },
        },
      });
      return created;
    });

    void this.notifyStaffOnCreate(ticket);

    return this.detailForOwner(user, ticket);
  }

  /**
   * Add a conversation entry. `isInternal` is only honored when the author is
   * a staff member; a requester-supplied `isInternal: true` is silently coerced
   * to false and the audit row records the coercion.
   */
  async addComment(
    user: AuthUser,
    ticketId: string,
    input: CreateHelpdeskCommentInput,
  ): Promise<HelpdeskCommentSummary> {
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true, studentId: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (!(await this.canRead(user, ticket))) {
      throw new ForbiddenException("You cannot comment on this ticket");
    }
    const isStaff = HELPDESK_STAFF_ROLES.some((r) => user.roles.includes(r));
    const requestedInternal = input.isInternal === true;
    const isInternal = isStaff && requestedInternal;

    const created = await this.prisma.helpdeskComment.create({
      data: {
        ticketId,
        authorId: user.personId,
        body: input.body,
        isInternal,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: HELP_DESK_COMMENT_ENTITY,
        entityId: created.id,
        action: isInternal
          ? HELP_DESK_COMMENT_ACTIONS.internal
          : HELP_DESK_COMMENT_ACTIONS.created,
        actorId: user.personId,
        data: {
          ticketId,
          internalRequested: requestedInternal,
          internalHonored: isInternal,
        },
      },
    });

    void this.notifyOnComment({
      ticket,
      comment: created,
      isStaff,
      actorId: user.personId,
    });

    return {
      id: created.id,
      authorId: created.authorId,
      body: created.body,
      isInternal: created.isInternal,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Staff update — category / priority / status / routingType / assigneeId,
   * guarded by an optimistic `version` check and the status state machine.
   */
  async updateTicket(
    user: AuthUser,
    ticketId: string,
    input: UpdateHelpdeskTicketInput,
  ): Promise<HelpdeskTicketDetail> {
    if (!HELPDESK_STAFF_ROLES.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException("Staff role required to edit tickets");
    }

    const patch: Record<string, unknown> = {};
    if (input.category !== undefined) patch.category = input.category;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.routingType !== undefined) {
      if (
        input.routingType === "engineering" &&
        !HELPDESK_ROUTING_RECLASSIFY_ROLES.some((r) => user.roles.includes(r))
      ) {
        throw new ForbiddenException(
          "Only registrar, IT admin, or admin may route to engineering",
        );
      }
      patch.routingType = input.routingType;
    }
    if (input.assigneeId !== undefined) {
      patch.assigneeId = input.assigneeId;
    }

    let transitionApplied: { from: HelpdeskStatus; to: HelpdeskStatus } | null =
      null;
    let routingApplied: { from: HelpdeskRoutingType; to: HelpdeskRoutingType } | null =
      null;
    let assignmentApplied: { from: string | null; to: string | null } | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.helpdeskTicket.findUnique({
        where: { id: ticketId },
      });
      if (!current) throw new NotFoundException("Ticket not found");
      if (current.version !== input.baseRevision) {
        throw new ConflictException(
          `Ticket has been updated by someone else (expected version ${input.baseRevision}, found ${current.version})`,
        );
      }
      if (input.status !== undefined && input.status !== current.status) {
        if (
          !isValidHelpdeskStatusTransition(current.status, input.status)
        ) {
          throw new BadRequestException(
            `Status cannot move from ${current.status} to ${input.status}`,
          );
        }
        patch.status = input.status;
        transitionApplied = {
          from: current.status,
          to: input.status,
        } as { from: HelpdeskStatus; to: HelpdeskStatus };
        if (input.status === "resolved") {
          patch.resolvedAt = new Date();
        } else if (current.status === "resolved") {
          // Reopening clears the resolved marker.
          patch.resolvedAt = null;
        }
      }
      if (
        input.assigneeId !== undefined &&
        input.assigneeId !== null &&
        input.assigneeId !== current.assigneeId
      ) {
        const assignee = await tx.person.findUnique({
          where: { id: input.assigneeId },
          select: { id: true, roles: true },
        });
        if (!assignee) {
          throw new BadRequestException("Assignee is not a known person");
        }
        if (!HELPDESK_STAFF_ROLES.some((r) => assignee.roles.includes(r))) {
          throw new BadRequestException("Assignee is not a helpdesk role");
        }
        patch.assigneeId = assignee.id;
      }
      if (
        input.routingType !== undefined &&
        input.routingType !== current.routingType
      ) {
        routingApplied = {
          from: current.routingType,
          to: input.routingType,
        } as { from: HelpdeskRoutingType; to: HelpdeskRoutingType };
        if (input.routingType === "engineering" && current.routingType !== "engineering") {
          patch.githubSyncState = "pending";
          patch.githubSyncError = null;
          patch.githubIssueNumber = null;
          patch.githubIssueUrl = null;
          patch.githubSyncedAt = null;
        }
      }
      patch.version = current.version + 1;
      const claimed = await tx.helpdeskTicket.updateMany({
        where: { id: ticketId, version: input.baseRevision },
        data: patch,
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          `Ticket was updated concurrently (expected version ${input.baseRevision})`,
        );
      }
      return tx.helpdeskTicket.findUnique({ where: { id: ticketId } });
    });
    if (!updated) throw new NotFoundException("Ticket not found");

    const auditActions: { action: string; data: Record<string, unknown> }[] = [];
    auditActions.push({
      action: HELP_DESK_TICKET_ACTIONS.updated,
      data: {
        changed: Object.fromEntries(
          Object.entries(patch).filter(([key]) => key !== "version"),
        ),
        by: user.personId,
      },
    });
    if (transitionApplied) {
      auditActions.push({
        action: HELP_DESK_TICKET_ACTIONS.statusTransitioned,
        data: transitionApplied,
      });
    }
    if (routingApplied) {
      auditActions.push({
        action: HELP_DESK_TICKET_ACTIONS.routed,
        data: routingApplied,
      });
    }
    if (assignmentApplied !== null) {
      const assignment = assignmentApplied as {
        from: string | null;
        to: string | null;
      };
      const isUnassign = assignment.to === null;
      auditActions.push({
        action: isUnassign
          ? HELP_DESK_TICKET_ACTIONS.unassigned
          : HELP_DESK_TICKET_ACTIONS.assigned,
        data: assignment,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        entity: HELP_DESK_TICKET_ENTITY,
        entityId: updated.id,
        action: HELP_DESK_TICKET_ACTIONS.updated,
        actorId: user.personId,
        data: { actions: auditActions as unknown as object, version: updated.version },
      },
    });
    const routedToEngineering = (routingApplied as { to: HelpdeskRoutingType } | null)?.to === "engineering";
    if (routedToEngineering) {
      void this.runGithubSync(updated, user.personId, true);
    }
    void this.notifyOnUpdate(updated, transitionApplied, assignmentApplied);
    return (await this.getTicket(user, updated.id))!;
  }

  /**
   * Trigger a GitHub sync. Idempotent: a `linked` ticket returns immediately,
   * non-engineering routing is a no-op, and a disabled integration leaves the
   * state at `pending`. Returns the resulting sync state to the caller so the
   * controller can surface it.
   */
  async syncTicketToGithub(
    user: AuthUser,
    ticketId: string,
  ): Promise<{
    state: "pending" | "linked" | "failed";
    issueNumber: number | null;
    issueUrl: string | null;
    disabled: boolean;
  }> {
    if (!HELPDESK_STAFF_ROLES.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException("Staff role required to sync to GitHub");
    }
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    await this.runGithubSync(ticket, user.personId, false);
    const fresh = await this.prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
    });
    return {
      state: (fresh?.githubSyncState as "pending" | "linked" | "failed") ?? "pending",
      issueNumber: fresh?.githubIssueNumber ?? null,
      issueUrl: fresh?.githubIssueUrl ?? null,
      disabled: !this.github.isConfigured(),
    };
  }

  // ---------------------------------------------------------------------------
  // Attachments.
  // ---------------------------------------------------------------------------

  /**
   * Upload an attachment. Image-only: the magic-byte sniffer identifies the
   * real type, and `validateHelpdeskImageMime` rejects PDFs (and anything
   * else the generic uploader accepts) before bytes touch disk.
   */
  async createAttachment(
    user: AuthUser,
    ticketId: string,
    file: Express.Multer.File,
    name?: string,
  ): Promise<HelpdeskAttachmentSummary> {
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true, studentId: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (!(await this.canRead(user, ticket))) {
      throw new ForbiddenException("You cannot upload to this ticket");
    }
    const detected = detectedUploadMime(file.buffer ?? Buffer.alloc(0));
    if (!detected || !validateHelpdeskImageMime(detected)) {
      throw new BadRequestException(
        "Helpdesk attachments accept images only (PNG, JPG, GIF, WEBP, AVIF).",
      );
    }
    // Private storage: writes outside the `uploads/` prefix the public
    // download route serves, so a guessed key can never reach the bytes
    // without going through this service's ownership check.
    const storageKey = await this.storage.putHelpdeskImage(file);
    const stored = await this.prisma.helpdeskAttachment.create({
      data: {
        ticketId,
        uploaderId: user.personId,
        // `url` is kept on the row for backwards-compatible summaries but
        // must never be the address used to read the bytes — see the
        // authorized `/helpdesk/attachments/:id` route.
        url: "",
        storageKey,
        name: (name ?? file.originalname).slice(0, 200),
        size: file.size,
        mimeType: detected,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: HELP_DESK_ATTACHMENT_ENTITY,
        entityId: stored.id,
        action: HELP_DESK_ATTACHMENT_ACTIONS.uploaded,
        actorId: user.personId,
        data: { ticketId, size: stored.size, mimeType: stored.mimeType },
      },
    });

    return toAttachment(stored);
  }

  /**
   * Read back an attachment. Requesters only see files from tickets they own;
   * staff see anything. Bytes stream from disk/S3 via the existing
   * `UploadsStorage.get` helper — never the database row.
   */
  async streamAttachment(
    user: AuthUser,
    attachmentId: string,
  ): Promise<{
    ticketId: string;
    body: Buffer;
    contentType: string;
    name: string;
  } | null> {
    const row = await this.prisma.helpdeskAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!row) return null;
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id: row.ticketId },
      select: { id: true, requesterId: true, studentId: true },
    });
    if (!ticket) return null;
    if (!(await this.canRead(user, ticket))) {
      throw new ForbiddenException("You cannot read this attachment");
    }
    // Pre-migration rows (or any row missing a private key) cannot be served
    // through the authorized path — refuse rather than fall back to the
    // public upload route, which would expose the bytes unconditionally.
    if (!row.storageKey) {
      throw new NotFoundException("Attachment not found");
    }
    const stored = await this.storage.getHelpdeskImage(row.storageKey);
    await this.prisma.auditLog.create({
      data: {
        entity: HELP_DESK_ATTACHMENT_ENTITY,
        entityId: row.id,
        action: HELP_DESK_ATTACHMENT_ACTIONS.streamed,
        actorId: user.personId,
        data: { ticketId: row.ticketId },
      },
    });
    const contentType = row.mimeType || stored.contentType;
    return {
      ticketId: row.ticketId,
      body: stored.body,
      contentType,
      name: row.name,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals.
  // ---------------------------------------------------------------------------

  private async runGithubSync(
    ticket: TicketRow,
    actorId: string,
    implicit: boolean,
  ): Promise<void> {
    try {
      if (!implicit) {
        await this.prisma.auditLog.create({
          data: {
            entity: HELP_DESK_TICKET_ENTITY,
            entityId: ticket.id,
            action: HELP_DESK_TICKET_ACTIONS.githubSyncStarted,
            actorId,
            data: { routingType: ticket.routingType },
          },
        });
      }

      const result = await this.github.sync(ticket);
      await this.prisma.helpdeskTicket.update({
        where: { id: ticket.id },
        data: {
          githubSyncState: result.state,
          githubIssueNumber: result.issueNumber,
          githubIssueUrl: result.issueUrl,
          githubSyncError: result.error,
          githubSyncedAt: result.syncedAt,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          entity: HELP_DESK_TICKET_ENTITY,
          entityId: ticket.id,
          action:
            result.state === "linked"
              ? HELP_DESK_TICKET_ACTIONS.githubSyncSucceeded
              : HELP_DESK_TICKET_ACTIONS.githubSyncFailed,
          actorId,
          data: {
            state: result.state,
            issueNumber: result.issueNumber,
            issueUrl: result.issueUrl,
            error: result.error,
            disabled: result.disabled,
            implicit,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Helpdesk GitHub sync crashed for ticket ${ticket.id}: ${message}`,
      );
      try {
        await this.prisma.helpdeskTicket.update({
          where: { id: ticket.id },
          data: {
            githubSyncState: "failed",
            githubSyncError: message.slice(0, 500),
          },
        });
      } catch {
        // The next staff retry remains the recovery path.
      }
    }
  }

  /**
   * Resolve the student link for a new ticket. Students are forced to their
   * own studentId; parents must have a GuardianStudent row; everyone else is
   * allowed to omit it.
   */
  private async resolveStudentLink(
    user: AuthUser,
    requestedStudentId: string | undefined,
  ): Promise<{ studentId: string | null; linkGuardians: boolean }> {
    if (user.roles.includes("student")) {
      if (!user.studentId) {
        throw new ForbiddenException("Student session has no linked Student row");
      }
      if (requestedStudentId && requestedStudentId !== user.studentId) {
        throw new ForbiddenException(
          "Students can only open tickets against themselves",
        );
      }
      return { studentId: user.studentId, linkGuardians: true };
    }
    if (user.roles.includes("parent")) {
      if (!requestedStudentId) {
        throw new BadRequestException(
          "Parents must specify the linked student when opening a ticket",
        );
      }
      const link = await this.prisma.guardianStudent.findFirst({
        where: { guardianId: user.personId, studentId: requestedStudentId },
      });
      if (!link) {
        throw new ForbiddenException(
          "You are not linked to that student",
        );
      }
      return { studentId: requestedStudentId, linkGuardians: false };
    }
    return { studentId: requestedStudentId ?? null, linkGuardians: false };
  }

  /** Re-fetch the ticket with comments and attachments as the projection. */
  private async detailForOwner(
    user: AuthUser,
    ticket: TicketRow,
  ): Promise<HelpdeskTicketDetail> {
    const detail = await this.getTicket(user, ticket.id);
    if (!detail) throw new NotFoundException("Ticket not found");
    return detail;
  }

  /** Scope filter for `listMine` — students see only their own, parents only
   *  tickets linked to one of their children. */
  private requesterScope(user: AuthUser) {
    if (user.roles.includes("student") && user.studentId) {
      return { studentId: user.studentId };
    }
    if (user.roles.includes("parent")) {
      // Parents don't have a stable `studentId`; fall back to `requesterId`.
      return { requesterId: user.personId };
    }
    // Staff who hit /helpdesk/mine get only tickets they themselves raised.
    return { requesterId: user.personId };
  }

  /**
   * True iff the caller is allowed to read this ticket. Staff can always
   * read; students see tickets on their own Student.id; parents see tickets
   * where they are either the requester or the ticket is linked to one of
   * their GuardianStudent children.
   */
  private async canRead(
    user: AuthUser,
    ticket: { requesterId: string; studentId: string | null },
  ): Promise<boolean> {
    if (HELPDESK_STAFF_ROLES.some((r) => user.roles.includes(r))) return true;
    if (user.roles.includes("student") && user.studentId) {
      return ticket.studentId === user.studentId;
    }
    if (user.roles.includes("parent")) {
      if (ticket.requesterId === user.personId) return true;
      if (!ticket.studentId) return false;
      const link = await this.prisma.guardianStudent.findFirst({
        where: { guardianId: user.personId, studentId: ticket.studentId },
      });
      return link !== null;
    }
    return ticket.requesterId === user.personId;
  }
  private async notifyStaffOnCreate(ticket: TicketRow): Promise<void> {
    const people = await this.prisma.person.findMany({
      where: { roles: { hasSome: [...HELPDESK_QUEUE_ROLES] } },
      select: { id: true },
    });
    if (people.length === 0) return;
    await this.fanOut(
      people.map((p) => p.id),
      {
        kind: "helpdesk_ticket_created",
        title: `New helpdesk ticket: ${ticket.title}`,
        body: `${ticket.category} · ${ticket.priority}`,
        href: `/helpdesk/${ticket.id}`,
      },
    );
  }

  private async notifyOnComment(args: {
    ticket: { id: string; requesterId: string; studentId: string | null };
    comment: CommentRow;
    isStaff: boolean;
    actorId: string;
  }): Promise<void> {
    // Staff replying to a requester → notify the requester (and any linked
    // parents). Requester replying to staff → notify the assignee.
    if (args.isStaff && !args.comment.isInternal) {
      const targets = new Set<string>([args.ticket.requesterId]);
      if (args.ticket.studentId) {
        const links = await this.prisma.guardianStudent.findMany({
          where: { studentId: args.ticket.studentId },
          select: { guardianId: true },
        });
        for (const link of links) targets.add(link.guardianId);
      }
      targets.delete(args.actorId);
      if (targets.size === 0) return;
      await this.fanOut(
        Array.from(targets),
        {
          kind: "helpdesk_ticket_updated",
          title: "Update on your helpdesk ticket",
          body: args.comment.body.slice(0, 200),
          href: `/helpdesk/${args.ticket.id}`,
        },
      );
      return;
    }
    if (!args.isStaff) {
      const ticket = await this.prisma.helpdeskTicket.findUnique({
        where: { id: args.ticket.id },
        select: { assigneeId: true },
      });
      if (!ticket?.assigneeId) return;
      await this.fanOut(
        [ticket.assigneeId],
        {
          kind: "helpdesk_ticket_updated",
          title: "Requester reply on helpdesk ticket",
          body: args.comment.body.slice(0, 200),
          href: `/helpdesk/${args.ticket.id}`,
        },
      );
    }
  }

  private async notifyOnUpdate(
    ticket: TicketRow,
    transition: { from: HelpdeskStatus; to: HelpdeskStatus } | null,
    assignment: { from: string | null; to: string | null } | null,
  ): Promise<void> {
    const targets = new Set<string>([ticket.requesterId]);
    if (ticket.studentId) {
      const links = await this.prisma.guardianStudent.findMany({
        where: { studentId: ticket.studentId },
        select: { guardianId: true },
      });
      for (const link of links) targets.add(link.guardianId);
    }
    if (assignment?.to) targets.add(assignment.to);
    if (targets.size === 0) return;
    await this.fanOut(
      Array.from(targets),
      {
        kind: "helpdesk_ticket_updated",
        title:
          transition && transition.to === "resolved"
            ? "Your helpdesk ticket was resolved"
            : "Your helpdesk ticket was updated",
        body: `Status: ${transition ? `${transition.from} → ${transition.to}` : ticket.status}`,
        href: `/helpdesk/${ticket.id}`,
      },
    );
  }

  /**
   * Resolve the channel list once per call: `['in_app','email']` only when the
   * operator has flipped on the global `notifications.emailEnabled` AppSetting
   * (gated by `MailDelivery.isEnabled()`), otherwise `['in_app']`. Hand the
   * recipients to `NotificationsService.emitForAudience` and let the
   * notifications seam + MailDelivery do the rest. Never throws — a failed
   * notification fan-out must never roll back the underlying ticket write.
   */
  private async fanOut(
    personIds: string[],
    template: {
      kind: "helpdesk_ticket_created" | "helpdesk_ticket_updated";
      title: string;
      body?: string;
      href?: string;
    },
  ): Promise<void> {
    try {
      const channels: ReadonlyArray<"in_app" | "email"> = (await this.canMail())
        ? ["in_app", "email"]
        : ["in_app"];
      let recipients: NotificationRecipient[];
      try {
        recipients = await resolveRecipients(this.prisma, {
          kind: "personIds",
          personIds,
        });
      } catch {
        // Recipient resolution is best-effort. If it blows up we silently
        // drop the notification — never throw out to the caller's
        // fire-and-forget promise.
        return;
      }
      if (recipients.length === 0) return;
      const withChannels: NotificationRecipient[] = recipients.map((r) => ({
        personId: r.personId,
        channels,
      }));
      await this.notifications.emitForAudience(
        withChannels,
        template,
        this.mail ?? noopMail,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Helpdesk notification fan-out failed: ${message}`);
    }
  }

  private async canMail(): Promise<boolean> {
    if (!this.mail) return false;
    try {
      return await this.mail.isEnabled();
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Row → projection mappers. Kept at the bottom so the class reads top-down.
// ---------------------------------------------------------------------------

function toSummary(row: TicketRow): HelpdeskTicketSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    routingType: row.routingType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQueueItem(row: TicketRow): HelpdeskQueueItem {
  return {
    ...toSummary(row),
    requesterId: row.requesterId,
    studentId: row.studentId ?? undefined,
    assigneeId: row.assigneeId ?? undefined,
    resolvedAt: row.resolvedAt?.toISOString(),
  };
}

function toDetail(
  row: TicketRow & {
    comments: CommentRow[];
    attachments: AttachmentRow[];
  },
  isStaff: boolean,
): HelpdeskTicketDetail {
  return {
    ...toQueueItem(row),
    description: row.description,
    version: row.version,
    comments: row.comments
      .filter((c) => isStaff || !c.isInternal)
      .map((c) => ({
        id: c.id,
        authorId: c.authorId,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt.toISOString(),
      })),
    attachments: row.attachments.map(toAttachment),
    githubSyncState: row.githubSyncState,
    githubIssueNumber: row.githubIssueNumber ?? undefined,
    githubIssueUrl: row.githubIssueUrl ?? undefined,
    githubSyncError: row.githubSyncError ?? undefined,
    githubSyncedAt: row.githubSyncedAt?.toISOString(),
  };
}

function toAttachment(row: AttachmentRow): HelpdeskAttachmentSummary {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Fallback mail hand-off used when `MailDelivery` isn't wired in (mostly the
 * helpdesk service's unit tests, where the global `NotificationsModule` hasn't
 * booted). Returns a no-op summary that mirrors `MailDelivery.deliver`'s
 * shape — channels-only callers see `skipped` so it's distinguishable from
 * a real "disabled" answer.
 */
const noopMail = {
  async deliver(): Promise<{ attempted: number; sent: number; deferred: number }> {
    return { attempted: 0, sent: 0, deferred: 0 };
  },
};
