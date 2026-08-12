import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type ApprovalRequestKind } from "@mydaust/db";
import { COST_CENTER_TUITION, toDakarDateKey } from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { projectedInstallmentStatus } from "./account-position.js";

export const DIRECTOR_WIDGET_KEYS = [
  "people",
  "academics",
  "admissions",
  "approvals",
  "holds",
  "receivables",
  "collections",
  "cost_centers",
] as const;

const DIRECTOR_WIDGET_CATALOG = [
  {
    key: "people",
    label: "People",
    description: "Students, faculty and staff",
  },
  {
    key: "academics",
    label: "Academics",
    description: "Programs and academic activity",
  },
  {
    key: "admissions",
    label: "Admissions",
    description: "Current applicant volume",
  },
  {
    key: "approvals",
    label: "Approvals",
    description: "Protected changes awaiting a decision",
  },
  {
    key: "holds",
    label: "Active holds",
    description: "Students with active administrative holds",
  },
  {
    key: "receivables",
    label: "Receivables",
    description: "Overdue accounts and amounts",
  },
  {
    key: "collections",
    label: "Collections",
    description: "Cash collected and net position",
  },
  {
    key: "cost_centers",
    label: "Cost centers",
    description: "Component revenue and operating expense",
  },
] as const;

type ProtectedChange = {
  kind: ApprovalRequestKind;
  targetType: string;
  targetId?: string;
  academicYearLabel?: string;
  reason?: string;
  after: Record<string, unknown>;
};

type StoredApproval = Prisma.ApprovalRequestGetPayload<Record<string, never>>;

