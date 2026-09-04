import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, type ApprovalRequestKind } from "@mydaust/db";
import {
  AcademicCatalogDraftInput,
  COST_CENTER_TUITION,
  toDakarDateKey,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { requirePersonEmail } from "../auth/person-email.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { projectedInstallmentStatus } from "./account-position.js";
import {
  CORE_FEE_COMPONENTS,
  displayFeeComponentLabel,
  feePackageTotalXof,
  splitEvenlyXof,
  requireCoreFeeComponents,
  validateFeeComponents,
  type FeeComponentDefinition,
} from "./fee-components.js";
import { OperatingBudgetService } from "./operating-budget.service.js";
import {
  syncEnrollmentGateInTransaction,
  type EnrollmentActivation,
} from "./admission-payment-gate.js";
import { FinanceService } from "./finance.service.js";
import {
  BillingProfileService,
  type BillingCatalogChangeInput,
  type BillingProfileChangeInput,
} from "./billing-profile.service.js";
import { validateCanonicalAcademicCatalog } from "../academic-catalog/academic-catalog.service.js";
import {
  buildApprovalPresentation,
  type ApprovalPresentation,
  type ApprovalPresentationContext,
} from "./approval-presentation.js";

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

export type ProtectedChange = {
  kind: ApprovalRequestKind;
  targetType: string;
  targetId?: string;
  academicYearLabel?: string;
  reason?: string;
  after: Record<string, unknown>;
};

type StoredApproval = Prisma.ApprovalRequestGetPayload<Record<string, never>>;

/** How many approval rows may resolve their presentation subject at once. */
const PRESENT_CONCURRENCY = 8;

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

export function academicCatalogApprovalPayloadMatches(
  afterJson: unknown,
  revision: {
    id: string;
    academicYearId: string;
    revision: number;
    yearLabel: string;
    startsOn: Date | null;
    endsOn: Date | null;
    defaultLevels: unknown;
    defaultStandingRules: unknown;
    notYetGradedStanding: unknown;
    programConfigurations: unknown;
    reason: string | null;
    activateYear: boolean;
  },
) {
  const current = {
    id: revision.id,
    academicYearId: revision.academicYearId,
    revision: revision.revision,
    yearLabel: revision.yearLabel,
    startsOn: revision.startsOn?.toISOString().slice(0, 10) ?? null,
    endsOn: revision.endsOn?.toISOString().slice(0, 10) ?? null,
    defaultLevels: revision.defaultLevels,
    defaultStandingRules: revision.defaultStandingRules,
    notYetGradedStanding: revision.notYetGradedStanding,
    programs: revision.programConfigurations,
    reason: revision.reason,
    activateYear: revision.activateYear,
  };
  return (
    JSON.stringify(canonicalJson(afterJson)) ===
    JSON.stringify(canonicalJson(current))
  );
}

@Injectable()
export class FinanceApprovalsService {
  private readonly operatingBudget: OperatingBudgetService;
  private readonly billingProfiles: BillingProfileService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() operatingBudget?: OperatingBudgetService,
    @Optional() private readonly finance?: FinanceService,
    @Optional() billingProfiles?: BillingProfileService,
  ) {
    // Unit/integration tests historically instantiate this service directly.
    // Keep that seam while Nest injects the shared provider in the application.
    this.operatingBudget =
      operatingBudget ?? new OperatingBudgetService(prisma);
    this.billingProfiles = billingProfiles ?? new BillingProfileService(prisma);
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item !== "bigint") return item;
        const amount = Number(item);
        if (!Number.isSafeInteger(amount)) {
          throw new BadRequestException(
            "Approval snapshot contains an amount above the safe whole-XOF limit",
          );
        }
        return amount;
      }),
    ) as Prisma.InputJsonValue;
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

  private paymentPlanRequestMatchesCurrent(
    invoice: {
      totalAmount: number;
      plan: {
        installments: {
          id: string;
          sequence: number;
          dueDate: Date;
          amountDue: number;
          label: string | null;
          components: {
            invoiceComponentId: string;
            amountDue: number;
          }[];
        }[];
      } | null;
    },
    after: Record<string, unknown>,
  ) {
    const currentRows = invoice.plan?.installments ?? [];
    if (currentRows.length === 0 || !Array.isArray(after.installments)) {
      return false;
    }
    const mode = String(after.mode ?? "replace");
    if (!["create", "update", "replace"].includes(mode)) return false;
    const requestedRows = after.installments.filter(
      (value): value is Record<string, unknown> =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    );
    if (requestedRows.length !== after.installments.length) return false;

    type CandidateRow = {
      id: string | null;
      sequence: number;
      dueDate: string;
      amountDue: number;
      label: string | null;
      components: { invoiceComponentId: string; amountXof: number }[];
    };
    const componentRows = (
      value: unknown,
      fallback: CandidateRow["components"] = [],
    ) => {
      if (value === undefined) return fallback;
      if (!Array.isArray(value)) return [];
      return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const component = item as Record<string, unknown>;
        return [
          {
            invoiceComponentId: String(component.invoiceComponentId ?? ""),
            amountXof: Number(component.amountXof),
          },
        ];
      });
    };
    const currentCandidate = (
      row: (typeof currentRows)[number],
    ): CandidateRow => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amountDue: row.amountDue,
      label: row.label,
      components: row.components.map((component) => ({
        invoiceComponentId: component.invoiceComponentId,
        amountXof: component.amountDue,
      })),
    });
    const finalLabel = (value: unknown) => String(value ?? "").trim() || null;
    let candidateRows: CandidateRow[];
    if (mode === "create") {
      candidateRows = requestedRows.map((row) => ({
        id: null,
        sequence: Number(row.sequence),
        dueDate: String(row.dueDate ?? ""),
        amountDue:
          row.amount === undefined
            ? Math.round((invoice.totalAmount * Number(row.percent ?? 0)) / 100)
            : Number(row.amount),
        label: null,
        components: [],
      }));
    } else if (mode === "update") {
      const updates = new Map<string, Record<string, unknown>>();
      for (const row of requestedRows) {
        const id = typeof row.id === "string" ? row.id : "";
        if (!id || updates.has(id)) return false;
        updates.set(id, row);
      }
      if (
        [...updates.keys()].some(
          (id) => !currentRows.some((row) => row.id === id),
        )
      ) {
        return false;
      }
      candidateRows = currentRows.map((current) => {
        const base = currentCandidate(current);
        const update = updates.get(current.id);
        if (!update) return base;
        return {
          id: current.id,
          sequence: current.sequence,
          dueDate: String(update.dueDate ?? ""),
          amountDue: Number(update.amountDue),
          label:
            update.label === undefined
              ? current.label
              : finalLabel(update.label),
          components: componentRows(update.components, base.components),
        };
      });
    } else {
      candidateRows = requestedRows.map((row) => ({
        id: typeof row.id === "string" ? row.id : null,
        sequence: Number(row.sequence),
        dueDate: String(row.dueDate ?? ""),
        amountDue: Number(row.amountDue),
        label: finalLabel(row.label),
        components: componentRows(row.components),
      }));
    }

    if (candidateRows.length !== currentRows.length) return false;
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    const currentBySequence = new Map(
      currentRows.map((row) => [row.sequence, row]),
    );
    const matchedIds = new Set<string>();
    for (const candidate of candidateRows) {
      const current = candidate.id
        ? currentById.get(candidate.id)
        : currentBySequence.get(candidate.sequence);
      if (
        !current ||
        matchedIds.has(current.id) ||
        current.sequence !== candidate.sequence ||
        current.dueDate.toISOString().slice(0, 10) !== candidate.dueDate ||
        current.amountDue !== candidate.amountDue ||
        current.label !== candidate.label
      ) {
        return false;
      }
      matchedIds.add(current.id);
      const currentComponents = new Map(
        current.components.map((component) => [
          component.invoiceComponentId,
          component.amountDue,
        ]),
      );
      if (
        currentComponents.size !== candidate.components.length ||
        new Set(
          candidate.components.map((component) => component.invoiceComponentId),
        ).size !== candidate.components.length ||
        candidate.components.some(
          (component) =>
            currentComponents.get(component.invoiceComponentId) !==
            component.amountXof,
        )
      ) {
        return false;
      }
    }
    return matchedIds.size === currentRows.length;
  }

  private profileManagedPaymentPlanRestriction(
    invoice: {
      billingProfile: { status: string } | null;
      plan: {
        installments: {
          id: string;
          amountDue: number;
        }[];
      } | null;
    },
    after: Record<string, unknown>,
  ): string | null {
    if (invoice.billingProfile?.status !== "active") return null;
    if (String(after.mode ?? "replace") !== "update") {
      return "This invoice is controlled by the Annual profile. Only payment labels and due dates can be changed here; use the Annual profile editor for services, awards, and amounts.";
    }
    if (!Array.isArray(after.installments) || !invoice.plan) {
      return "This Annual profile payment plan cannot be changed because its approved installments could not be resolved.";
    }
    const currentById = new Map(
      invoice.plan.installments.map((installment) => [
        installment.id,
        installment,
      ]),
    );
    for (const value of after.installments) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return "This Annual profile payment-plan request is invalid.";
      }
      const row = value as Record<string, unknown>;
      const current = currentById.get(String(row.id ?? ""));
      if (!current) {
        return "Annual profile installments cannot be added, removed, or reordered here.";
      }
      if (row.components !== undefined) {
        return "Annual profile component allocations cannot be changed from the payment-plan editor.";
      }
      if (Number(row.amountDue) !== current.amountDue) {
        return "Annual profile installment amounts cannot be changed from the payment-plan editor.";
      }
    }
    return null;
  }

  private billingContext(term: {
    id: string;
    name: string;
    academicYearId: string | null;
    academicYear: { id: string; label: string } | null;
  }) {
    if (!term.academicYearId || !term.academicYear) {
      throw new BadRequestException(
        "The active billing term is not linked to an academic year",
      );
    }
    return {
      termId: term.id,
      termName: term.name,
      academicYearId: term.academicYear.id,
      academicYearLabel: term.academicYear.label,
    };
  }

  private async requestBillingContext() {
    const term = await this.prisma.term.findFirst({
      where: { academicYear: { status: "active" } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      include: { academicYear: true },
    });
    if (!term) {
      throw new BadRequestException("The active academic year has no term");
    }
    return this.billingContext(term);
  }

  private storedBillingContext(after: Record<string, unknown>) {
    const value = after.billingContext;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const context = value as Record<string, unknown>;
    const termId = String(context.termId ?? "");
    const termName = String(context.termName ?? "");
    const academicYearId = String(context.academicYearId ?? "");
    const academicYearLabel = String(context.academicYearLabel ?? "");
    return termId && termName && academicYearId && academicYearLabel
      ? { termId, termName, academicYearId, academicYearLabel }
      : null;
  }

  private async snapshot(change: ProtectedChange) {
    if (
      change.kind === "operating_budget" ||
      change.kind === "management_actual"
    ) {
      const snapshot = await this.operatingBudget.approvalSnapshot(change);
      if (snapshot) return snapshot;
    }
    if (change.kind === "global_fee_schedule") {
      const schedule = await this.prisma.feeSchedule.findFirst({
        where: {
          academicYearLabel: change.academicYearLabel,
          status: "approved",
        },
        orderBy: { revision: "desc" },
        include: {
          rows: { orderBy: { sequence: "asc" } },
          components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
        },
      });
      if (!schedule)
        throw new NotFoundException("Approved fee schedule not found");
      if (Array.isArray(change.after.components)) {
        feePackageTotalXof(
          (change.after.components as Record<string, unknown>[])
            .filter((component) => component.defaultSelected !== false)
            .map((component) => ({
              annualAmountXof: Number(component.annualAmountXof),
            })),
        );
      }
      if (this.feeScheduleRequestMatchesCurrent(schedule, change.after)) {
        throw new BadRequestException(
          "No change requested: the fee schedule already has these installments and components.",
        );
      }
      return { before: schedule, baseRevision: schedule.revision };
    }
    if (change.kind === "billing_profile") {
      if (!change.targetId) {
        throw new BadRequestException("Missing student target");
      }
      return this.billingProfiles.approvalSnapshot(
        change.targetId,
        change.after as BillingProfileChangeInput,
      );
    }
    if (change.kind === "billing_catalog") {
      return this.billingProfiles.catalogApprovalSnapshot(
        change.after as BillingCatalogChangeInput,
      );
    }
    if (change.kind === "custom_charge") {
      const studentIds = [
        ...new Set(
          Array.isArray(change.after.studentIds)
            ? change.after.studentIds.filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              )
            : [],
        ),
      ];
      if (studentIds.length === 0) {
        throw new BadRequestException("Select at least one student to charge");
      }
      const costCenterCode = String(
        change.after.costCenterCode ?? COST_CENTER_TUITION,
      );
      const [billingContext, center, students] = await Promise.all([
        this.requestBillingContext(),
        this.prisma.costCenter.findUnique({
          where: { code: costCenterCode },
          select: { code: true },
        }),
        this.prisma.student.findMany({
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
      return {
        before: null,
        baseRevision: 0,
        after: {
          ...change.after,
          ...(!Array.isArray(change.after.installments) && !change.after.dueDate
            ? { dueDate: toDakarDateKey(new Date()) }
            : {}),
          billingContext,
        },
      };
    }
    if (change.kind === "discount" || change.kind === "scholarship") {
      const studentId = String(change.after.studentId ?? change.targetId ?? "");
      if (!studentId) throw new BadRequestException("Missing student target");
      const costCenterCode = String(
        change.after.costCenterCode ?? COST_CENTER_TUITION,
      );
      const billingContext = await this.requestBillingContext();
      const [managed, center, student] = await Promise.all([
        this.prisma.annualBillingProfile.findFirst({
          where: {
            studentId,
            academicYearLabel: billingContext.academicYearLabel,
            status: "active",
          },
          select: { academicYearLabel: true },
        }),
        this.prisma.costCenter.findUnique({
          where: { code: costCenterCode },
          select: { code: true },
        }),
        this.prisma.student.findFirst({
          where: {
            id: studentId,
            recordStatus: { in: ["active", "pending_payment"] },
          },
          select: { id: true },
        }),
      ]);
      if (managed) {
        throw new BadRequestException(
          `This student's ${managed.academicYearLabel} services and awards are managed by the Annual profile. Propose this change there instead.`,
        );
      }
      if (!center) throw new BadRequestException("Unknown cost center");
      if (!student) throw new NotFoundException("Billable student not found");
      return {
        before: null,
        baseRevision: 0,
        after: { ...change.after, billingContext },
      };
    }
    if (change.kind === "charge_removal" || change.kind === "payment_plan") {
      if (!change.targetId)
        throw new BadRequestException("Missing invoice target");
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: change.targetId },
        include: {
          plan: {
            include: {
              installments: {
                orderBy: { sequence: "asc" },
                include: { components: true },
              },
            },
          },
          components: true,
          componentOverrides: true,
          billingProfile: {
            select: { id: true, status: true, academicYearLabel: true },
          },
        },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (change.kind === "charge_removal" && invoice.status === "void") {
        throw new BadRequestException(
          "No change requested: this charge is already removed.",
        );
      }
      if (
        change.kind === "charge_removal" &&
        invoice.billingProfile?.status === "active"
      ) {
        throw new BadRequestException(
          "This charge is controlled by the Annual profile and cannot be removed directly.",
        );
      }
      if (change.kind === "payment_plan") {
        const restriction = this.profileManagedPaymentPlanRestriction(
          invoice,
          change.after,
        );
        if (restriction) throw new BadRequestException(restriction);
      }
      let after = change.after;
      if (
        change.kind === "payment_plan" &&
        ["add_component", "remove_component"].includes(
          String(change.after.mode ?? ""),
        )
      ) {
        if (invoice.billingProfile?.status === "active") {
          throw new BadRequestException(
            "This annual invoice is controlled by the Annual profile. Propose service, scholarship, and adjustment changes in the Annual profile editor.",
          );
        }
        const componentKey = String(change.after.componentKey ?? "");
        const schedule = invoice.academicYearLabel
          ? await this.prisma.feeSchedule.findFirst({
              where: {
                academicYearLabel: invoice.academicYearLabel,
                status: "approved",
              },
              orderBy: { revision: "desc" },
              include: { components: true },
            })
          : null;
        const component = schedule?.components.find(
          (row) => row.key === componentKey,
        );
        if (!schedule || !component) {
          throw new BadRequestException(
            `Fee component ${componentKey} is not in the approved catalog`,
          );
        }
        const overrideByKey = new Map(
          invoice.componentOverrides.map((override) => [
            override.componentKey,
            override.included,
          ]),
        );
        const currentlyIncluded =
          overrideByKey.get(componentKey) ?? component.defaultSelected;
        const requestedIncluded = String(change.after.mode) === "add_component";
        if (currentlyIncluded === requestedIncluded) {
          throw new BadRequestException(
            `No change requested: ${component.label} is already ${requestedIncluded ? "included" : "not included"}.`,
          );
        }
        overrideByKey.set(componentKey, requestedIncluded);
        feePackageTotalXof(
          schedule.components.filter(
            (row) => overrideByKey.get(row.key) ?? row.defaultSelected,
          ),
        );
        after = {
          ...change.after,
          catalogSnapshot: {
            scheduleId: schedule.id,
            scheduleRevision: schedule.revision,
            componentId: component.id,
            key: component.key,
            label: component.label,
            annualAmountXof: component.annualAmountXof,
            costCenterCode: component.costCenterCode,
            defaultSelected: component.defaultSelected,
          },
        };
      }
      if (
        change.kind === "payment_plan" &&
        String(change.after.mode ?? "replace") === "restore_standard" &&
        !invoice.paymentPlanOverride
      ) {
        throw new BadRequestException(
          "No change requested: this invoice already uses the approved standard plan.",
        );
      }
      if (
        change.kind === "payment_plan" &&
        this.paymentPlanRequestMatchesCurrent(invoice, change.after)
      ) {
        throw new BadRequestException(
          "No change requested: the payment plan already has these dates, labels, amounts, and component allocations.",
        );
      }
      return { before: invoice, baseRevision: invoice.revision, after };
    }
    return { before: null, baseRevision: 0 };
  }

  /** Bursars submit; admins use the same record and immediately self-approve it. */
  async request(actor: AuthUser, change: ProtectedChange) {
    const {
      before,
      baseRevision,
      after = change.after,
    } = await this.snapshot(change);
    const request = await this.transaction(async (tx) => {
      if (
        ((change.kind === "payment_plan" ||
          change.kind === "management_actual" ||
          change.kind === "billing_profile" ||
          change.kind === "billing_catalog") &&
          change.targetId) ||
        change.kind === "operating_budget"
      ) {
        const pending = await tx.approvalRequest.findFirst({
          where: {
            kind: change.kind,
            targetType: change.targetType,
            ...(change.targetId ? { targetId: change.targetId } : {}),
            status: "pending",
          },
          select: { id: true },
        });
        if (pending) {
          throw new BadRequestException(
            "A change for this billing is already awaiting Director approval",
          );
        }
      }
      const created = await tx.approvalRequest.create({
        data: {
          kind: change.kind,
          status: "pending",
          targetType: change.targetType,
          targetId: change.targetId,
          academicYearLabel:
            change.academicYearLabel ??
            this.storedBillingContext(after)?.academicYearLabel,
          reason:
            change.reason?.trim() ||
            `Requested ${change.kind.replaceAll("_", " ")}`,
          beforeJson: before === null ? Prisma.JsonNull : this.asJson(before),
          afterJson: this.asJson(after),
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
      if (change.kind === "operating_budget") {
        const budgetAfter = after as Record<string, unknown>;
        const budgetId = String(budgetAfter.budgetId ?? change.targetId ?? "");
        await this.operatingBudget.markSubmitted(
          tx,
          budgetId,
          created.id,
          Number(budgetAfter.draftContentVersion),
          String(budgetAfter.draftContentHash ?? ""),
        );
      }
      return created;
    });
    if (actor.roles.includes("admin")) {
      let decision;
      try {
        decision = await this.approve(
          request.id,
          actor,
          "Director-originated change",
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
          `Director-originated change was not applied: ${detail}`,
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
        request: await this.present(applied),
        result: decision.result ?? null,
      };
    }
    return {
      applied: false,
      request: await this.present(request),
      result: null,
    };
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
    // present() resolves each row's subject with its own lookups, so the history
    // view (every request ever recorded) would otherwise fan out to hundreds of
    // concurrent queries on a single page load. Walk it in bounded batches: the
    // row set is returned whole, only the fan-out is capped.
    const presented = [];
    for (let index = 0; index < rows.length; index += PRESENT_CONCURRENCY) {
      presented.push(
        ...(await Promise.all(
          rows
            .slice(index, index + PRESENT_CONCURRENCY)
            .map((row) => this.present(row)),
        )),
      );
    }
    return presented;
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

  private async approvalPresentation(row: {
    kind: ApprovalRequestKind;
    status: string;
    targetType: string;
    targetId: string | null;
    academicYearLabel: string | null;
    beforeJson: unknown;
    afterJson: unknown;
    events?: unknown[];
  }): Promise<ApprovalPresentation> {
    const after =
      row.afterJson && typeof row.afterJson === "object"
        ? ({ ...(row.afterJson as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};
    const academicYearLabel = [
      row.academicYearLabel,
      after.academicYearLabel,
      after.yearLabel,
    ].find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
    const academicYearSubject: Partial<Record<ApprovalRequestKind, string>> =
      academicYearLabel
        ? {
            academic_catalog: `${academicYearLabel} academic catalog`,
            global_fee_schedule: `${academicYearLabel} fee schedule`,
            billing_catalog: `${academicYearLabel} billing catalog`,
            operating_budget: `${academicYearLabel} operating budget`,
          }
        : {};
    const context: ApprovalPresentationContext = {
      subject: academicYearSubject[row.kind] ?? "Approval request",
    };
    try {
      const studentIds = new Set<string>();
      if (row.targetType === "Student" && row.targetId) {
        studentIds.add(row.targetId);
      }
      if (typeof after.studentId === "string") studentIds.add(after.studentId);
      if (Array.isArray(after.studentIds)) {
        for (const id of after.studentIds) {
          if (typeof id === "string") studentIds.add(id);
        }
      }
      if (
        [
          "custom_charge",
          "discount",
          "scholarship",
          "billing_profile",
          "student_enrollment_override",
        ].includes(row.kind) &&
        studentIds.size === 0
      ) {
        throw new Error("Approval student subject is missing");
      }

      if (
        row.targetId &&
        (row.targetType === "Invoice" ||
          row.kind === "payment_plan" ||
          row.kind === "charge_removal")
      ) {
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: row.targetId },
          select: {
            number: true,
            description: true,
            studentId: true,
            components: {
              select: { id: true, kind: true, label: true },
            },
            student: {
              select: {
                studentNo: true,
                person: { select: { firstName: true, lastName: true } },
              },
            },
          },
        });
        if (!invoice) {
          throw new Error("Approval invoice could not be resolved");
        }
        {
          const studentName =
            `${invoice.student.person.firstName} ${invoice.student.person.lastName}`
              .replace(/\s+/g, " ")
              .trim();
          context.invoiceLabel =
            invoice.description || invoice.number || "Student charge";
          context.componentLabels = Object.fromEntries(
            invoice.components.map((component) => [
              component.id,
              component.label || displayFeeComponentLabel(component.kind),
            ]),
          );
          context.subject = `${studentName} · ${invoice.student.studentNo} · ${context.invoiceLabel}`;
          studentIds.add(invoice.studentId);
        }
      }

      if (studentIds.size > 0) {
        const students = await this.prisma.student.findMany({
          where: { id: { in: [...studentIds] } },
          orderBy: { studentNo: "asc" },
          select: {
            id: true,
            studentNo: true,
            person: { select: { firstName: true, lastName: true } },
          },
        });
        if (students.length !== studentIds.size) {
          throw new Error("Approval student subjects could not be resolved");
        }
        context.studentNames = students.map((student) =>
          `${student.person.firstName} ${student.person.lastName} · ${student.studentNo}`
            .replace(/\s+/g, " ")
            .trim(),
        );
        if (
          context.subject === "Approval request" &&
          context.studentNames.length > 0
        ) {
          context.subject = context.studentNames.join(", ");
        }
      }

      if (row.kind === "student_enrollment_override" && row.targetId) {
        const section = await this.prisma.section.findUnique({
          where: { id: row.targetId },
          select: {
            sectionCode: true,
            course: { select: { code: true, title: true } },
          },
        });
        if (!section) {
          throw new Error("Approval section could not be resolved");
        }
        context.subject = `${context.studentNames?.[0] ?? "Student"} · ${section.course.code} ${section.course.title} · section ${section.sectionCode}`;
      }

      if (row.kind === "management_actual") {
        const before =
          row.beforeJson && typeof row.beforeJson === "object"
            ? (row.beforeJson as Record<string, unknown>)
            : {};
        const description = String(
          after.description ??
            before.description ??
            after.categoryLabel ??
            after.categoryKey ??
            before.managementCategoryKey ??
            before.categoryKey ??
            "",
        ).trim();
        const academicYear = String(
          row.academicYearLabel ??
            after.academicYear ??
            (before.academicYear && typeof before.academicYear === "object"
              ? (before.academicYear as Record<string, unknown>).label
              : "") ??
            "",
        ).trim();
        // A void request snapshots only {mode}, and older ones carry a bare
        // academicYearId with no label. The description still names what is
        // being voided, which is what a reviewer needs, so an unresolvable
        // year is dropped from the subject rather than making the whole
        // request unreviewable.
        if (!description) {
          throw new Error("Management actual subject could not be resolved");
        }
        const payee = String(after.payee ?? before.payee ?? "").trim();
        context.subject = [description, payee, academicYear]
          .filter(Boolean)
          .join(" · ");
      }

      if (row.kind === "payment_plan") {
        const catalog =
          after.catalogSnapshot && typeof after.catalogSnapshot === "object"
            ? (after.catalogSnapshot as Record<string, unknown>)
            : {};
        context.componentLabel =
          typeof catalog.label === "string" ? catalog.label : null;
      }

      if (row.kind === "billing_profile") {
        const academicYearLabel = String(
          row.academicYearLabel ?? after.academicYearLabel ?? "",
        );
        const optionCodes: Array<["housing" | "cafeteria", string]> = [];
        if (typeof after.housingOptionCode === "string") {
          optionCodes.push(["housing", after.housingOptionCode]);
        }
        if (typeof after.cafeteriaOptionCode === "string") {
          optionCodes.push(["cafeteria", after.cafeteriaOptionCode]);
        }
        const options = academicYearLabel
          ? await this.prisma.billingServiceOption.findMany({
              where: {
                academicYearLabel,
                OR: optionCodes.map(([kind, code]) => ({ kind, code })),
              },
              select: { kind: true, code: true, label: true },
            })
          : [];
        if (options.length !== optionCodes.length) {
          throw new Error(
            "Annual profile service options could not be resolved",
          );
        }
        after.housingOptionLabel =
          options.find((option) => option.kind === "housing")?.label ??
          after.housingOptionCode;
        after.cafeteriaOptionLabel =
          options.find((option) => option.kind === "cafeteria")?.label ??
          after.cafeteriaOptionCode;
        const awardIds = Array.isArray(after.awardDefinitionIds)
          ? after.awardDefinitionIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [];
        const definitions = awardIds.length
          ? await this.prisma.billingAdjustmentDefinition.findMany({
              where: { id: { in: awardIds } },
              orderBy: { sortOrder: "asc" },
              select: { label: true },
            })
          : [];
        if (definitions.length !== new Set(awardIds).size) {
          throw new Error("Annual profile awards could not be resolved");
        }
        const manualLabels = Array.isArray(after.manualAdjustments)
          ? after.manualAdjustments.flatMap((value) => {
              if (!value || typeof value !== "object") return [];
              const label = (value as Record<string, unknown>).label;
              return typeof label === "string" ? [label] : [];
            })
          : [];
        after.awardSummary =
          [
            ...definitions.map((definition) => definition.label),
            ...manualLabels,
          ].join(", ") || "None";
      }

      if (context.subject === "Approval request") {
        throw new Error("Approval subject could not be resolved");
      }
      return buildApprovalPresentation({ ...row, afterJson: after }, context);
    } catch {
      return {
        subject: context.subject,
        summary: "This request cannot be reviewed safely.",
        changes: [],
        canApprove: false,
        blockingMessage:
          "The human-readable review details could not be resolved. Reload the request or contact IT; this request cannot be approved as-is.",
      };
    }
  }

  private async present(row: {
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
    requestedBy?: { firstName: string; lastName: string; email: string | null };
    reviewedBy?: {
      firstName: string;
      lastName: string;
      email: string | null;
    } | null;
    events?: unknown[];
  }) {
    return {
      ...row,
      presentation: await this.approvalPresentation(row),
      requester: row.requestedBy
        ? {
            name: `${row.requestedBy.firstName} ${row.requestedBy.lastName}`.trim(),
            email: requirePersonEmail(
              row.requestedBy.email,
              "Approval requester",
            ),
          }
        : null,
      reviewer: row.reviewedBy
        ? {
            name: `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}`.trim(),
            email: requirePersonEmail(
              row.reviewedBy.email,
              "Approval reviewer",
            ),
          }
        : null,
      requestedBy: undefined,
      reviewedBy: undefined,
    };
  }

  async approve(id: string, actor: AuthUser, note?: string) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only a Director can approve changes");
    }
    const reviewRequest = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!reviewRequest)
      throw new NotFoundException("Approval request not found");
    if (reviewRequest.status === "pending") {
      const presentation = await this.approvalPresentation(reviewRequest);
      if (!presentation.canApprove) {
        throw new BadRequestException(
          presentation.blockingMessage ??
            "A human-readable review summary is required before approval",
        );
      }
    }
    const outcome = await this.transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
      if (request.kind === "student_enrollment_override") {
        throw new BadRequestException(
          "Enrollment override requests are approved through /academics/enrollment-overrides/:id/approve with explicit gate waivers",
        );
      }
      if (request.status !== "pending") {
        throw new BadRequestException(`Request is already ${request.status}`);
      }
      if (request.kind === "academic_catalog" && request.targetId) {
        await this.lockAcademicCatalogYear(tx, request.targetId);
      }
      const staleReason = await this.staleReason(tx, request);
      if (staleReason) {
        await this.operatingBudget.markDecision(
          tx,
          request,
          "stale",
          actor.personId,
        );
        if (request.kind === "academic_catalog" && request.targetId) {
          await tx.academicCatalogRevision.updateMany({
            where: { id: request.targetId, status: "pending" },
            data: { status: "rejected" },
          });
        }
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
        return {
          response: {
            ok: false,
            id,
            status: stale.status,
            reason: staleReason,
          },
          activations: [] as EnrollmentActivation[],
        };
      }

      const result = await this.apply(tx, request, actor.personId);
      const activations: EnrollmentActivation[] = [];
      const gateInvoiceIds = new Set<string>();
      if (request.kind === "payment_plan" && request.targetId) {
        gateInvoiceIds.add(request.targetId);
      } else if (request.kind === "billing_profile") {
        const invoiceId =
          result &&
          typeof result === "object" &&
          "canonicalInvoiceId" in result &&
          typeof result.canonicalInvoiceId === "string"
            ? result.canonicalInvoiceId
            : null;
        if (invoiceId) gateInvoiceIds.add(invoiceId);
      } else if (request.kind === "global_fee_schedule") {
        const pending = await tx.applicant.findMany({
          where: {
            onboardingStatus: "payment_pending",
            enrollmentInvoiceId: { not: null },
          },
          select: { enrollmentInvoiceId: true },
        });
        for (const applicant of pending) {
          if (applicant.enrollmentInvoiceId) {
            gateInvoiceIds.add(applicant.enrollmentInvoiceId);
          }
        }
      }
      for (const invoiceId of gateInvoiceIds) {
        const gate = await syncEnrollmentGateInTransaction(tx, {
          invoiceId,
          actorId: actor.personId,
        });
        if (gate?.activation) activations.push(gate.activation);
      }
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
      return {
        response: { ok: true, id, status: updated.status, result },
        activations,
      };
    });
    return outcome.response;
  }

  async reject(id: string, actor: AuthUser, note: string) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only a Director can reject changes");
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
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
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
      await this.operatingBudget.markDecision(tx, request, status, actorId);
      if (request.kind === "academic_catalog" && request.targetId) {
        await tx.academicCatalogRevision.updateMany({
          where: { id: request.targetId, status: "pending" },
          data: { status: status === "rejected" ? "rejected" : "cancelled" },
        });
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
    if (request.kind === "academic_catalog") {
      const revision = request.targetId
        ? await tx.academicCatalogRevision.findUnique({
            where: { id: request.targetId },
          })
        : null;
      if (!revision || revision.status !== "pending") {
        return "The academic catalog draft is no longer awaiting approval";
      }
      if (!academicCatalogApprovalPayloadMatches(request.afterJson, revision)) {
        return "The pending academic catalog payload changed after it was submitted";
      }
      const approved = await tx.academicCatalogRevision.findFirst({
        where: {
          academicYearId: revision.academicYearId,
          status: "approved",
        },
        orderBy: { revision: "desc" },
      });
      return (approved?.revision ?? 0) === request.baseRevision
        ? null
        : "The approved academic catalog changed after this revision was submitted";
    }
    if (
      request.kind === "operating_budget" ||
      request.kind === "management_actual"
    ) {
      return this.operatingBudget.approvalStaleReason(tx, request);
    }
    if (request.kind === "global_fee_schedule") {
      const schedule = await tx.feeSchedule.findFirst({
        where: {
          academicYearLabel: request.academicYearLabel ?? undefined,
          status: "approved",
        },
        orderBy: { revision: "desc" },
        include: {
          rows: { orderBy: { sequence: "asc" } },
          components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
        },
      });
      if (schedule?.revision !== request.baseRevision) {
        return "The approved fee schedule changed after this request was submitted";
      }
      return this.feeScheduleRequestMatchesCurrent(
        schedule,
        request.afterJson as Record<string, unknown>,
      )
        ? "The approved fee schedule already matches this request; there is no change to apply"
        : null;
    }
    if (request.kind === "billing_profile") {
      if (!request.targetId || !request.academicYearLabel) {
        return "The billing profile request is missing its student or academic year";
      }
      return this.billingProfiles.staleReason(
        tx,
        request.targetId,
        request.academicYearLabel,
        request.baseRevision,
        request.afterJson as BillingProfileChangeInput,
      );
    }
    if (request.kind === "billing_catalog") {
      const after = request.afterJson as Record<string, unknown>;
      const academicYearLabel = String(
        request.academicYearLabel ?? after.academicYearLabel ?? "",
      );
      const fingerprint = String(after.expectedCatalogFingerprint ?? "");
      if (!academicYearLabel || !fingerprint) {
        return "The billing catalog request is missing its version claim";
      }
      return this.billingProfiles.catalogStaleReason(
        tx,
        academicYearLabel,
        fingerprint,
      );
    }
    if (
      request.kind === "custom_charge" ||
      request.kind === "discount" ||
      request.kind === "scholarship"
    ) {
      const after = request.afterJson as Record<string, unknown>;
      const frozen = this.storedBillingContext(after);
      if (!frozen) {
        return "The request is missing its reviewed billing term and academic year";
      }
      let active;
      try {
        active = this.billingContext(await this.activeTerm(tx));
      } catch (error) {
        if (error instanceof BadRequestException) {
          return "The reviewed billing term is no longer active";
        }
        throw error;
      }
      if (
        active.termId !== frozen.termId ||
        active.termName !== frozen.termName ||
        active.academicYearId !== frozen.academicYearId ||
        active.academicYearLabel !== frozen.academicYearLabel
      ) {
        return `The active billing period changed from ${frozen.termName} · ${frozen.academicYearLabel} to ${active.termName} · ${active.academicYearLabel}`;
      }
      const costCenterCode = String(
        after.costCenterCode ?? COST_CENTER_TUITION,
      );
      const center = await tx.costCenter.findUnique({
        where: { code: costCenterCode },
        select: { code: true },
      });
      if (!center) return "The reviewed cost center no longer exists";
      if (request.kind === "custom_charge") {
        const studentIds = [
          ...new Set(
            Array.isArray(after.studentIds)
              ? after.studentIds.filter(
                  (id): id is string => typeof id === "string" && id.length > 0,
                )
              : [],
          ),
        ];
        if (studentIds.length === 0) {
          return "The charge request no longer identifies any students";
        }
        const students = await tx.student.findMany({
          where: { id: { in: studentIds }, recordStatus: "active" },
          select: { id: true },
        });
        return students.length === studentIds.length
          ? null
          : "One or more reviewed students are now missing or archived";
      }
      if (request.kind === "discount" || request.kind === "scholarship") {
        const studentId = String(after.studentId ?? request.targetId ?? "");
        const student = studentId
          ? await tx.student.findFirst({
              where: {
                id: studentId,
                recordStatus: { in: ["active", "pending_payment"] },
              },
              select: { id: true },
            })
          : null;
        if (!student) return "The reviewed student is now missing or archived";
        const managed = studentId
          ? await tx.annualBillingProfile.findFirst({
              where: {
                studentId,
                academicYearLabel: frozen.academicYearLabel,
                status: "active",
              },
              select: { id: true },
            })
          : null;
        if (managed) {
          return "The Annual profile now controls awards and adjustments for this student";
        }
      }
      return null;
    }
    if (request.kind === "payment_plan" || request.kind === "charge_removal") {
      const invoice = request.targetId
        ? await tx.invoice.findUnique({
            where: { id: request.targetId },
            include: {
              billingProfile: { select: { status: true } },
              componentOverrides: true,
              components: true,
              plan: {
                include: {
                  installments: {
                    orderBy: { sequence: "asc" },
                    include: { components: true },
                  },
                },
              },
            },
          })
        : null;
      if (!invoice) return "The target invoice no longer exists";
      if (invoice.revision !== request.baseRevision) {
        return "The student billing changed after this request was submitted";
      }
      if (request.kind === "charge_removal") {
        if (invoice.billingProfile?.status === "active") {
          return "The Annual profile now controls this charge";
        }
        return invoice.status === "void"
          ? "The charge was already removed"
          : null;
      }
      const after = request.afterJson as Record<string, unknown>;
      const mode = String(after.mode ?? "replace");
      const restriction = this.profileManagedPaymentPlanRestriction(
        invoice,
        after,
      );
      if (restriction) return restriction;
      if (mode === "add_component" || mode === "remove_component") {
        if (invoice.billingProfile?.status === "active") {
          return "The Annual profile now controls service and award changes for this invoice";
        }
        const componentKey = String(after.componentKey ?? "");
        const snapshot = (after.catalogSnapshot ?? {}) as Record<
          string,
          unknown
        >;
        const override = invoice.componentOverrides.find(
          (row) => row.componentKey === componentKey,
        );
        const currentlyIncluded =
          override?.included ?? Boolean(snapshot.defaultSelected);
        const requestedIncluded = mode === "add_component";
        if (currentlyIncluded === requestedIncluded) {
          return `${String(snapshot.label ?? displayFeeComponentLabel(componentKey))} is already ${requestedIncluded ? "included" : "not included"}; there is no change to apply`;
        }
      }
      if (mode === "restore_standard" && !invoice.paymentPlanOverride) {
        return "The invoice already uses the approved standard plan";
      }
      if (
        this.paymentPlanRequestMatchesCurrent(
          invoice,
          request.afterJson as Record<string, unknown>,
        )
      ) {
        return "The approved payment plan already matches this request; there is no change to apply";
      }
      return null;
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
      case "academic_catalog":
        return this.applyAcademicCatalog(tx, request, actorId);
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
      case "billing_profile":
        return this.billingProfiles.applyApprovedChange(tx, {
          studentId: request.targetId!,
          actorId,
          approvalRequestId: request.id,
          change: after as BillingProfileChangeInput,
        });
      case "billing_catalog":
        return this.billingProfiles.applyCatalogChange(
          tx,
          after as BillingCatalogChangeInput,
          actorId,
          request.id,
        );
      case "discount":
      case "scholarship":
        return this.applyCredit(tx, after, request.kind);
      case "operating_budget":
      case "management_actual":
        return this.operatingBudget.applyApproval(tx, request, actorId);
    }
  }

  private async applyAcademicCatalog(
    tx: Prisma.TransactionClient,
    request: StoredApproval,
    actorId: string,
  ) {
    if (!request.targetId) {
      throw new BadRequestException(
        "Academic catalog revision target is missing",
      );
    }
    await this.lockAcademicCatalogYear(tx, request.targetId);
    const revision = await tx.academicCatalogRevision.findUnique({
      where: { id: request.targetId },
    });
    if (!revision || revision.status !== "pending") {
      throw new BadRequestException(
        "Academic catalog revision is no longer awaiting approval",
      );
    }
    if (!academicCatalogApprovalPayloadMatches(request.afterJson, revision)) {
      throw new BadRequestException(
        "The pending academic catalog payload changed after it was submitted",
      );
    }
    const draft = AcademicCatalogDraftInput.parse({
      yearLabel: revision.yearLabel,
      startsOn: revision.startsOn?.toISOString().slice(0, 10) ?? null,
      endsOn: revision.endsOn?.toISOString().slice(0, 10) ?? null,
      defaultLevels: revision.defaultLevels,
      defaultStandingRules: revision.defaultStandingRules,
      notYetGradedStanding: revision.notYetGradedStanding,
      programs: revision.programConfigurations,
      reason: revision.reason,
      activateYear: revision.activateYear,
    });
    const referencedCourseIds = [
      ...new Set(
        draft.programs.flatMap((program) =>
          program.curriculum.map((entry) => entry.courseId),
        ),
      ),
    ].sort();
    for (const courseId of referencedCourseIds) {
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "Course"
        WHERE id = ${courseId}
        FOR SHARE
      `;
    }
    const parsed = await validateCanonicalAcademicCatalog(tx, draft);
    const currentPrograms = await tx.program.findMany({
      select: { id: true },
    });
    const configuredProgramIds = new Set(
      parsed.programs.map((program) => program.programId),
    );
    if (
      currentPrograms.length !== parsed.programs.length ||
      currentPrograms.some((program) => !configuredProgramIds.has(program.id))
    ) {
      throw new BadRequestException(
        "The programme catalog changed after this revision was submitted",
      );
    }
    const duplicateLabel = await tx.academicYear.findFirst({
      where: {
        label: revision.yearLabel,
        id: { not: revision.academicYearId },
      },
      select: { id: true },
    });
    if (duplicateLabel) {
      throw new BadRequestException(
        `Academic year label ${revision.yearLabel} is already in use`,
      );
    }
    await tx.academicCatalogRevision.updateMany({
      where: {
        academicYearId: revision.academicYearId,
        status: "approved",
        id: { not: revision.id },
      },
      data: { status: "superseded" },
    });
    const approvedAt = new Date();
    await tx.academicCatalogRevision.update({
      where: { id: revision.id },
      data: { status: "approved", approvedById: actorId, approvedAt },
    });
    if (revision.activateYear) {
      await tx.academicYear.updateMany({
        where: { status: "active", id: { not: revision.academicYearId } },
        data: { status: "archived" },
      });
    }
    const previousYear = await tx.academicYear.findUniqueOrThrow({
      where: { id: revision.academicYearId },
    });
    const year = await tx.academicYear.update({
      where: { id: revision.academicYearId },
      data: {
        label: revision.yearLabel,
        startsOn: revision.startsOn,
        endsOn: revision.endsOn,
        ...(revision.activateYear ? { status: "active" } : {}),
      },
    });
    await tx.programRequirement.deleteMany({
      where: {
        catalogYear: {
          in: [...new Set([previousYear.label, year.label])],
        },
      },
    });
    const requirementRows = parsed.programs.flatMap((program) =>
      program.requirements.map((requirement, position) => ({
        programId: program.programId,
        catalogYear: year.label,
        category: requirement.category,
        requiredCredits: requirement.requiredCredits,
        position,
      })),
    );
    if (requirementRows.length > 0) {
      await tx.programRequirement.createMany({ data: requirementRows });
    }
    let curriculumEntries = 0;
    for (const program of parsed.programs) {
      const curriculum = await tx.curriculum.upsert({
        where: {
          programId_academicYearId: {
            programId: program.programId,
            academicYearId: year.id,
          },
        },
        update: {},
        create: {
          programId: program.programId,
          academicYearId: year.id,
        },
      });
      await tx.curriculumEntry.deleteMany({
        where: { curriculumId: curriculum.id },
      });
      if (program.curriculum.length > 0) {
        await tx.curriculumEntry.createMany({
          data: program.curriculum.map((entry) => ({
            curriculumId: curriculum.id,
            courseId: entry.courseId,
            yearIndex: entry.yearIndex,
            semester: entry.semester,
            position: entry.position,
          })),
        });
      }
      curriculumEntries += program.curriculum.length;
    }
    await tx.student.updateMany({
      where: { catalogYearId: year.id },
      data: { catalogYear: year.label },
    });
    await tx.auditLog.create({
      data: {
        entity: "AcademicCatalogRevision",
        entityId: revision.id,
        action: "approved-curricula-synced",
        actorId,
        data: {
          approvalRequestId: request.id,
          academicYearId: year.id,
          programs: parsed.programs.length,
          curriculumEntries,
        },
      },
    });
    return {
      academicYearId: year.id,
      label: year.label,
      revision: revision.revision,
      levels: parsed.defaultLevels.length,
      programs: parsed.programs.length,
      curriculumEntries,
    };
  }

  private async lockAcademicCatalogYear(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ) {
    const candidate = await tx.academicCatalogRevision.findUnique({
      where: { id: revisionId },
      select: { academicYearId: true },
    });
    if (!candidate) {
      throw new BadRequestException(
        "Academic catalog revision is no longer awaiting approval",
      );
    }
    const lockedYear = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "AcademicYear"
      WHERE id = ${candidate.academicYearId}
      FOR UPDATE
    `;
    if (!lockedYear[0]) {
      throw new BadRequestException(
        "The academic year for this catalog revision no longer exists",
      );
    }
  }

  private normalizedLegacyScheduleRow(
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

  private feeScheduleRequestMatchesCurrent(
    schedule: {
      rows: {
        id: string;
        label: string;
        sequence: number;
        dueOn: Date | null;
        amountFullXof: number;
        amountTuitionXof: number;
        amountHousingXof: number;
        amountCafeteriaXof: number;
      }[];
      components: {
        id: string;
        key: string;
        label: string;
        description: string | null;
        costCenterCode: string;
        annualAmountXof: number;
        defaultSelected: boolean;
        sortOrder: number;
      }[];
    },
    after: Record<string, unknown>,
  ) {
    if (schedule.rows.length === 0 || schedule.components.length === 0) {
      // Applying an old component-less schedule upgrades its canonical shape.
      return false;
    }
    let candidateRows: Array<
      (typeof schedule.rows)[number] &
        ReturnType<FinanceApprovalsService["normalizedLegacyScheduleRow"]>
    >;
    try {
      if (Array.isArray(after.rows)) {
        if (after.rows.length !== schedule.rows.length) return false;
        const requestedById = new Map(
          after.rows.flatMap((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              return [];
            }
            const row = value as Record<string, unknown>;
            return [[String(row.id ?? ""), row] as const];
          }),
        );
        if (requestedById.size !== schedule.rows.length) return false;
        candidateRows = schedule.rows.map((row) => {
          const requested = requestedById.get(row.id);
          if (!requested) throw new Error("missing schedule row");
          return {
            ...row,
            ...this.normalizedLegacyScheduleRow(row, requested),
          };
        });
      } else {
        const rowId = String(after.rowId ?? "");
        const requested =
          after.input &&
          typeof after.input === "object" &&
          !Array.isArray(after.input)
            ? (after.input as Record<string, unknown>)
            : {};
        const changed = schedule.rows.find((row) => row.id === rowId);
        if (!changed) return false;
        candidateRows = schedule.rows.map((row) =>
          row.id === changed.id
            ? {
                ...row,
                ...this.normalizedLegacyScheduleRow(row, requested),
              }
            : row,
        );
      }
    } catch {
      return false;
    }

    let candidateComponents: FeeComponentDefinition[];
    if (Array.isArray(after.components)) {
      const existingById = new Map(
        schedule.components.map((component) => [component.id, component]),
      );
      const existingByKey = new Map(
        schedule.components.map((component) => [component.key, component]),
      );
      const rawComponents = after.components.flatMap((value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? [value as Record<string, unknown>]
          : [],
      );
      if (rawComponents.length !== after.components.length) return false;
      const projected: FeeComponentDefinition[] = [];
      for (const [index, raw] of rawComponents.entries()) {
        const id = raw.id === undefined ? null : String(raw.id);
        const requestedKey = String(raw.key ?? "");
        const existing = id
          ? existingById.get(id)
          : existingByKey.get(requestedKey);
        if (
          !existing ||
          (id && requestedKey && requestedKey !== existing.key)
        ) {
          return false;
        }
        projected.push({
          id,
          key: String(raw.key ?? existing.key),
          label: String(raw.label ?? existing.label),
          description:
            raw.description === undefined
              ? existing.description
              : raw.description === null
                ? null
                : String(raw.description),
          costCenterCode: String(raw.costCenterCode ?? existing.costCenterCode),
          annualAmountXof: Number(
            raw.annualAmountXof ?? existing.annualAmountXof,
          ),
          defaultSelected:
            raw.defaultSelected === undefined
              ? existing.defaultSelected
              : Boolean(raw.defaultSelected),
          sortOrder: Number(raw.sortOrder ?? existing.sortOrder ?? index),
        });
      }
      try {
        candidateComponents = requireCoreFeeComponents(
          validateFeeComponents(projected),
        );
      } catch {
        return false;
      }
    } else {
      const annualCoreTotals = new Map([
        [
          "tuition",
          candidateRows.reduce((sum, row) => sum + row.amountTuitionXof, 0),
        ],
        [
          "housing",
          candidateRows.reduce((sum, row) => sum + row.amountHousingXof, 0),
        ],
        [
          "cafeteria",
          candidateRows.reduce((sum, row) => sum + row.amountCafeteriaXof, 0),
        ],
      ]);
      candidateComponents = schedule.components.map((component) => ({
        ...component,
        annualAmountXof:
          annualCoreTotals.get(component.key) ?? component.annualAmountXof,
      }));
    }

    const currentComponentsByKey = new Map(
      schedule.components.map((component) => [component.key, component]),
    );
    if (
      candidateComponents.length !== schedule.components.length ||
      candidateComponents.some((component) => {
        const current = currentComponentsByKey.get(component.key);
        return (
          !current ||
          current.label !== component.label ||
          current.description !== (component.description ?? null) ||
          current.costCenterCode !== component.costCenterCode ||
          current.annualAmountXof !== component.annualAmountXof ||
          current.defaultSelected !== component.defaultSelected ||
          current.sortOrder !== component.sortOrder
        );
      })
    ) {
      return false;
    }

    const selected = candidateComponents.filter(
      (component) => component.defaultSelected,
    );
    if (selected.length === 0) return false;
    let fullAmounts: number[];
    let tuitionAmounts: number[];
    let housingAmounts: number[];
    let cafeteriaAmounts: number[];
    try {
      fullAmounts = splitEvenlyXof(
        feePackageTotalXof(selected),
        candidateRows.length,
      );
      const coreAmounts = (key: string) =>
        splitEvenlyXof(
          selected.find((component) => component.key === key)
            ?.annualAmountXof ?? 0,
          candidateRows.length,
        );
      tuitionAmounts = coreAmounts("tuition");
      housingAmounts = coreAmounts("housing");
      cafeteriaAmounts = coreAmounts("cafeteria");
    } catch {
      return false;
    }
    return candidateRows.every((candidate, index) => {
      const current = schedule.rows[index];
      return (
        current?.id === candidate.id &&
        current.label === candidate.label &&
        current.dueOn?.toISOString().slice(0, 10) ===
          candidate.dueOn?.toISOString().slice(0, 10) &&
        current.amountFullXof === fullAmounts[index] &&
        current.amountTuitionXof === tuitionAmounts[index] &&
        current.amountHousingXof === housingAmounts[index] &&
        current.amountCafeteriaXof === cafeteriaAmounts[index]
      );
    });
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
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      },
    });
    const batchRows = Array.isArray(after.rows)
      ? (after.rows as Record<string, unknown>[])
      : null;
    let rowValues: typeof current.rows;
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
        return { ...row, ...this.normalizedLegacyScheduleRow(row, input) };
      });
    } else {
      const rowId = String(after.rowId ?? request.targetId ?? "");
      const input = (after.input ?? {}) as Record<string, unknown>;
      const changed = current.rows.find((row) => row.id === rowId);
      if (!changed) {
        throw new BadRequestException("Fee schedule row no longer exists");
      }
      const replacement = this.normalizedLegacyScheduleRow(changed, input);
      rowValues = current.rows.map((row) =>
        row.id === changed.id ? { ...row, ...replacement } : row,
      );
    }
    if (rowValues.some((row) => !row.dueOn)) {
      throw new BadRequestException(
        "Every approved installment needs a due date",
      );
    }
    const rawComponents = Array.isArray(after.components)
      ? (after.components as Record<string, unknown>[])
      : null;
    let componentValues: FeeComponentDefinition[];
    if (rawComponents) {
      const existingById = new Map(
        current.components.map((component) => [component.id, component]),
      );
      const existingByKey = new Map(
        current.components.map((component) => [component.key, component]),
      );
      componentValues = requireCoreFeeComponents(
        validateFeeComponents(
          rawComponents.map((raw, index) => {
            const id = raw.id === undefined ? null : String(raw.id);
            const requestedKey = String(raw.key ?? "");
            const existing = id
              ? existingById.get(id)
              : existingByKey.get(requestedKey);
            if (id && !existing) {
              throw new BadRequestException(
                "A fee component does not belong to the approved schedule",
              );
            }
            if (
              existing &&
              id &&
              requestedKey &&
              requestedKey !== existing.key
            ) {
              throw new BadRequestException(
                "A fee component ID and key must identify the same approved component",
              );
            }
            if (existing && String(raw.key ?? existing.key) !== existing.key) {
              throw new BadRequestException(
                "An existing fee component key cannot be changed; add a new component instead",
              );
            }
            if (
              existing &&
              String(raw.costCenterCode ?? existing.costCenterCode) !==
                existing.costCenterCode
            ) {
              throw new BadRequestException(
                "An existing fee component cost center cannot be changed; add a new component key so settled revenue keeps its historical classification",
              );
            }
            return {
              id,
              key: String(raw.key ?? existing?.key ?? ""),
              label: String(raw.label ?? existing?.label ?? ""),
              description:
                raw.description === undefined
                  ? existing?.description
                  : raw.description === null
                    ? null
                    : String(raw.description),
              costCenterCode: String(
                raw.costCenterCode ?? existing?.costCenterCode ?? "",
              ),
              annualAmountXof: Number(
                raw.annualAmountXof ?? existing?.annualAmountXof,
              ),
              defaultSelected:
                raw.defaultSelected === undefined
                  ? (existing?.defaultSelected ?? true)
                  : Boolean(raw.defaultSelected),
              sortOrder: Number(raw.sortOrder ?? existing?.sortOrder ?? index),
            };
          }),
        ),
      );
    } else if (current.components.length > 0) {
      // Compatibility for the former row-amount editor. If it supplied amount
      // columns, translate only the three historical components into annual totals.
      const legacyTotals = new Map([
        [
          "tuition",
          rowValues.reduce((sum, row) => sum + row.amountTuitionXof, 0),
        ],
        [
          "housing",
          rowValues.reduce((sum, row) => sum + row.amountHousingXof, 0),
        ],
        [
          "cafeteria",
          rowValues.reduce((sum, row) => sum + row.amountCafeteriaXof, 0),
        ],
      ]);
      componentValues = validateFeeComponents(
        current.components.map((component) => ({
          ...component,
          annualAmountXof:
            legacyTotals.get(component.key) ?? component.annualAmountXof,
        })),
      );
    } else {
      // Schedules created by pre-component code/tests are upgraded at first edit.
      componentValues = validateFeeComponents(
        (
          Object.keys(CORE_FEE_COMPONENTS) as Array<
            keyof typeof CORE_FEE_COMPONENTS
          >
        ).flatMap((key) => {
          const annualAmountXof = rowValues.reduce(
            (sum, row) =>
              sum +
              (key === "tuition"
                ? row.amountTuitionXof
                : key === "housing"
                  ? row.amountHousingXof
                  : row.amountCafeteriaXof),
            0,
          );
          const core = CORE_FEE_COMPONENTS[key];
          return annualAmountXof > 0
            ? [
                {
                  key,
                  ...core,
                  annualAmountXof,
                  defaultSelected: true,
                },
              ]
            : [];
        }),
      );
    }

    const costCenters = await tx.costCenter.findMany({
      where: {
        code: {
          in: [...new Set(componentValues.map((row) => row.costCenterCode))],
        },
      },
      select: { code: true },
    });
    const knownCenters = new Set(costCenters.map((row) => row.code));
    const unknownCenter = componentValues.find(
      (component) => !knownCenters.has(component.costCenterCode),
    );
    if (unknownCenter) {
      throw new BadRequestException(
        `Unknown cost center ${unknownCenter.costCenterCode} for ${unknownCenter.label}`,
      );
    }

    const selectedComponents = componentValues.filter(
      (component) => component.defaultSelected,
    );
    if (selectedComponents.length === 0) {
      throw new BadRequestException(
        "An approved package needs at least one default student charge",
      );
    }
    const packageTotalXof = feePackageTotalXof(selectedComponents);
    const installmentAmounts = splitEvenlyXof(
      packageTotalXof,
      rowValues.length,
    );
    const coreSplits = new Map(
      (["tuition", "housing", "cafeteria"] as const).map((key) => [
        key,
        splitEvenlyXof(
          selectedComponents.find((component) => component.key === key)
            ?.annualAmountXof ?? 0,
          rowValues.length,
        ),
      ]),
    );
    rowValues = rowValues.map((row, index) => ({
      ...row,
      amountFullXof: installmentAmounts[index]!,
      amountTuitionXof: coreSplits.get("tuition")![index]!,
      amountHousingXof: coreSplits.get("housing")![index]!,
      amountCafeteriaXof: coreSplits.get("cafeteria")![index]!,
    }));
    const selectedByKey = new Map(
      selectedComponents.map((component) => [component.key, component]),
    );

    const invoices = await tx.invoice.findMany({
      where: {
        feeScheduleId: current.id,
        packageType: "standard_full",
        status: { not: "void" },
        student: { recordStatus: { in: ["active", "pending_payment"] } },
        // An annual billing profile freezes the canonical invoice as an
        // explainable year-specific snapshot. A later institution-wide fee
        // schedule revision must not validate, mutate, or relink that invoice.
        billingProfile: { is: null },
      },
      include: {
        plan: {
          include: { installments: { include: { components: true } } },
        },
        components: { include: { allocations: true } },
        componentOverrides: true,
      },
    });
    const invoiceUpdates = new Map<
      string,
      {
        selectedComponents: FeeComponentDefinition[];
        selectedByKey: Map<string, FeeComponentDefinition>;
        total: number;
        installments: Array<{
          id: string;
          label: string | null;
          dueDate: Date;
          amountDue: number;
          amountPaid: number;
          sequence: number;
          components: { invoiceComponentId: string; amountDue: number }[];
        }>;
        amounts: number[];
        componentAmounts: Map<string, number>;
        preservesIndividualComponentSchedule: boolean;
      }
    >();
    for (const invoice of invoices) {
      if (!invoice.plan || invoice.plan.installments.length === 0) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} has no payment plan`,
        );
      }
      if (
        !invoice.paymentPlanOverride &&
        invoice.plan.installments.length !== rowValues.length
      ) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} does not match the approved schedule`,
        );
      }
      if (
        !invoice.paymentPlanOverride &&
        invoice.plan.installments.some(
          (installment) =>
            !rowValues.some((row) => row.sequence === installment.sequence),
        )
      ) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} has installment sequences that do not match the approved schedule`,
        );
      }
      const overrideByKey = new Map(
        invoice.componentOverrides.map((override) => [
          override.componentKey,
          override.included,
        ]),
      );
      const sortedInstallments = [...invoice.plan.installments].sort(
        (a, b) => a.sequence - b.sequence,
      );
      const preservesIndividualComponentSchedule = sortedInstallments.some(
        (installment) => installment.components.length > 0,
      );
      if (
        preservesIndividualComponentSchedule &&
        sortedInstallments.some(
          (installment) =>
            installment.components.length !== invoice.components.length,
        )
      ) {
        throw new BadRequestException(
          `Individual component schedule on ${invoice.number ?? invoice.id} is incomplete`,
        );
      }
      const invoiceSelected = preservesIndividualComponentSchedule
        ? invoice.components.map((existing) => {
            const currentDefinition = componentValues.find(
              (component) => component.key === existing.kind,
            );
            if (!currentDefinition) {
              throw new BadRequestException(
                `Fee component ${existing.kind} is used by an individual student plan and cannot be removed from the global catalog`,
              );
            }
            return currentDefinition;
          })
        : componentValues.filter(
            (component) =>
              overrideByKey.get(component.key) ?? component.defaultSelected,
          );
      if (invoiceSelected.length === 0) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} has no selected charge after applying its individual fee selections`,
        );
      }
      const invoiceSelectedByKey = new Map(
        invoiceSelected.map((component) => [component.key, component]),
      );
      const componentAmounts = new Map(
        invoiceSelected.map((component) => [
          component.key,
          preservesIndividualComponentSchedule
            ? invoice.components.find((row) => row.kind === component.key)!
                .amountXof
            : component.annualAmountXof,
        ]),
      );
      const invoiceTotal = [...componentAmounts.values()].reduce(
        (sum, amount) => sum + amount,
        0,
      );
      const amounts = preservesIndividualComponentSchedule
        ? sortedInstallments.map((installment) => installment.amountDue)
        : splitEvenlyXof(invoiceTotal, sortedInstallments.length);
      for (const [index, installment] of sortedInstallments.entries()) {
        if (amounts[index]! < installment.amountPaid) {
          throw new BadRequestException(
            `Installment ${installment.sequence} on ${invoice.number ?? invoice.id} cannot be reduced below its paid amount`,
          );
        }
      }
      if (invoiceTotal < invoice.amountPaid) {
        throw new BadRequestException(
          `Linked invoice ${invoice.number ?? invoice.id} cannot be reduced below ${invoice.amountPaid} XOF already paid`,
        );
      }
      for (const component of invoice.components) {
        const allocated = component.allocations.reduce(
          (sum, allocation) =>
            sum + allocation.amountXof - allocation.refundedAmountXof,
          0,
        );
        const newAmount = componentAmounts.get(component.kind) ?? 0;
        if (newAmount < allocated) {
          throw new BadRequestException(
            `${component.label || displayFeeComponentLabel(component.kind)} on ${invoice.number ?? invoice.id} already has ${allocated} XOF collected; resolve or refund that allocation before removing or reducing the charge`,
          );
        }
      }
      invoiceUpdates.set(invoice.id, {
        selectedComponents: invoiceSelected,
        selectedByKey: invoiceSelectedByKey,
        total: invoiceTotal,
        installments: sortedInstallments,
        amounts,
        componentAmounts,
        preservesIndividualComponentSchedule,
      });
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
        components: {
          create: componentValues.map((component) => ({
            key: component.key,
            label: component.label,
            description: component.description,
            costCenterCode: component.costCenterCode,
            annualAmountXof: component.annualAmountXof,
            defaultSelected: component.defaultSelected,
            sortOrder: component.sortOrder,
          })),
        },
      },
      include: { components: true },
    });
    await tx.feeSchedule.update({
      where: { id: current.id },
      data: { status: "superseded" },
    });

    for (const invoice of invoices) {
      const update = invoiceUpdates.get(invoice.id)!;
      for (const [index, installment] of update.installments.entries()) {
        const standardRow = rowValues.find(
          (row) => row.sequence === installment.sequence,
        );
        const dueDate =
          invoice.paymentPlanOverride || !standardRow
            ? installment.dueDate
            : standardRow.dueOn!;
        const label =
          invoice.paymentPlanOverride || !standardRow
            ? installment.label
            : standardRow.label;
        const amountDue = update.amounts[index]!;
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            label,
            dueDate,
            amountDue,
            status: projectedInstallmentStatus({
              dueDate,
              amountDue,
              amountPaid: installment.amountPaid,
            }),
          },
        });
      }
      const nextComponents = new Map(
        next.components.map((component) => [component.key, component]),
      );
      for (const existing of invoice.components) {
        if (update.selectedByKey.has(existing.kind)) continue;
        if (existing.allocations.length > 0) {
          await tx.invoiceComponent.update({
            where: { id: existing.id },
            data: { amountXof: 0, scheduleComponentId: null },
          });
        } else {
          await tx.invoiceComponent.delete({ where: { id: existing.id } });
        }
      }
      for (const component of update.selectedComponents) {
        const nextComponent = nextComponents.get(component.key)!;
        await tx.invoiceComponent.upsert({
          where: {
            invoiceId_kind: { invoiceId: invoice.id, kind: component.key },
          },
          create: {
            invoiceId: invoice.id,
            scheduleComponentId: nextComponent.id,
            kind: component.key,
            label: component.label,
            costCenterCode: component.costCenterCode,
            amountXof: update.componentAmounts.get(component.key)!,
          },
          update: {
            scheduleComponentId: nextComponent.id,
            label: component.label,
            costCenterCode: component.costCenterCode,
            amountXof: update.componentAmounts.get(component.key)!,
          },
        });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: update.total,
          feeScheduleId: next.id,
          feeScheduleRevision: next.revision,
          revision: { increment: 1 },
          status:
            invoice.amountPaid >= update.total
              ? "paid"
              : invoice.amountPaid > 0
                ? "partial"
                : "open",
        },
      });
    }
    const removedKeys = current.components
      .map((component) => component.key)
      .filter(
        (key) =>
          !["application_fee", "insurance"].includes(key) &&
          !componentValues.some((component) => component.key === key),
      );
    if (removedKeys.length > 0) {
      const protectedOverrides = await tx.invoiceComponentOverride.findFirst({
        where: {
          componentKey: { in: removedKeys },
          included: true,
          invoice: {
            academicYearLabel: current.academicYearLabel,
            packageType: "standard_full",
            status: { not: "void" },
            billingProfile: { is: null },
            student: {
              recordStatus: { in: ["active", "pending_payment"] },
            },
          },
        },
      });
      if (protectedOverrides) {
        throw new BadRequestException(
          `Fee component ${protectedOverrides.componentKey} is explicitly included on a student account and cannot be removed from the catalog; exclude it from that account first`,
        );
      }
      await tx.invoiceComponentOverride.deleteMany({
        where: {
          componentKey: { in: removedKeys },
          included: false,
          invoice: {
            academicYearLabel: current.academicYearLabel,
            packageType: "standard_full",
            billingProfile: { is: null },
          },
        },
      });
      await tx.feeItem.deleteMany({ where: { key: { in: removedKeys } } });
    }
    for (const component of componentValues) {
      await tx.feeItem.upsert({
        where: { key: component.key },
        create: {
          key: component.key,
          label: component.label,
          minXof: component.annualAmountXof,
          maxXof: null,
          period: "year",
          note: component.description,
          sortOrder: component.sortOrder,
        },
        update: {
          label: component.label,
          minXof: component.annualAmountXof,
          maxXof: null,
          period: "year",
          note: component.description,
          sortOrder: component.sortOrder,
        },
      });
    }
    const totals = {
      full: packageTotalXof,
      tuition: selectedByKey.get("tuition")?.annualAmountXof ?? 0,
      housing: selectedByKey.get("housing")?.annualAmountXof ?? 0,
      cafeteria: selectedByKey.get("cafeteria")?.annualAmountXof ?? 0,
    };
    return {
      scheduleId: next.id,
      revision: next.revision,
      linkedPlansUpdated: invoices.length,
      totals,
      components: componentValues,
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

  private async reviewedBillingTerm(
    tx: Prisma.TransactionClient,
    after: Record<string, unknown>,
  ) {
    const frozen = this.storedBillingContext(after);
    if (!frozen) {
      throw new BadRequestException(
        "The request is missing its reviewed billing term and academic year",
      );
    }
    const term = await tx.term.findUnique({
      where: { id: frozen.termId },
      include: { academicYear: true },
    });
    if (!term) {
      throw new BadRequestException(
        "The reviewed billing term no longer exists",
      );
    }
    const resolved = this.billingContext(term);
    if (
      resolved.termName !== frozen.termName ||
      resolved.academicYearId !== frozen.academicYearId ||
      resolved.academicYearLabel !== frozen.academicYearLabel
    ) {
      throw new BadRequestException(
        "The reviewed billing term or academic year changed after submission",
      );
    }
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
      this.reviewedBillingTerm(tx, after),
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
        plan: {
          include: { installments: { include: { components: true } } },
        },
        components: { include: { allocations: true } },
        componentOverrides: true,
        billingProfile: {
          select: { id: true, status: true, academicYearLabel: true },
        },
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
    const profileRestriction = this.profileManagedPaymentPlanRestriction(
      invoice,
      after,
    );
    if (profileRestriction) {
      throw new BadRequestException(profileRestriction);
    }
    const profileManaged = invoice.billingProfile?.status === "active";
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
    if (mode === "add_component" || mode === "remove_component") {
      if (invoice.billingProfile?.status === "active") {
        throw new BadRequestException(
          "This annual invoice is controlled by the Annual profile. Propose service, scholarship, and adjustment changes in the Annual profile editor.",
        );
      }
      return this.applyInvoiceComponentSelection(
        tx,
        invoice,
        String(after.componentKey ?? ""),
        mode === "add_component",
        requesterId,
        (after.catalogSnapshot ?? null) as Record<string, unknown> | null,
      );
    }
    let rows: {
      id?: string;
      sequence: number;
      dueDate: string;
      amountDue: number;
      label?: string | null;
      components?: {
        invoiceComponentId: string;
        amountXof: number;
      }[];
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
              components:
                update.components ??
                current.components.map((component) => ({
                  invoiceComponentId: component.invoiceComponentId,
                  amountXof: component.amountDue,
                })),
            }
          : {
              id: current.id,
              sequence: current.sequence,
              dueDate: current.dueDate.toISOString().slice(0, 10),
              amountDue: current.amountDue,
              label: current.label,
              components: current.components.map((component) => ({
                invoiceComponentId: component.invoiceComponentId,
                amountXof: component.amountDue,
              })),
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
    rows = [...rows].sort((a, b) => a.sequence - b.sequence);
    const rowsWithComponents = rows.filter(
      (row) => (row.components?.length ?? 0) > 0,
    );
    if (
      rowsWithComponents.length > 0 &&
      rowsWithComponents.length !== rows.length
    ) {
      throw new BadRequestException(
        "Every installment must include its component amounts",
      );
    }
    const hasComponentSchedule = rowsWithComponents.length === rows.length;
    const existingHasComponentSchedule =
      invoice.plan?.installments.some(
        (installment) => installment.components.length > 0,
      ) ?? false;
    if (existingHasComponentSchedule && !hasComponentSchedule) {
      throw new BadRequestException(
        "Use restore to standard to remove an individual component schedule",
      );
    }
    const componentTotals = new Map<string, number>();
    if (hasComponentSchedule) {
      const componentIds = new Set(invoice.components.map((row) => row.id));
      for (const row of rows) {
        const components = row.components!;
        if (
          new Set(components.map((component) => component.invoiceComponentId))
            .size !== components.length ||
          components.length !== componentIds.size ||
          components.some(
            (component) =>
              !componentIds.has(component.invoiceComponentId) ||
              !Number.isSafeInteger(component.amountXof) ||
              component.amountXof < 0,
          )
        ) {
          throw new BadRequestException(
            "Installment component amounts must cover each selected charge exactly once",
          );
        }
        const rowTotal = components.reduce(
          (sum, component) => sum + component.amountXof,
          0,
        );
        if (rowTotal !== row.amountDue) {
          throw new BadRequestException(
            `Installment ${row.sequence} component amounts must equal its total`,
          );
        }
        for (const component of components) {
          componentTotals.set(
            component.invoiceComponentId,
            (componentTotals.get(component.invoiceComponentId) ?? 0) +
              component.amountXof,
          );
        }
      }
      for (const component of invoice.components) {
        const total = componentTotals.get(component.id) ?? 0;
        const allocated = component.allocations.reduce(
          (sum, allocation) =>
            sum + allocation.amountXof - allocation.refundedAmountXof,
          0,
        );
        if (!profileManaged && total <= 0) {
          throw new BadRequestException(
            `${component.label || displayFeeComponentLabel(component.kind)} must retain a positive annual amount; remove the charge from the package instead`,
          );
        }
        if (profileManaged && total !== component.amountXof) {
          throw new BadRequestException(
            `${component.label || displayFeeComponentLabel(component.kind)} is controlled by the Annual profile and cannot be changed from the payment-plan editor`,
          );
        }
        if (total < allocated) {
          throw new BadRequestException(
            `${component.label || displayFeeComponentLabel(component.kind)} cannot be reduced below ${allocated} XOF already collected`,
          );
        }
      }
    }
    if (
      invoice.packageType === "standard_full" &&
      !hasComponentSchedule &&
      !profileManaged
    ) {
      const authoritativeAmounts = splitEvenlyXof(
        invoice.totalAmount,
        rows.length,
      );
      const amountChanged = rows.some(
        (row, index) => row.amountDue !== authoritativeAmounts[index],
      );
      if (amountChanged) {
        throw new BadRequestException(
          "Annual-package installment amounts are derived from the student's selected charges; add or remove a fee component instead of editing installment amounts",
        );
      }
      rows = rows.map((row, index) => ({
        ...row,
        amountDue: authoritativeAmounts[index]!,
      }));
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
        const currentComponents = new Map(
          (current?.components ?? []).map((component) => [
            component.invoiceComponentId,
            component.amountDue,
          ]),
        );
        const requestedComponents = row.components ?? [];
        return (
          !current ||
          current.sequence !== row.sequence ||
          current.dueDate.toISOString().slice(0, 10) !== row.dueDate ||
          current.amountDue !== row.amountDue ||
          (current.label ?? "") !== (row.label?.trim() ?? "") ||
          currentComponents.size !== requestedComponents.length ||
          requestedComponents.some(
            (component) =>
              currentComponents.get(component.invoiceComponentId) !==
              component.amountXof,
          )
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
      const saved = current
        ? await tx.installment.update({ where: { id: current.id }, data })
        : await tx.installment.create({
            data: { planId: plan.id, ...data },
          });
      if (hasComponentSchedule && !profileManaged) {
        await tx.installmentComponent.deleteMany({
          where: { installmentId: saved.id },
        });
        await tx.installmentComponent.createMany({
          data: row.components!.map((component) => ({
            installmentId: saved.id,
            invoiceComponentId: component.invoiceComponentId,
            amountDue: component.amountXof,
          })),
        });
      }
    }
    const requestedTotal = rows.reduce((sum, row) => sum + row.amountDue, 0);
    const total =
      invoice.packageType === "standard_full" && !hasComponentSchedule
        ? invoice.totalAmount
        : requestedTotal;
    if (total < invoice.amountPaid) {
      throw new BadRequestException(
        "Plan total cannot be below the amount already paid",
      );
    }
    if (hasComponentSchedule && !profileManaged) {
      for (const component of invoice.components) {
        await tx.invoiceComponent.update({
          where: { id: component.id },
          data: { amountXof: componentTotals.get(component.id)! },
        });
      }
    } else if (
      invoice.packageType !== "standard_full" &&
      invoice.components.length === 0 &&
      total > 0
    ) {
      await tx.invoiceComponent.create({
        data: {
          invoiceId,
          kind: this.componentKind(invoice.costCenterCode),
          label: displayFeeComponentLabel(
            this.componentKind(invoice.costCenterCode),
          ),
          costCenterCode: invoice.costCenterCode,
          amountXof: total,
        },
      });
    } else if (
      invoice.packageType !== "standard_full" &&
      invoice.components.length > 0
    ) {
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
        ...(invoice.packageType === "standard_full" &&
        (planChanged || hasComponentSchedule)
          ? { paymentPlanOverride: true }
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
        (planChanged || hasComponentSchedule || invoice.paymentPlanOverride),
    };
  }

  private async restoreStandardPaymentPlan(
    tx: Prisma.TransactionClient,
    invoice: Prisma.InvoiceGetPayload<{
      include: {
        plan: {
          include: { installments: { include: { components: true } } };
        };
        components: { include: { allocations: true } };
        componentOverrides: true;
      };
    }>,
    requesterId: string,
  ) {
    if (invoice.packageType !== "standard_full") {
      throw new BadRequestException(
        "Only a full-package invoice can be restored to the standard schedule",
      );
    }
    if (!invoice.feeScheduleId) {
      throw new BadRequestException(
        "This legacy package is not reconciled to an approved fee catalog; Finance must resolve its component amounts before changing individual fee selections",
      );
    }
    if (!invoice.paymentPlanOverride && invoice.feeScheduleId !== null) {
      return { invoiceId: invoice.id, alreadyStandard: true };
    }
    const schedule = await tx.feeSchedule.findFirst({
      where: {
        academicYearLabel: invoice.academicYearLabel ?? undefined,
        status: "approved",
        approvedById: { not: null },
        approvedAt: { not: null },
      },
      orderBy: { revision: "desc" },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      },
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
    const overrideByKey = new Map(
      invoice.componentOverrides.map((override) => [
        override.componentKey,
        override.included,
      ]),
    );
    const selectedComponents = schedule.components.filter(
      (component) =>
        overrideByKey.get(component.key) ?? component.defaultSelected,
    );
    if (selectedComponents.length === 0) {
      throw new BadRequestException(
        "The student package must retain at least one charge",
      );
    }
    const total = feePackageTotalXof(selectedComponents);
    const amounts = splitEvenlyXof(total, schedule.rows.length);
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
          (!standard ||
            amounts[schedule.rows.indexOf(standard)]! < installment.amountPaid)
        ) {
          throw new BadRequestException(
            `Installment ${installment.sequence} cannot be restored below ${installment.amountPaid} XOF already paid`,
          );
        }
      }
    }
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
    await tx.installmentComponent.deleteMany({
      where: { installment: { planId: plan.id } },
    });
    await tx.installment.deleteMany({
      where: {
        planId: plan.id,
        sequence: { notIn: standardSequences },
        amountPaid: 0,
      },
    });
    for (const [index, row] of schedule.rows.entries()) {
      const current = existing.get(row.sequence);
      const amountDue = amounts[index]!;
      const data = {
        label: row.label,
        dueDate: row.dueOn!,
        amountDue,
        status: projectedInstallmentStatus({
          dueDate: row.dueOn!,
          amountDue,
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
    const selectedKeys = new Set(selectedComponents.map((row) => row.key));
    for (const component of invoice.components) {
      if (selectedKeys.has(component.kind)) continue;
      const allocated = component.allocations.reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      );
      if (allocated > 0) {
        throw new BadRequestException(
          `${component.label || displayFeeComponentLabel(component.kind)} has ${allocated} XOF collected and cannot be excluded`,
        );
      }
      await tx.invoiceComponent.delete({ where: { id: component.id } });
    }
    for (const component of selectedComponents) {
      const current = invoice.components.find(
        (row) => row.kind === component.key,
      );
      const allocated = (current?.allocations ?? []).reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      );
      if (component.annualAmountXof < allocated) {
        throw new BadRequestException(
          `${component.label} cannot be restored below ${allocated} XOF already collected`,
        );
      }
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: {
            invoiceId: invoice.id,
            kind: component.key,
          },
        },
        create: {
          invoiceId: invoice.id,
          scheduleComponentId: component.id,
          kind: component.key,
          label: component.label,
          costCenterCode: component.costCenterCode,
          amountXof: component.annualAmountXof,
        },
        update: {
          scheduleComponentId: component.id,
          label: component.label,
          costCenterCode: component.costCenterCode,
          amountXof: component.annualAmountXof,
        },
      });
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: total,
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
        paymentPlanOverride: false,
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

  private async applyInvoiceComponentSelection(
    tx: Prisma.TransactionClient,
    invoice: Prisma.InvoiceGetPayload<{
      include: {
        plan: {
          include: { installments: { include: { components: true } } };
        };
        components: { include: { allocations: true } };
        componentOverrides: true;
      };
    }>,
    componentKey: string,
    included: boolean,
    requesterId: string,
    catalogSnapshot: Record<string, unknown> | null,
  ) {
    if (invoice.packageType !== "standard_full") {
      throw new BadRequestException(
        "Individual fee selection is available only for the approved annual package",
      );
    }
    if (!invoice.feeScheduleId) {
      throw new BadRequestException(
        "This legacy package is not reconciled to an approved fee catalog; Finance must resolve its component amounts before changing individual fee selections",
      );
    }
    if (!invoice.academicYearLabel) {
      throw new BadRequestException(
        "The invoice has no academic year fee catalog",
      );
    }
    const schedule = await tx.feeSchedule.findFirst({
      where: {
        academicYearLabel: invoice.academicYearLabel,
        status: "approved",
      },
      orderBy: { revision: "desc" },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      },
    });
    if (!schedule) {
      throw new BadRequestException(
        "No approved fee catalog exists for this academic year",
      );
    }
    if (invoice.feeScheduleId !== schedule.id) {
      throw new BadRequestException(
        "This student package has not been reconciled to the latest approved fee catalog; reload the account or ask Finance to reconcile it before changing fee selections",
      );
    }
    const catalog = schedule.components.find(
      (component) => component.key === componentKey,
    );
    if (!catalog) {
      throw new BadRequestException(
        `Fee component ${componentKey} is no longer in the approved catalog; submit a new request`,
      );
    }
    if (
      !catalogSnapshot ||
      String(catalogSnapshot.scheduleId ?? "") !== schedule.id ||
      Number(catalogSnapshot.scheduleRevision) !== schedule.revision ||
      String(catalogSnapshot.componentId ?? "") !== catalog.id ||
      Number(catalogSnapshot.annualAmountXof) !== catalog.annualAmountXof ||
      String(catalogSnapshot.costCenterCode ?? "") !== catalog.costCenterCode ||
      Boolean(catalogSnapshot.defaultSelected) !== catalog.defaultSelected
    ) {
      throw new BadRequestException(
        "The approved fee catalog changed after this request was submitted; submit a new component request for review",
      );
    }
    const existing = invoice.components.find(
      (component) => component.kind === componentKey,
    );
    const overrideByKey = new Map(
      invoice.componentOverrides.map((override) => [
        override.componentKey,
        override.included,
      ]),
    );
    const currentlyIncluded =
      overrideByKey.get(componentKey) ?? catalog.defaultSelected;
    if (currentlyIncluded === included) {
      return {
        invoiceId: invoice.id,
        componentKey,
        included,
        alreadySelected: true,
      };
    }
    const allocatedXof = (existing?.allocations ?? []).reduce(
      (sum, allocation) =>
        sum + allocation.amountXof - allocation.refundedAmountXof,
      0,
    );
    if (!included && allocatedXof > 0) {
      throw new BadRequestException(
        `${existing?.label || catalog.label} already has ${allocatedXof} XOF collected; resolve or refund that allocation before removing the charge`,
      );
    }

    const customInstallments = [...(invoice.plan?.installments ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const hasIndividualComponentSchedule = customInstallments.some(
      (installment) => installment.components.length > 0,
    );
    if (hasIndividualComponentSchedule) {
      if (
        customInstallments.some(
          (installment) =>
            installment.components.length !== invoice.components.length,
        )
      ) {
        throw new BadRequestException(
          "The individual component schedule is incomplete and must be reconciled before changing charges",
        );
      }
      if (!included && !existing) {
        throw new BadRequestException(
          `${catalog.label} is not present on this student plan`,
        );
      }
      const addedAmounts = included
        ? splitEvenlyXof(catalog.annualAmountXof, customInstallments.length)
        : [];
      const removedAmounts = new Map(
        customInstallments.map((installment) => [
          installment.id,
          installment.components.find(
            (component) => component.invoiceComponentId === existing?.id,
          )?.amountDue ?? 0,
        ]),
      );
      const nextInstallmentAmounts = customInstallments.map(
        (installment, index) =>
          installment.amountDue +
          (included
            ? addedAmounts[index]!
            : -(removedAmounts.get(installment.id) ?? 0)),
      );
      for (const [index, installment] of customInstallments.entries()) {
        if (nextInstallmentAmounts[index]! < installment.amountPaid) {
          throw new BadRequestException(
            `Payment ${installment.sequence} cannot be reduced below ${installment.amountPaid} XOF already paid`,
          );
        }
      }
      const componentAmount = included
        ? catalog.annualAmountXof
        : existing!.amountXof;
      const total =
        invoice.totalAmount + (included ? componentAmount : -componentAmount);
      if (total <= 0 || total < invoice.amountPaid) {
        throw new BadRequestException(
          "The individual plan total cannot be reduced below money already paid",
        );
      }
      let addedComponentId: string | null = null;
      if (included) {
        const added = await tx.invoiceComponent.upsert({
          where: {
            invoiceId_kind: { invoiceId: invoice.id, kind: componentKey },
          },
          create: {
            invoiceId: invoice.id,
            scheduleComponentId: catalog.id,
            kind: catalog.key,
            label: catalog.label,
            costCenterCode: catalog.costCenterCode,
            amountXof: catalog.annualAmountXof,
          },
          update: {
            scheduleComponentId: catalog.id,
            label: catalog.label,
            costCenterCode: catalog.costCenterCode,
            amountXof: catalog.annualAmountXof,
          },
        });
        addedComponentId = added.id;
      } else {
        await tx.installmentComponent.deleteMany({
          where: { invoiceComponentId: existing!.id },
        });
        await tx.invoiceComponent.delete({ where: { id: existing!.id } });
      }
      for (const [index, installment] of customInstallments.entries()) {
        const amountDue = nextInstallmentAmounts[index]!;
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            amountDue,
            status: projectedInstallmentStatus({
              dueDate: installment.dueDate,
              amountDue,
              amountPaid: installment.amountPaid,
            }),
          },
        });
        if (included) {
          await tx.installmentComponent.create({
            data: {
              installmentId: installment.id,
              invoiceComponentId: addedComponentId!,
              amountDue: addedAmounts[index]!,
            },
          });
        }
      }
      if (included === catalog.defaultSelected) {
        await tx.invoiceComponentOverride.deleteMany({
          where: { invoiceId: invoice.id, componentKey },
        });
      } else {
        await tx.invoiceComponentOverride.upsert({
          where: {
            invoiceId_componentKey: { invoiceId: invoice.id, componentKey },
          },
          create: {
            invoiceId: invoice.id,
            componentKey,
            included,
            createdById: requesterId,
          },
          update: { included, createdById: requesterId },
        });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: total,
          paymentPlanOverride: true,
          revision: { increment: 1 },
          status:
            invoice.amountPaid >= total
              ? "paid"
              : invoice.amountPaid > 0
                ? "partial"
                : "open",
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "Invoice",
          entityId: invoice.id,
          action: included
            ? "individual-plan-component-included"
            : "individual-plan-component-excluded",
          actorId: requesterId,
          data: {
            componentKey,
            amountXof: componentAmount,
            installments: customInstallments.length,
          },
        },
      });
      return {
        invoiceId: invoice.id,
        componentKey,
        included,
        total,
        installments: customInstallments.length,
        individualComponentOverride: true,
        individualPlan: true,
      };
    }

    const selectedKeys = new Set(
      schedule.components
        .filter(
          (component) =>
            overrideByKey.get(component.key) ?? component.defaultSelected,
        )
        .map((component) => component.key),
    );
    if (included) selectedKeys.add(componentKey);
    else selectedKeys.delete(componentKey);
    if (selectedKeys.size === 0) {
      throw new BadRequestException(
        "A student annual package must retain at least one charge",
      );
    }
    const selectedCatalog = schedule.components.filter((component) =>
      selectedKeys.has(component.key),
    );
    const total = feePackageTotalXof(selectedCatalog);
    if (total < invoice.amountPaid) {
      throw new BadRequestException(
        `The selected charges total ${total} XOF, below ${invoice.amountPaid} XOF already paid; resolve or refund the excess before removing this charge`,
      );
    }
    if (!invoice.plan || invoice.plan.installments.length === 0) {
      throw new BadRequestException(
        "The annual package has no installment plan to redistribute",
      );
    }
    const sortedInstallments = [...invoice.plan.installments].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const installmentAmounts = splitEvenlyXof(total, sortedInstallments.length);
    for (const [index, installment] of sortedInstallments.entries()) {
      const amountDue = installmentAmounts[index]!;
      if (amountDue < installment.amountPaid) {
        throw new BadRequestException(
          `Installment ${installment.sequence} cannot be reduced below ${installment.amountPaid} XOF already paid; Finance must resolve that allocation before removing the charge`,
        );
      }
    }

    if (existing && !included) {
      if (existing.allocations.length > 0) {
        await tx.invoiceComponent.update({
          where: { id: existing.id },
          data: { amountXof: 0, scheduleComponentId: catalog.id },
        });
      } else {
        await tx.invoiceComponent.delete({ where: { id: existing.id } });
      }
    }
    if (included) {
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: { invoiceId: invoice.id, kind: componentKey },
        },
        create: {
          invoiceId: invoice.id,
          scheduleComponentId: catalog.id,
          kind: catalog.key,
          label: catalog.label,
          costCenterCode: catalog.costCenterCode,
          amountXof: catalog.annualAmountXof,
        },
        update: {
          scheduleComponentId: catalog.id,
          label: catalog.label,
          costCenterCode: catalog.costCenterCode,
          amountXof: catalog.annualAmountXof,
        },
      });
    }
    // Store an override only when selection differs from the current global default.
    if (included === catalog.defaultSelected) {
      await tx.invoiceComponentOverride.deleteMany({
        where: { invoiceId: invoice.id, componentKey },
      });
    } else {
      await tx.invoiceComponentOverride.upsert({
        where: {
          invoiceId_componentKey: {
            invoiceId: invoice.id,
            componentKey,
          },
        },
        create: {
          invoiceId: invoice.id,
          componentKey,
          included,
          createdById: requesterId,
        },
        update: { included, createdById: requesterId },
      });
    }
    for (const [index, installment] of sortedInstallments.entries()) {
      const amountDue = installmentAmounts[index]!;
      await tx.installment.update({
        where: { id: installment.id },
        data: {
          amountDue,
          status: projectedInstallmentStatus({
            dueDate: installment.dueDate,
            amountDue,
            amountPaid: installment.amountPaid,
          }),
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
    await tx.auditLog.create({
      data: {
        entity: "Invoice",
        entityId: invoice.id,
        action: included ? "fee-component-included" : "fee-component-excluded",
        actorId: requesterId,
        data: {
          componentKey,
          amountXof: catalog.annualAmountXof,
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
        },
      },
    });
    return {
      invoiceId: invoice.id,
      componentKey,
      included,
      total,
      installments: sortedInstallments.length,
      individualComponentOverride: included !== catalog.defaultSelected,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
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
        where: {
          id: studentId,
          recordStatus: { in: ["active", "pending_payment"] },
        },
      }),
      tx.costCenter.findUnique({ where: { code: costCenterCode } }),
      this.reviewedBillingTerm(tx, after),
    ]);
    if (!student) throw new NotFoundException("Billable student not found");
    const managedProfile = await tx.annualBillingProfile.findFirst({
      where: {
        studentId,
        academicYearLabel: this.billingContext(term).academicYearLabel,
        status: "active",
      },
      select: { academicYearLabel: true },
    });
    if (managedProfile) {
      throw new BadRequestException(
        `This student's ${managedProfile.academicYearLabel} awards and adjustments are controlled by the Annual profile.`,
      );
    }
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