@Injectable()
export class FinanceApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }

  private async snapshot(change: ProtectedChange) {
    if (change.kind === "global_fee_schedule") {
      const schedule = await this.prisma.feeSchedule.findFirst({
        where: {
          academicYearLabel: change.academicYearLabel,
          status: "approved",
        },
        orderBy: { revision: "desc" },
        include: { rows: { orderBy: { sequence: "asc" } } },
      });
      if (!schedule)
        throw new NotFoundException("Approved fee schedule not found");
      return { before: schedule, baseRevision: schedule.revision };
    }
    if (change.kind === "charge_removal" || change.kind === "payment_plan") {
      if (!change.targetId)
        throw new BadRequestException("Missing invoice target");
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: change.targetId },
        include: {
          plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
          components: true,
        },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      return { before: invoice, baseRevision: invoice.revision };
    }
    return { before: null, baseRevision: 0 };
  }

  /** Bursars submit; admins use the same record and immediately self-approve it. */
  async request(actor: AuthUser, change: ProtectedChange) {
    const { before, baseRevision } = await this.snapshot(change);
    const request = await this.transaction(async (tx) => {
      if (change.kind === "payment_plan" && change.targetId) {
        const pending = await tx.approvalRequest.findFirst({
          where: {
            kind: change.kind,
            targetType: change.targetType,
            targetId: change.targetId,
            status: "pending",
          },
          select: { id: true },
        });
        if (pending) {
          throw new BadRequestException(
            "A change for this billing is already awaiting administrator approval",
          );
        }
      }
      const created = await tx.approvalRequest.create({
        data: {
          kind: change.kind,
          status: "pending",
          targetType: change.targetType,
          targetId: change.targetId,
          academicYearLabel: change.academicYearLabel,
          reason:
            change.reason?.trim() ||
            `Requested ${change.kind.replaceAll("_", " ")}`,
          beforeJson: before === null ? Prisma.JsonNull : this.asJson(before),
          afterJson: this.asJson(change.after),
          baseRevision,
          requestedById: actor.personId,
        },
      });
      await tx.approvalEvent.create({
        data: {
          requestId: created.id,
          action: "submitted",
          actorId: actor.personId,
          data: this.asJson({ autoApproved: actor.roles.includes("admin") }),
        },
      });
      return created;
    });
    if (actor.roles.includes("admin")) {
      let decision;
      try {
        decision = await this.approve(
          request.id,
          actor,
          "Admin-originated change",
        );
      } catch (error) {
        // The submission and self-approval are intentionally separate transactions so
        // every admin change has the same durable audit record as a bursar request.
        // If validation rejects the application, do not leave that record pending: a
        // pending payment-plan request would otherwise lock the student's billing and
        // make the corrected admin retry fail as a duplicate.
        const detail =
          error instanceof Error && error.message.trim()
            ? error.message.trim().slice(0, 900)
            : "The protected change failed validation";
        await this.decideWithoutApply(
          request.id,
          actor.personId,
          "cancelled",
          `Admin-originated change was not applied: ${detail}`,
        );
        throw error;
      }
      const applied = await this.prisma.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: {
          requestedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
          reviewedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
          events: { orderBy: { createdAt: "asc" } },
        },
      });
      return {
        applied: decision.ok === true && decision.status === "approved",
        request: this.present(applied),
        result: decision.result ?? null,
      };
    }
    return { applied: false, request: this.present(request), result: null };
  }

  async list(actor: AuthUser, view = "pending", search?: string) {
    const isAdmin = actor.roles.includes("admin");
    const scope =
      !isAdmin || view === "mine" ? { requestedById: actor.personId } : {};
    const status =
      view === "pending"
        ? { status: "pending" as const }
        : view === "history"
          ? { status: { not: "pending" as const } }
          : {};
    const q = search?.trim();
    const rows = await this.prisma.approvalRequest.findMany({
      where: {
        ...scope,
        ...status,
        ...(q
          ? {
              OR: [
                { reason: { contains: q, mode: "insensitive" as const } },
                { targetType: { contains: q, mode: "insensitive" as const } },
                { targetId: { contains: q, mode: "insensitive" as const } },
                {
                  requestedBy: {
                    is: {
                      OR: [
                        {
                          firstName: {
                            contains: q,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          lastName: {
                            contains: q,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          email: { contains: q, mode: "insensitive" as const },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        requestedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    return rows.map((row) => this.present(row));
  }

  async pendingCount(actor: AuthUser) {
    return this.prisma.approvalRequest.count({
      where: {
        status: "pending",
        ...(actor.roles.includes("admin")
          ? {}
          : { requestedById: actor.personId }),
      },
    });
  }

  async getDirectorWidgets(personId: string) {
    const preference = await this.prisma.directorWidgetPreference.findUnique({
      where: { personId },
    });
    return {
      available: DIRECTOR_WIDGET_CATALOG,
      selected: preference?.widgetKeys ?? [...DIRECTOR_WIDGET_KEYS],
    };
  }

  async setDirectorWidgets(personId: string, widgetKeys: string[]) {
    const allowed = new Set<string>(DIRECTOR_WIDGET_KEYS);
    if (
      widgetKeys.length !== new Set(widgetKeys).size ||
      widgetKeys.some((key) => !allowed.has(key))
    ) {
      throw new BadRequestException(
        "Widget keys must be unique values from the Director catalog",
      );
    }
    const preference = await this.prisma.directorWidgetPreference.upsert({
      where: { personId },
      create: { personId, widgetKeys },
      update: { widgetKeys },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "DirectorWidgetPreference",
        entityId: preference.id,
        action: "widgets-updated",
        actorId: personId,
        data: { widgetKeys },
      },
    });
    return this.getDirectorWidgets(personId);
  }

  private present(row: {
    id: string;
    kind: ApprovalRequestKind;
    status: string;
    targetType: string;
    targetId: string | null;
    academicYearLabel: string | null;
    reason: string;
    beforeJson: unknown;
    afterJson: unknown;
    baseRevision: number;
    requestedById: string;
    reviewedById: string | null;
    decisionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    appliedAt: Date | null;
    requestedBy?: { firstName: string; lastName: string; email: string };
    reviewedBy?: { firstName: string; lastName: string; email: string } | null;
    events?: unknown[];
  }) {
    return {
      ...row,
      requester: row.requestedBy
        ? {
            name: `${row.requestedBy.firstName} ${row.requestedBy.lastName}`.trim(),
            email: row.requestedBy.email,
          }
        : null,
      reviewer: row.reviewedBy
        ? {
            name: `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}`.trim(),
            email: row.reviewedBy.email,
          }
        : null,
      requestedBy: undefined,
      reviewedBy: undefined,
    };
  }

  async approve(id: string, actor: AuthUser, note?: string) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only an administrator can approve changes");
    }
    return this.transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
      if (request.status === "approved") {
        return { ok: true, id: request.id, status: request.status };
      }
      if (request.status !== "pending") {
        throw new BadRequestException(`Request is already ${request.status}`);
      }
      const staleReason = await this.staleReason(tx, request);
      if (staleReason) {
        const stale = await tx.approvalRequest.update({
          where: { id },
          data: {
            status: "stale",
            reviewedById: actor.personId,
            reviewedAt: new Date(),
            decisionNote: staleReason,
          },
        });
        await tx.approvalEvent.create({
          data: {
            requestId: id,
            action: "stale",
            actorId: actor.personId,
            data: this.asJson({ reason: staleReason }),
          },
        });
        return { ok: false, id, status: stale.status, reason: staleReason };
      }

      const result = await this.apply(tx, request, actor.personId);
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: "approved",
          reviewedById: actor.personId,
          reviewedAt: new Date(),
          appliedAt: new Date(),
          decisionNote: note?.trim() || null,
        },
      });
      await tx.approvalEvent.create({
        data: {
          requestId: id,
          action: "approved",
          actorId: actor.personId,
          data: this.asJson({ result, note: note ?? null }),
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "ApprovalRequest",
          entityId: id,
          action: "approved-and-applied",
          actorId: actor.personId,
          data: this.asJson({ kind: request.kind, result }),
        },
      });
      return { ok: true, id, status: updated.status, result };
    });
  }

  async reject(id: string, actor: AuthUser, note: string) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only an administrator can reject changes");
    }
    if (!note.trim())
      throw new BadRequestException("A rejection reason is required");
    return this.decideWithoutApply(id, actor.personId, "rejected", note.trim());
  }

  async cancel(id: string, actor: AuthUser, note?: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException("Approval request not found");
    if (
      request.requestedById !== actor.personId &&
      !actor.roles.includes("admin")
    ) {
      throw new ForbiddenException("You can cancel only your own request");
    }
    return this.decideWithoutApply(
      id,
      actor.personId,
      "cancelled",
      note?.trim() || "Cancelled by requester",
    );
  }

  private async decideWithoutApply(
    id: string,
    actorId: string,
    status: "rejected" | "cancelled",
    note: string,
  ) {
    return this.transaction(async (tx) => {
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          status,
          reviewedById: actorId,
          reviewedAt: new Date(),
          decisionNote: note,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.approvalRequest.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Approval request not found");
        throw new BadRequestException(`Request is already ${current.status}`);
      }
      await tx.approvalEvent.create({
        data: { requestId: id, action: status, actorId, data: { note } },
      });
      await tx.auditLog.create({
        data: {
          entity: "ApprovalRequest",
          entityId: id,
          action: status,
          actorId,
          data: { note },
        },
      });
      return { ok: true, id, status };
    });
  }

  private async staleReason(
    tx: Prisma.TransactionClient,
    request: StoredApproval,
  ): Promise<string | null> {
    if (request.kind === "global_fee_schedule") {
      const schedule = await tx.feeSchedule.findFirst({
        where: {
          academicYearLabel: request.academicYearLabel ?? undefined,
          status: "approved",
        },
        orderBy: { revision: "desc" },
      });
      return schedule?.revision === request.baseRevision
        ? null
        : "The approved fee schedule changed after this request was submitted";
    }
    if (request.kind === "payment_plan" || request.kind === "charge_removal") {
      const invoice = request.targetId
        ? await tx.invoice.findUnique({ where: { id: request.targetId } })
        : null;
      if (!invoice) return "The target invoice no longer exists";
      return invoice.revision === request.baseRevision
        ? null
        : "The student billing changed after this request was submitted";
    }
    return null;
  }

  private async apply(
    tx: Prisma.TransactionClient,
    request: StoredApproval,
    actorId: string,
  ) {
    const after = request.afterJson as Record<string, unknown>;
    switch (request.kind) {
      case "global_fee_schedule":
        return this.applyScheduleRevision(tx, request, after, actorId);
      case "custom_charge":
        return this.applyCustomCharge(tx, after, request.requestedById);
      case "charge_removal":
        return this.applyChargeRemoval(tx, request.targetId!);
      case "payment_plan":
        return this.applyPaymentPlan(
          tx,
          request.targetId!,
          after,
          request.requestedById,
        );
      case "discount":
      case "scholarship":
        return this.applyCredit(tx, after, request.kind);
    }
  }

  private normalizedScheduleRow(
    row: {
      label: string;
      dueOn: Date | null;
      amountFullXof: number;
      amountTuitionXof: number;
      amountHousingXof: number;
      amountCafeteriaXof: number;
    },
    raw: Record<string, unknown>,
  ) {
    const tuition = Number(raw.amountTuitionXof ?? row.amountTuitionXof);
    let housing = Number(raw.amountHousingXof ?? row.amountHousingXof);
    let cafeteria = Number(raw.amountCafeteriaXof ?? row.amountCafeteriaXof);
    const requestedFull =
      raw.amountFullXof === undefined ? undefined : Number(raw.amountFullXof);
    const componentWasExplicit =
      raw.amountHousingXof !== undefined ||
      raw.amountCafeteriaXof !== undefined;
    if (requestedFull !== undefined && !componentWasExplicit) {
      const remainder = requestedFull - tuition;
      if (remainder < 0) {
        throw new BadRequestException(
          "Full-package amount cannot be below tuition",
        );
      }
      const auxiliaryBase = row.amountHousingXof + row.amountCafeteriaXof;
      const housingWeight = auxiliaryBase > 0 ? row.amountHousingXof : 680_000;
      const cafeteriaWeight =
        auxiliaryBase > 0 ? row.amountCafeteriaXof : 630_000;
      const weightTotal = housingWeight + cafeteriaWeight;
      housing = Math.floor((remainder * housingWeight) / weightTotal);
      cafeteria = remainder - housing;
    }
    const full = tuition + housing + cafeteria;
    if (requestedFull !== undefined && requestedFull !== full) {
      throw new BadRequestException(
        "Full-package amount must equal tuition + housing + cafeteria",
      );
    }
    for (const amount of [tuition, housing, cafeteria, full]) {
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new BadRequestException(
          "Fee amounts must be non-negative whole XOF values",
        );
      }
    }
    return {
      label: String(raw.label ?? row.label).trim(),
      dueOn:
        raw.dueOn === undefined
          ? row.dueOn
          : new Date(`${String(raw.dueOn)}T00:00:00.000Z`),
      amountTuitionXof: tuition,
      amountHousingXof: housing,
      amountCafeteriaXof: cafeteria,
      amountFullXof: full,
    };
  }

  private async applyScheduleRevision(
    tx: Prisma.TransactionClient,
    request: StoredApproval,
    after: Record<string, unknown>,
    actorId: string,
  ) {
    const current = await tx.feeSchedule.findFirstOrThrow({
      where: {
        academicYearLabel: request.academicYearLabel ?? undefined,
        status: "approved",
      },
      orderBy: { revision: "desc" },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    const batchRows = Array.isArray(after.rows)
      ? (after.rows as Record<string, unknown>[])
      : null;
    let rowValues;
    if (batchRows) {
      if (batchRows.length !== current.rows.length) {
        throw new BadRequestException(
          "A schedule replacement must include every installment",
        );
      }
      const byId = new Map(
        batchRows.map((row) => [String(row.id ?? ""), row] as const),
      );
      rowValues = current.rows.map((row) => {
        const input = byId.get(row.id);
        if (!input) {
          throw new BadRequestException(
            `Schedule installment ${row.sequence} is missing`,
          );
        }
        return { ...row, ...this.normalizedScheduleRow(row, input) };
      });
    } else {
      const rowId = String(after.rowId ?? request.targetId ?? "");
      const input = (after.input ?? {}) as Record<string, unknown>;
      const changed = current.rows.find((row) => row.id === rowId);
      if (!changed) {
        throw new BadRequestException("Fee schedule row no longer exists");
      }
      const replacement = this.normalizedScheduleRow(changed, input);
      rowValues = current.rows.map((row) =>
        row.id === changed.id ? { ...row, ...replacement } : row,
      );
    }
    if (rowValues.some((row) => !row.dueOn)) {
      throw new BadRequestException(
        "Every approved installment needs a due date",
      );
    }
    const totals = {
      tuition: rowValues.reduce((sum, row) => sum + row.amountTuitionXof, 0),
      housing: rowValues.reduce((sum, row) => sum + row.amountHousingXof, 0),
      cafeteria: rowValues.reduce(
        (sum, row) => sum + row.amountCafeteriaXof,
        0,
      ),
      full: rowValues.reduce((sum, row) => sum + row.amountFullXof, 0),
    };
    if (totals.full !== totals.tuition + totals.housing + totals.cafeteria) {
      throw new BadRequestException("Fee schedule components do not reconcile");
    }

    const invoices = await tx.invoice.findMany({
      where: {
        feeScheduleId: current.id,
        packageType: "standard_full",
        status: { not: "void" },
        student: { recordStatus: "active" },
      },
      include: {
        plan: { include: { installments: true } },
        components: { include: { allocations: true } },
      },
    });
    for (const invoice of invoices) {
      if (
        !invoice.plan ||
        invoice.plan.installments.length !== rowValues.length
      ) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} does not match the approved schedule`,
        );
      }
      for (const installment of invoice.plan.installments) {
        const row = rowValues.find(
          (item) => item.sequence === installment.sequence,
        );
        if (!row || row.amountFullXof < installment.amountPaid) {
          throw new BadRequestException(
            `Installment ${installment.sequence} on ${invoice.number ?? invoice.id} cannot be reduced below its paid amount`,
          );
        }
      }
      const componentTotals = new Map([
        ["tuition", totals.tuition],
        ["housing", totals.housing],
        ["cafeteria", totals.cafeteria],
      ]);
      for (const component of invoice.components) {
        if (!componentTotals.has(component.kind)) {
          throw new BadRequestException(
            `Linked invoice ${invoice.number ?? invoice.id} contains unsupported ${component.kind} package accounting`,
          );
        }
        const allocated = component.allocations.reduce(
          (sum, allocation) =>
            sum + allocation.amountXof - allocation.refundedAmountXof,
          0,
        );
        const newAmount = componentTotals.get(component.kind) ?? 0;
        if (newAmount < allocated) {
          throw new BadRequestException(
            `${component.kind} on ${invoice.number ?? invoice.id} already has ${allocated} XOF collected`,
          );
        }
      }
    }

    const next = await tx.feeSchedule.create({
      data: {
        academicYearLabel: current.academicYearLabel,
        revision: current.revision + 1,
        status: "approved",
        reason: request.reason,
        createdById: request.requestedById,
        approvedById: actorId,
        approvedAt: new Date(),
        rows: {
          create: rowValues.map((row) => ({
            academicYearLabel: current.academicYearLabel,
            semester: row.semester,
            label: row.label,
            sequence: row.sequence,
            dueOn: row.dueOn,
            amountFullXof: row.amountFullXof,
            amountTuitionXof: row.amountTuitionXof,
            amountHousingXof: row.amountHousingXof,
            amountCafeteriaXof: row.amountCafeteriaXof,
          })),
        },
      },
    });
    await tx.feeSchedule.update({
      where: { id: current.id },
      data: { status: "superseded" },
    });

    for (const invoice of invoices) {
      for (const installment of invoice.plan!.installments) {
        const row = rowValues.find(
          (item) => item.sequence === installment.sequence,
        )!;
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            label: row.label,
            dueDate: row.dueOn!,
            amountDue: row.amountFullXof,
            status: projectedInstallmentStatus({
              dueDate: row.dueOn!,
              amountDue: row.amountFullXof,
              amountPaid: installment.amountPaid,
            }),
          },
        });
      }
      const componentRows = [
        { kind: "tuition", costCenterCode: "9100", amountXof: totals.tuition },
        { kind: "housing", costCenterCode: "3700", amountXof: totals.housing },
        {
          kind: "cafeteria",
          costCenterCode: "3600",
          amountXof: totals.cafeteria,
        },
      ];
      for (const component of componentRows) {
        await tx.invoiceComponent.upsert({
          where: {
            invoiceId_kind: { invoiceId: invoice.id, kind: component.kind },
          },
          create: { invoiceId: invoice.id, ...component },
          update: {
            costCenterCode: component.costCenterCode,
            amountXof: component.amountXof,
          },
        });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: totals.full,
          feeScheduleId: next.id,
          feeScheduleRevision: next.revision,
          revision: { increment: 1 },
          status:
            invoice.amountPaid >= totals.full
              ? "paid"
              : invoice.amountPaid > 0
                ? "partial"
                : "open",
        },
      });
    }
    return {
      scheduleId: next.id,
      revision: next.revision,
      linkedPlansUpdated: invoices.length,
      totals,
    };
  }

  private async activeTerm(tx: Prisma.TransactionClient) {
    const term = await tx.term.findFirst({
      where: { academicYear: { status: "active" } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      include: { academicYear: true },
    });
    if (!term)
      throw new BadRequestException("The active academic year has no term");
    return term;
  }

  private componentKind(costCenterCode: string) {
    if (costCenterCode === "9100") return "tuition";
    if (costCenterCode === "3700") return "housing";
    if (costCenterCode === "3600") return "cafeteria";
    return "other";
  }

  private async applyCustomCharge(
    tx: Prisma.TransactionClient,
    after: Record<string, unknown>,
    requesterId: string,
  ) {
    const studentIds = [...new Set(after.studentIds as string[])];
    const amountXof = Number(after.amountXof);
    const costCenterCode = String(after.costCenterCode ?? COST_CENTER_TUITION);
    const description = String(after.description ?? "").trim();
    const provided = (after.installments ?? null) as
      { dueDate: string; amountXof: number; label?: string | null }[] | null;
    if (!description || !Number.isSafeInteger(amountXof) || amountXof <= 0) {
      throw new BadRequestException("Invalid custom charge");
    }
    const [term, center, students] = await Promise.all([
      this.activeTerm(tx),
      tx.costCenter.findUnique({ where: { code: costCenterCode } }),
      tx.student.findMany({
        where: { id: { in: studentIds }, recordStatus: "active" },
        select: { id: true },
      }),
    ]);
    if (!center) throw new BadRequestException("Unknown cost center");
    if (students.length !== studentIds.length) {
      throw new BadRequestException(
        "One or more students are missing or archived",
      );
    }
    const schedule = provided?.length
      ? provided.map((row, index) => ({
          sequence: index + 1,
          label: row.label?.trim() || null,
          dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
          amountDue: Number(row.amountXof),
        }))
      : [
          {
            sequence: 1,
            label: null,
            dueDate: new Date(
              `${String(after.dueDate ?? toDakarDateKey(new Date()))}T00:00:00.000Z`,
            ),
            amountDue: amountXof,
          },
        ];
    if (
      schedule.some(
        (row) => !Number.isSafeInteger(row.amountDue) || row.amountDue <= 0,
      ) ||
      schedule.reduce((sum, row) => sum + row.amountDue, 0) !== amountXof
    ) {
      throw new BadRequestException(
        "Charge installments must reconcile to the billing total",
      );
    }
    for (const student of students) {
      await tx.invoice.create({
        data: {
          number: `BILL-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          studentId: student.id,
          termId: term.id,
          totalAmount: amountXof,
          description,
          costCenterCode,
          packageType: "custom",
          academicYearLabel: term.academicYear?.label ?? null,
          components: {
            create: {
              kind: this.componentKind(costCenterCode),
              costCenterCode,
              amountXof,
            },
          },
          plan: {
            create: {
              createdById: requesterId,
              installments: {
                create: schedule.map((row) => ({
                  ...row,
                  status: projectedInstallmentStatus({ ...row, amountPaid: 0 }),
                })),
              },
            },
          },
        },
      });
    }
    return { created: students.length };
  }

  private async applyChargeRemoval(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ) {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("Charge not found");
    if (invoice.packageType !== "custom") {
      throw new BadRequestException(
        "The approved standard package cannot be removed",
      );
    }
    if (invoice.status === "void") return { invoiceId, alreadyVoid: true };
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "void", revision: { increment: 1 } },
    });
    let creditId: string | null = null;
    if (invoice.amountPaid > 0) {
      const credit = await tx.invoice.create({
        data: {
          studentId: invoice.studentId,
          termId: invoice.termId,
          totalAmount: -invoice.amountPaid,
          status: "paid",
          description: `Credit — approved removal of ${invoice.description ?? invoice.number ?? invoice.id}`,
          costCenterCode: invoice.costCenterCode,
          packageType: "credit",
          academicYearLabel: invoice.academicYearLabel,
        },
      });
      creditId = credit.id;
    }
    return { invoiceId, voided: true, creditId };
  }

  private async applyPaymentPlan(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    after: Record<string, unknown>,
    requesterId: string,
  ) {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: true } },
        components: { include: { allocations: true } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "void") {
      throw new BadRequestException(
        "A void invoice cannot have a payment plan",
      );
    }
    if (invoice.packageType === "credit" || invoice.totalAmount < 0) {
      throw new BadRequestException("A credit memo cannot have a payment plan");
    }
    if (
      String(after.mode ?? "replace") === "restore_standard" &&
      !invoice.academicYearLabel
    ) {
      throw new BadRequestException(
        "The invoice has no academic year for a standard-plan restoration",
      );
    }
    const mode = String(after.mode ?? "replace");
    if (mode === "restore_standard") {
      return this.restoreStandardPaymentPlan(tx, invoice, requesterId);
    }
    let rows: {
      id?: string;
      sequence: number;
      dueDate: string;
      amountDue: number;
      label?: string | null;
    }[];
    if (mode === "create") {
      const inputs = after.installments as {
        sequence: number;
        dueDate: string;
        amount?: number;
        percent?: number;
      }[];
      rows = inputs.map((row) => ({
        sequence: row.sequence,
        dueDate: row.dueDate,
        amountDue:
          row.amount ??
          Math.round((invoice.totalAmount * (row.percent ?? 0)) / 100),
      }));
    } else if (mode === "update") {
      const updates = after.installments as typeof rows;
      if (
        updates.some((row) => !row.id) ||
        new Set(updates.map((row) => row.id)).size !== updates.length
      ) {
        throw new BadRequestException(
          "Updated payment-plan installments must have unique IDs",
        );
      }
      const updatesById = new Map(updates.map((row) => [row.id!, row]));
      for (const id of updatesById.keys()) {
        if (!invoice.plan?.installments.some((item) => item.id === id)) {
          throw new BadRequestException("Installment is not on this invoice");
        }
      }
      // PATCH changes only the submitted rows. Preserve every unspecified line so a
      // partial client payload cannot silently delete unpaid obligations.
      rows = (invoice.plan?.installments ?? []).map((current) => {
        const update = updatesById.get(current.id);
        return update
          ? {
              ...update,
              id: current.id,
              sequence: current.sequence,
              label: update.label === undefined ? current.label : update.label,
            }
          : {
              id: current.id,
              sequence: current.sequence,
              dueDate: current.dueDate.toISOString().slice(0, 10),
              amountDue: current.amountDue,
              label: current.label,
            };
      });
    } else {
      rows = after.installments as typeof rows;
    }
    if (
      !rows?.length ||
      new Set(rows.map((row) => row.sequence)).size !== rows.length
    ) {
      throw new BadRequestException("Payment plan installments are invalid");
    }
    const plan =
      invoice.plan ??
      (await tx.paymentPlan.create({
        data: { invoiceId, createdById: requesterId },
      }));
    const existing = new Map(
      (invoice.plan?.installments ?? []).map((row) => [row.id, row] as const),
    );
    for (const row of rows) {
      const current = row.id ? existing.get(row.id) : undefined;
      if (row.id && !current)
        throw new BadRequestException("Installment is not on this invoice");
      if (
        !Number.isSafeInteger(row.amountDue) ||
        row.amountDue < (current?.amountPaid ?? 0)
      ) {
        throw new BadRequestException(
          "An installment cannot be below its paid amount",
        );
      }
    }
    for (const current of existing.values()) {
      if (
        current.amountPaid > 0 &&
        !rows.some((row) => row.id === current.id)
      ) {
        throw new BadRequestException("A paid installment cannot be removed");
      }
    }
    const planChanged =
      rows.length !== existing.size ||
      rows.some((row) => {
        const current = row.id ? existing.get(row.id) : undefined;
        return (
          !current ||
          current.sequence !== row.sequence ||
          current.dueDate.toISOString().slice(0, 10) !== row.dueDate ||
          current.amountDue !== row.amountDue ||
          (current.label ?? "") !== (row.label?.trim() ?? "")
        );
      });
    const incomingIds = rows.flatMap((row) => (row.id ? [row.id] : []));
    await tx.installment.deleteMany({
      where: { planId: plan.id, id: { notIn: incomingIds }, amountPaid: 0 },
    });
    for (const current of existing.values()) {
      if (incomingIds.includes(current.id)) {
        await tx.installment.update({
          where: { id: current.id },
          data: { sequence: -current.sequence },
        });
      }
    }
    for (const row of rows) {
      const current = row.id ? existing.get(row.id) : undefined;
      const dueDate = new Date(`${row.dueDate}T00:00:00.000Z`);
      const data = {
        sequence: row.sequence,
        dueDate,
        amountDue: row.amountDue,
        label: row.label?.trim() || null,
        status: projectedInstallmentStatus({
          dueDate,
          amountDue: row.amountDue,
          amountPaid: current?.amountPaid ?? 0,
        }),
      };
      if (current)
        await tx.installment.update({ where: { id: current.id }, data });
      else await tx.installment.create({ data: { planId: plan.id, ...data } });
    }
    const total = rows.reduce((sum, row) => sum + row.amountDue, 0);
    if (total < invoice.amountPaid) {
      throw new BadRequestException(
        "Plan total cannot be below the amount already paid",
      );
    }
    if (invoice.components.length === 0 && total > 0) {
      await tx.invoiceComponent.create({
        data: {
          invoiceId,
          kind: this.componentKind(invoice.costCenterCode),
          costCenterCode: invoice.costCenterCode,
          amountXof: total,
        },
      });
    } else if (invoice.components.length > 0) {
      const componentBase = invoice.components.reduce(
        (sum, component) => sum + component.amountXof,
        0,
      );
      const weighted = invoice.components
        .map((component) => {
          const weight = componentBase > 0 ? component.amountXof : 1;
          const denominator = BigInt(
            componentBase > 0 ? componentBase : invoice.components.length,
          );
          const numerator = BigInt(total) * BigInt(weight);
          return {
            component,
            amountXof: Number(numerator / denominator),
            remainder: numerator % denominator,
          };
        })
        .sort((a, b) =>
          a.remainder === b.remainder
            ? a.component.id.localeCompare(b.component.id)
            : a.remainder > b.remainder
              ? -1
              : 1,
        );
      let remainderXof =
        total - weighted.reduce((sum, row) => sum + row.amountXof, 0);
      for (const row of weighted) {
        if (remainderXof === 0) break;
        row.amountXof += 1;
        remainderXof--;
      }
      for (const row of weighted) {
        const allocated = row.component.allocations.reduce(
          (sum, allocation) =>
            sum + allocation.amountXof - allocation.refundedAmountXof,
          0,
        );
        if (row.amountXof < allocated) {
          throw new BadRequestException(
            `${row.component.kind} cannot be reduced below ${allocated} XOF already collected`,
          );
        }
        await tx.invoiceComponent.update({
          where: { id: row.component.id },
          data: { amountXof: row.amountXof },
        });
      }
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount: total,
        // A student-specific change must no longer follow future global revisions.
        // Retain feeScheduleRevision as historical provenance while severing the
        // live relation that applyScheduleRevision uses to select linked accounts.
        ...(invoice.packageType === "standard_full" && planChanged
          ? { feeScheduleId: null }
          : {}),
        revision: { increment: 1 },
        status:
          invoice.amountPaid >= total
            ? "paid"
            : invoice.amountPaid > 0
              ? "partial"
              : "open",
      },
    });
    return {
      invoiceId,
      total,
      installments: rows.length,
      individualOverride:
        invoice.packageType === "standard_full" &&
        (planChanged || invoice.feeScheduleId === null),
    };
  }

  private async restoreStandardPaymentPlan(
    tx: Prisma.TransactionClient,
    invoice: Prisma.InvoiceGetPayload<{
      include: {
        plan: { include: { installments: true } };
        components: { include: { allocations: true } };
      };
    }>,
    requesterId: string,
  ) {
    if (invoice.packageType !== "standard_full") {
      throw new BadRequestException(
        "Only a full-package invoice can be restored to the standard schedule",
      );
    }
    if (invoice.feeScheduleId !== null) {
      return { invoiceId: invoice.id, alreadyStandard: true };
    }
    const unsupportedComponent = invoice.components.find(
      (component) =>
        !["tuition", "housing", "cafeteria"].includes(component.kind),
    );
    if (unsupportedComponent) {
      throw new BadRequestException(
        `The package contains unsupported ${unsupportedComponent.kind} accounting`,
      );
    }
    const schedule = await tx.feeSchedule.findFirst({
      where: {
        academicYearLabel: invoice.academicYearLabel ?? undefined,
        status: "approved",
        approvedById: { not: null },
        approvedAt: { not: null },
      },
      orderBy: { revision: "desc" },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    if (!schedule || schedule.rows.length === 0) {
      throw new BadRequestException(
        "No approved standard schedule exists for this academic year",
      );
    }
    if (schedule.rows.some((row) => !row.dueOn)) {
      throw new BadRequestException(
        "Every approved standard installment needs a due date",
      );
    }
    const existing = new Map(
      (invoice.plan?.installments ?? []).map(
        (row) => [row.sequence, row] as const,
      ),
    );
    if (invoice.plan) {
      for (const installment of invoice.plan.installments) {
        const standard = schedule.rows.find(
          (row) => row.sequence === installment.sequence,
        );
        if (
          installment.amountPaid > 0 &&
          (!standard || standard.amountFullXof < installment.amountPaid)
        ) {
          throw new BadRequestException(
            `Installment ${installment.sequence} cannot be restored below ${installment.amountPaid} XOF already paid`,
          );
        }
      }
    }
    const total = schedule.rows.reduce(
      (sum, row) => sum + row.amountFullXof,
      0,
    );
    if (total < invoice.amountPaid) {
      throw new BadRequestException(
        "The standard package total cannot be below the amount already paid",
      );
    }
    const plan =
      invoice.plan ??
      (await tx.paymentPlan.create({
        data: { invoiceId: invoice.id, createdById: requesterId },
      }));
    const standardSequences = schedule.rows.map((row) => row.sequence);
    await tx.installment.deleteMany({
      where: {
        planId: plan.id,
        sequence: { notIn: standardSequences },
        amountPaid: 0,
      },
    });
    for (const row of schedule.rows) {
      const current = existing.get(row.sequence);
      const data = {
        label: row.label,
        dueDate: row.dueOn!,
        amountDue: row.amountFullXof,
        status: projectedInstallmentStatus({
          dueDate: row.dueOn!,
          amountDue: row.amountFullXof,
          amountPaid: current?.amountPaid ?? 0,
        }),
      };
      if (current) {
        await tx.installment.update({ where: { id: current.id }, data });
      } else {
        await tx.installment.create({
          data: { planId: plan.id, sequence: row.sequence, ...data },
        });
      }
    }
    const componentTotals = [
      {
        kind: "tuition",
        costCenterCode: "9100",
        amountXof: schedule.rows.reduce(
          (sum, row) => sum + row.amountTuitionXof,
          0,
        ),
      },
      {
        kind: "housing",
        costCenterCode: "3700",
        amountXof: schedule.rows.reduce(
          (sum, row) => sum + row.amountHousingXof,
          0,
        ),
      },
      {
        kind: "cafeteria",
        costCenterCode: "3600",
        amountXof: schedule.rows.reduce(
          (sum, row) => sum + row.amountCafeteriaXof,
          0,
        ),
      },
    ];
    for (const component of componentTotals) {
      const current = invoice.components.find(
        (row) => row.kind === component.kind,
      );
      const allocated = (current?.allocations ?? []).reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      );
      if (component.amountXof < allocated) {
        throw new BadRequestException(
          `${component.kind} cannot be restored below ${allocated} XOF already collected`,
        );
      }
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: {
            invoiceId: invoice.id,
            kind: component.kind,
          },
        },
        create: { invoiceId: invoice.id, ...component },
        update: {
          costCenterCode: component.costCenterCode,
          amountXof: component.amountXof,
        },
      });
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: total,
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
        revision: { increment: 1 },
        status:
          invoice.amountPaid >= total
            ? "paid"
            : invoice.amountPaid > 0
              ? "partial"
              : "open",
      },
    });
    return {
      invoiceId: invoice.id,
      restored: true,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      total,
    };
  }

  private async applyCredit(
    tx: Prisma.TransactionClient,
    after: Record<string, unknown>,
    kind: "discount" | "scholarship",
  ) {
    const studentId = String(after.studentId ?? "");
    const amountXof = Number(after.amountXof);
    const label = String(after.label ?? "").trim();
    const costCenterCode = String(after.costCenterCode ?? COST_CENTER_TUITION);
    const [student, center, term] = await Promise.all([
      tx.student.findFirst({
        where: { id: studentId, recordStatus: "active" },
      }),
      tx.costCenter.findUnique({ where: { code: costCenterCode } }),
      this.activeTerm(tx),
    ]);
    if (!student) throw new NotFoundException("Active student not found");
    if (!center) throw new BadRequestException("Unknown cost center");
    if (!label || !Number.isSafeInteger(amountXof) || amountXof <= 0) {
      throw new BadRequestException("Invalid account credit");
    }
    const credit = await tx.invoice.create({
      data: {
        studentId,
        termId: term.id,
        totalAmount: -amountXof,
        status: "paid",
        description: `${kind === "scholarship" ? "Scholarship" : "Discount"} — ${label}`,
        costCenterCode,
        packageType: "credit",
        academicYearLabel: term.academicYear?.label ?? null,
      },
    });
    return { creditId: credit.id, amountXof };
  }
}
