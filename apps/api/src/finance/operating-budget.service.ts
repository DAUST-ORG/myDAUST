import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type ApprovalRequest,
  type ManagementCategoryKind,
} from "@mydaust/db";
import { toDakarDateKey } from "@mydaust/shared";
import { type AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { deriveApiAccountPosition } from "./account-position.js";
import { paymentCashRecognition } from "./payment-cash-recognition.js";
import {
  OPERATING_BUDGET_CATEGORIES,
  UNCLASSIFIED_COLLECTION_CATEGORY,
  UNCLASSIFIED_EXPENSE_CATEGORY,
  academicYearBounds,
  assertWholeXof,
  forecastOperatingBudget,
  matrixFromCells,
  monthKeyInDakar,
  operatingBudgetMonths,
  scheduledReceivableForecastMonth,
  validateBudgetCells,
  validateOperatingBudgetAggregateBounds,
  type ActualCell,
  type BudgetCell,
  type ForecastScenario,
  type OperatingBudgetKind,
} from "./operating-budget.js";

type DbClient = PrismaService | Prisma.TransactionClient;

export type OperatingBudgetDraftInput = {
  academicYear: string;
  reason: string;
  openingBalanceXof?: number;
  lines: BudgetCell[];
  expectedBudgetId: string | null;
  expectedContentVersion: number | null;
};

export type ManagementActualInput = {
  academicYear: string;
  kind: OperatingBudgetKind;
  categoryKey: string;
  costCenterCode: string;
  amountXof: number;
  occurredOn: string;
  description: string;
  payee?: string;
  isEstimate?: boolean;
};

export type ActualRecord = {
  id: string;
  source:
    | "payment"
    | "balance_reconciliation"
    | "unallocated_credit"
    | "refund"
    | "legacy_payment"
    | "expense"
    | "manual_income"
    | "adjustment";
  sourceId: string;
  kind: OperatingBudgetKind;
  categoryKey: string;
  categoryLabel: string;
  costCenterCode: string;
  occurredOn: Date;
  amountXof: number;
  description: string;
  status: "approved";
  isEstimate: boolean;
  payee: string | null;
  approvalRequestId: string | null;
};

const PAYMENT_ACTUAL_STATUSES = [
  "success",
  "refund_pending",
  "refunded",
] as const;
const BURSAR_COMPONENT_KINDS = new Set(["tuition", "housing", "cafeteria"]);
const BURSAR_COST_CENTERS = new Set(["9100", "3700", "3600"]);

function parseDateOnly(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${label} is not a valid calendar date`);
  }
  return date;
}

function categoryDefinition(key: string) {
  const category = OPERATING_BUDGET_CATEGORIES.find((row) => row.key === key);
  if (!category) {
    throw new BadRequestException(`Unknown management category ${key}`);
  }
  return category;
}

function toApiXof(value: number | bigint, label = "Amount") {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(result)) {
    throw new BadRequestException(
      `${label} exceeds the maximum safely supported whole-XOF value`,
    );
  }
  return result;
}

function toDbXof(value: number, label = "Amount") {
  if (!Number.isSafeInteger(value)) {
    throw new BadRequestException(
      `${label} must be a safely representable whole-XOF value`,
    );
  }
  return BigInt(value);
}

function sumXof(values: readonly number[], label: string) {
  return values.reduce((sum, value) => toApiXof(sum + value, label), 0);
}

function addXof(left: number, right: number, label: string) {
  return toApiXof(left + right, label);
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? toApiXof(item) : item,
    ),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class OperatingBudgetService {
  constructor(private readonly prisma: PrismaService) {}

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
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : null;
        if (code === "P2002") {
          throw new ConflictException(
            "A newer operating-budget revision was saved; refresh before editing",
          );
        }
        if (code !== "P2034" || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }

  private async academicYear(db: DbClient, label?: string) {
    const year = label
      ? await db.academicYear.findUnique({ where: { label } })
      : await db.academicYear.findFirst({
          where: { status: "active" },
          orderBy: { createdAt: "desc" },
        });
    if (!year) throw new NotFoundException("Academic year not found");
    // The institution's operating budget is fixed to August-July even when the
    // registrar has not populated optional catalog-year boundary dates.
    academicYearBounds(year.label);
    return year;
  }

  async resolveAcademicYearLabel(label?: string) {
    return (await this.academicYear(this.prisma, label)).label;
  }

  private assertDateInYear(label: string, date: Date) {
    const { start, endExclusive } = academicYearBounds(label);
    if (date < start || date >= endExclusive) {
      throw new BadRequestException(
        `${date.toISOString().slice(0, 10)} is outside academic year ${label}`,
      );
    }
  }

  private categoryLabel(key: string) {
    return categoryDefinition(key).label;
  }

  private budgetContentHash(budget: {
    revision: number;
    openingBalanceXof: number | bigint;
    reason: string | null;
    baseRevision: number;
    lines: readonly {
      categoryKey: string;
      monthIndex: number;
      amountXof: number | bigint;
    }[];
  }) {
    const content = {
      revision: budget.revision,
      openingBalanceXof: String(budget.openingBalanceXof),
      reason: budget.reason,
      baseRevision: budget.baseRevision,
      lines: [...budget.lines]
        .map((line) => ({
          categoryKey: line.categoryKey,
          monthIndex: line.monthIndex,
          amountXof: String(line.amountXof),
        }))
        .sort(
          (left, right) =>
            left.categoryKey.localeCompare(right.categoryKey) ||
            left.monthIndex - right.monthIndex,
        ),
    };
    return createHash("sha256").update(JSON.stringify(content)).digest("hex");
  }

  private async actualRecords(
    db: DbClient,
    year: { id: string; label: string },
    options: { includeEstimates?: boolean } = {},
  ): Promise<ActualRecord[]> {
    const { start, endExclusive } = academicYearBounds(year.label);
    const now = new Date();
    const dakarTodayStart = new Date(`${toDakarDateKey(now)}T00:00:00.000Z`);
    const dakarTomorrowStart = new Date(dakarTodayStart.getTime() + 86_400_000);
    const timestampEndExclusive = new Date(
      Math.min(endExclusive.getTime(), now.getTime() + 1),
    );
    const dateEndExclusive = new Date(
      Math.min(endExclusive.getTime(), dakarTomorrowStart.getTime()),
    );
    const [payments, expenses, manualEntries] = await Promise.all([
      db.payment.findMany({
        where: {
          status: { in: [...PAYMENT_ACTUAL_STATUSES] },
          OR: [
            { settledAt: { gte: start, lt: timestampEndExclusive } },
            { refundedAt: { gte: start, lt: timestampEndExclusive } },
            {
              paymentBalanceImportRow: {
                is: {
                  batch: {
                    sourceAsOfDate: { gte: start, lt: dateEndExclusive },
                  },
                },
              },
            },
          ],
        },
        include: {
          invoice: { select: { costCenterCode: true } },
          componentAllocations: {
            include: {
              invoiceComponent: {
                select: {
                  kind: true,
                  label: true,
                  costCenterCode: true,
                },
              },
            },
          },
          paymentBalanceImportRow: {
            select: {
              batch: { select: { sourceAsOfDate: true } },
            },
          },
        },
      }),
      db.expense.findMany({
        where: {
          status: "approved",
          AND: [
            { OR: [{ academicYearId: year.id }, { academicYearId: null }] },
            options.includeEstimates
              ? {
                  OR: [
                    {
                      isEstimate: false,
                      incurredOn: { gte: start, lt: dateEndExclusive },
                    },
                    {
                      isEstimate: true,
                      incurredOn: { gte: start, lt: endExclusive },
                    },
                  ],
                }
              : {
                  isEstimate: false,
                  incurredOn: { gte: start, lt: dateEndExclusive },
                },
          ],
        },
        include: { managementCategory: true },
      }),
      db.managementActualEntry.findMany({
        where: {
          academicYearId: year.id,
          status: "approved",
          occurredOn: { gte: start, lt: dateEndExclusive },
        },
        include: { category: true },
      }),
    ]);

    const records: ActualRecord[] = [];
    for (const payment of payments) {
      const recognition = paymentCashRecognition(payment);
      const recognitionInRange =
        recognition &&
        recognition.occurredOn >= start &&
        recognition.occurredOn < timestampEndExclusive
          ? recognition
          : null;
      const recognitionSource =
        recognitionInRange?.basis === "source_as_of_balance"
          ? ("balance_reconciliation" as const)
          : ("payment" as const);
      const recognitionDescription = (description: string) =>
        recognitionInRange?.basis === "source_as_of_balance"
          ? `Paid-to-date balance as of ${toDakarDateKey(
              recognitionInRange.occurredOn,
            )} · ${description}`
          : description;
      const allocations = payment.componentAllocations;
      if (allocations.length > 0) {
        for (const allocation of allocations) {
          const isBursarComponent = BURSAR_COMPONENT_KINDS.has(
            allocation.invoiceComponent.kind,
          );
          const categoryKey = isBursarComponent
            ? "bursar"
            : UNCLASSIFIED_COLLECTION_CATEGORY.key;
          const categoryLabel = isBursarComponent
            ? this.categoryLabel("bursar")
            : UNCLASSIFIED_COLLECTION_CATEGORY.label;
          if (recognitionInRange) {
            records.push({
              id: `${allocation.id}:${recognitionInRange.basis}`,
              source: recognitionSource,
              sourceId: payment.id,
              kind: "income",
              categoryKey,
              categoryLabel,
              costCenterCode: allocation.invoiceComponent.costCenterCode,
              occurredOn: recognitionInRange.occurredOn,
              amountXof: allocation.amountXof,
              description: recognitionDescription(
                allocation.invoiceComponent.label ||
                  allocation.invoiceComponent.kind,
              ),
              status: "approved",
              isEstimate: false,
              payee: null,
              approvalRequestId: null,
            });
          }
          if (
            allocation.refundedAmountXof > 0 &&
            payment.refundedAt &&
            payment.refundedAt >= start &&
            payment.refundedAt < timestampEndExclusive
          ) {
            records.push({
              id: `${allocation.id}:refunded`,
              source: "refund",
              sourceId: payment.id,
              kind: "income",
              categoryKey,
              categoryLabel,
              costCenterCode: allocation.invoiceComponent.costCenterCode,
              occurredOn: payment.refundedAt,
              amountXof: -allocation.refundedAmountXof,
              description: `Refund · ${
                allocation.invoiceComponent.label ||
                allocation.invoiceComponent.kind
              }`,
              status: "approved",
              isEstimate: false,
              payee: null,
              approvalRequestId: null,
            });
          }
        }
        const allocatedXof = sumXof(
          allocations.map((allocation) => allocation.amountXof),
          "Payment component allocation total",
        );
        const unallocatedCreditXof = Math.max(0, payment.amount - allocatedXof);
        if (unallocatedCreditXof > 0 && recognitionInRange) {
          records.push({
            id: `${payment.id}:unallocated-credit:${recognitionInRange.basis}`,
            source:
              recognitionInRange.basis === "source_as_of_balance"
                ? "balance_reconciliation"
                : "unallocated_credit",
            sourceId: payment.id,
            kind: "income",
            categoryKey: UNCLASSIFIED_COLLECTION_CATEGORY.key,
            categoryLabel: UNCLASSIFIED_COLLECTION_CATEGORY.label,
            costCenterCode: payment.invoice.costCenterCode,
            occurredOn: recognitionInRange.occurredOn,
            amountXof: unallocatedCreditXof,
            description: recognitionDescription("Unallocated payment credit"),
            status: "approved",
            isEstimate: false,
            payee: null,
            approvalRequestId: null,
          });
        }
        if (
          unallocatedCreditXof > 0 &&
          payment.refundedAt &&
          payment.refundedAt >= start &&
          payment.refundedAt < timestampEndExclusive
        ) {
          records.push({
            id: `${payment.id}:unallocated-credit-refund`,
            source: "refund",
            sourceId: payment.id,
            kind: "income",
            categoryKey: UNCLASSIFIED_COLLECTION_CATEGORY.key,
            categoryLabel: UNCLASSIFIED_COLLECTION_CATEGORY.label,
            costCenterCode: payment.invoice.costCenterCode,
            occurredOn: payment.refundedAt,
            amountXof: -unallocatedCreditXof,
            description: "Refund · unallocated payment credit",
            status: "approved",
            isEstimate: false,
            payee: null,
            approvalRequestId: null,
          });
        }
      } else {
        // Compatibility for legitimate pre-component settlements. New payments
        // always use frozen component allocations, but dropping historic cash
        // would make the management view irreconcilable during rollout.
        const isBursarLegacy = BURSAR_COST_CENTERS.has(
          payment.invoice.costCenterCode,
        );
        const categoryKey = isBursarLegacy
          ? "bursar"
          : UNCLASSIFIED_COLLECTION_CATEGORY.key;
        const categoryLabel = isBursarLegacy
          ? this.categoryLabel("bursar")
          : UNCLASSIFIED_COLLECTION_CATEGORY.label;
        if (recognitionInRange) {
          records.push({
            id: `${payment.id}:${recognitionInRange.basis}`,
            source:
              recognitionInRange.basis === "source_as_of_balance"
                ? "balance_reconciliation"
                : "legacy_payment",
            sourceId: payment.id,
            kind: "income",
            categoryKey,
            categoryLabel,
            costCenterCode: payment.invoice.costCenterCode,
            occurredOn: recognitionInRange.occurredOn,
            amountXof: payment.amount,
            description: recognitionDescription(
              "Bursar collection (legacy allocation)",
            ),
            status: "approved",
            isEstimate: false,
            payee: null,
            approvalRequestId: null,
          });
        }
        if (
          payment.refundedAt &&
          payment.refundedAt >= start &&
          payment.refundedAt < timestampEndExclusive
        ) {
          records.push({
            id: `${payment.id}:refunded`,
            source: "refund",
            sourceId: payment.id,
            kind: "income",
            categoryKey,
            categoryLabel,
            costCenterCode: payment.invoice.costCenterCode,
            occurredOn: payment.refundedAt,
            amountXof: -payment.amount,
            description: "Refund (legacy allocation)",
            status: "approved",
            isEstimate: false,
            payee: null,
            approvalRequestId: null,
          });
        }
      }
    }
    for (const expense of expenses) {
      const categoryKey =
        expense.managementCategoryKey ?? UNCLASSIFIED_EXPENSE_CATEGORY.key;
      records.push({
        id: expense.id,
        source: "expense",
        sourceId: expense.id,
        kind: "expense",
        categoryKey,
        categoryLabel:
          expense.managementCategory?.label ??
          UNCLASSIFIED_EXPENSE_CATEGORY.label,
        costCenterCode: expense.costCenterCode,
        occurredOn: expense.incurredOn,
        amountXof: expense.amount,
        description:
          expense.description || expense.payee || expense.category || "Expense",
        status: "approved",
        isEstimate: expense.isEstimate,
        payee: expense.payee,
        approvalRequestId: expense.approvalRequestId,
      });
    }
    for (const entry of manualEntries) {
      records.push({
        id: entry.id,
        source: entry.type,
        sourceId: entry.id,
        kind: entry.category.kind,
        categoryKey: entry.categoryKey,
        categoryLabel: entry.category.label,
        costCenterCode: entry.costCenterCode,
        occurredOn: entry.occurredOn,
        amountXof: toApiXof(entry.amountXof, "Management actual amount"),
        description: entry.description,
        status: "approved",
        isEstimate: false,
        payee: null,
        approvalRequestId: entry.approvalRequestId,
      });
    }
    return records;
  }

  private async requireCostCenter(code: string) {
    const costCenter = await this.prisma.costCenter.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!costCenter) {
      throw new BadRequestException(`Unknown cost center ${code}`);
    }
  }

  private toActualCells(records: ActualRecord[]): ActualCell[] {
    return records.map((record) => ({
      kind: record.kind,
      categoryKey: record.categoryKey,
      month: monthKeyInDakar(record.occurredOn),
      amountXof: record.amountXof,
    }));
  }

  private async carryForwardOpeningBalance(
    year: { id: string; label: string },
    db: DbClient = this.prisma,
  ) {
    const { start } = academicYearBounds(year.label);
    const previousStart = start.getUTCFullYear() - 1;
    const years = await db.academicYear.findMany({
      select: { id: true, label: true },
    });
    const previous = years.find((candidate) => {
      try {
        return (
          academicYearBounds(candidate.label).start.getUTCFullYear() ===
          previousStart
        );
      } catch {
        return false;
      }
    });
    if (!previous) return 0;
    const approved = await db.operatingBudget.findFirst({
      where: { academicYearId: previous.id, status: "approved" },
      orderBy: { revision: "desc" },
    });
    if (!approved) return 0;
    const actual = await this.actualRecords(db, previous);
    const income = sumXof(
      actual.filter((row) => row.kind === "income").map((row) => row.amountXof),
      "Prior-year income total",
    );
    const expense = sumXof(
      actual
        .filter((row) => row.kind === "expense")
        .map((row) => row.amountXof),
      "Prior-year expense total",
    );
    return addXof(
      addXof(
        toApiXof(approved.openingBalanceXof, "Opening balance"),
        income,
        "Carry-forward opening balance",
      ),
      -expense,
      "Carry-forward opening balance",
    );
  }

  async saveDraft(actor: AuthUser, input: OperatingBudgetDraftInput) {
    if (
      input.expectedBudgetId === undefined ||
      input.expectedContentVersion === undefined
    ) {
      throw new BadRequestException(
        "Expected budget id and content version are required",
      );
    }
    if (
      (input.expectedBudgetId === null) !==
      (input.expectedContentVersion === null)
    ) {
      throw new BadRequestException(
        "Expected budget id and content version must both be null or both be provided",
      );
    }
    if (
      input.expectedContentVersion !== null &&
      (!Number.isSafeInteger(input.expectedContentVersion) ||
        input.expectedContentVersion < 0)
    ) {
      throw new BadRequestException(
        "Expected content version must be a non-negative whole number",
      );
    }
    const year = await this.academicYear(this.prisma, input.academicYear);
    const lines = validateBudgetCells(year.label, input.lines);
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException("A budget reason is required");
    const openingBalanceXof =
      input.openingBalanceXof === undefined
        ? await this.carryForwardOpeningBalance(year)
        : input.openingBalanceXof;
    if (!Number.isSafeInteger(openingBalanceXof)) {
      throw new BadRequestException(
        "Opening balance must be a signed whole XOF value",
      );
    }
    const existingActualCells = this.toActualCells(
      await this.actualRecords(this.prisma, year),
    );
    validateOperatingBudgetAggregateBounds(
      year.label,
      openingBalanceXof,
      lines,
      existingActualCells,
    );

    const savedClaim = await this.transaction(async (tx) => {
      const [latest, approved, transactionalActualRecords] = await Promise.all([
        tx.operatingBudget.findFirst({
          where: { academicYearId: year.id },
          orderBy: { revision: "desc" },
          include: { lines: true },
        }),
        tx.operatingBudget.findFirst({
          where: { academicYearId: year.id, status: "approved" },
          orderBy: { revision: "desc" },
          include: { lines: true },
        }),
        this.actualRecords(tx, year),
      ]);
      validateOperatingBudgetAggregateBounds(
        year.label,
        openingBalanceXof,
        lines,
        this.toActualCells(transactionalActualRecords),
      );
      const expectationMatches =
        latest &&
        input.expectedBudgetId === latest.id &&
        input.expectedContentVersion === latest.contentVersion;
      if (latest && !expectationMatches) {
        throw new ConflictException(
          "This operating-budget revision changed after it was loaded; refresh before saving",
        );
      }
      if (
        !latest &&
        (input.expectedBudgetId !== null ||
          input.expectedContentVersion !== null)
      ) {
        throw new ConflictException(
          "The expected operating-budget revision no longer exists",
        );
      }
      if (latest?.status === "pending") {
        throw new BadRequestException(
          "This operating budget is awaiting administrator approval",
        );
      }
      let budget;
      if (latest?.status === "draft") {
        const claimed = await tx.operatingBudget.updateMany({
          where: {
            id: latest.id,
            status: "draft",
            contentVersion: input.expectedContentVersion!,
          },
          data: {
            openingBalanceXof: toDbXof(openingBalanceXof, "Opening balance"),
            reason,
            contentVersion: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            "This operating-budget draft changed while it was being saved",
          );
        }
        budget = await tx.operatingBudget.findUniqueOrThrow({
          where: { id: latest.id },
        });
      } else {
        budget = await tx.operatingBudget.create({
          data: {
            academicYearId: year.id,
            revision: (latest?.revision ?? 0) + 1,
            contentVersion: 1,
            status: "draft",
            openingBalanceXof: toDbXof(openingBalanceXof, "Opening balance"),
            reason,
            baseRevision: approved?.revision ?? 0,
            createdById: actor.personId,
          },
        });
      }
      await tx.operatingBudgetLine.deleteMany({
        where: { budgetId: budget.id },
      });
      if (lines.length > 0) {
        const monthIndex = new Map(
          operatingBudgetMonths(year.label).map((month, index) => [
            month.key,
            index,
          ]),
        );
        await tx.operatingBudgetLine.createMany({
          data: lines.map((line) => ({
            budgetId: budget.id,
            categoryKey: line.categoryKey,
            monthIndex: monthIndex.get(line.month)!,
            amountXof: toDbXof(line.amountXof, "Budget line amount"),
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "OperatingBudget",
          entityId: budget.id,
          action: "draft-saved",
          actorId: actor.personId,
          data: asJson({
            academicYear: year.label,
            revision: budget.revision,
            lineCount: lines.length,
            openingBalanceXof,
          }),
        },
      });
      const frozen = await tx.operatingBudget.findUniqueOrThrow({
        where: { id: budget.id },
        include: { lines: true },
      });
      return {
        budgetId: frozen.id,
        contentVersion: frozen.contentVersion,
        contentHash: this.budgetContentHash(frozen),
      };
    });
    return {
      ...(await this.getOperatingBudget(year.label, savedClaim.budgetId)),
      savedClaim,
    };
  }

  private plannedCells(
    label: string,
    lines: readonly {
      categoryKey: string;
      monthIndex: number;
      amountXof: number | bigint;
    }[],
  ): BudgetCell[] {
    const months = operatingBudgetMonths(label);
    return lines.map((line) => ({
      categoryKey: line.categoryKey,
      month: months[line.monthIndex]?.key ?? "",
      amountXof: toApiXof(line.amountXof, "Budget line amount"),
    }));
  }

  private presentSide(
    rows: ReturnType<typeof matrixFromCells>["income"]["rows"],
    metric: "budget" | "actual" | "deviation",
  ) {
    const values = rows.map((row) => {
      const months = Object.fromEntries(
        row.months.map((cell) => [
          cell.month,
          metric === "budget"
            ? cell.budgetXof
            : metric === "actual"
              ? cell.actualXof
              : cell.deviationXof,
        ]),
      );
      const totalXof = sumXof(Object.values(months), `${metric} row total`);
      return {
        categoryKey: row.key,
        label: row.label,
        kind: row.kind,
        months,
        totalXof,
        ...(metric === "deviation"
          ? {
              variancePercentByMonth: Object.fromEntries(
                row.months.map((cell) => [cell.month, cell.deviationPercent]),
              ),
              unbudgetedByMonth: Object.fromEntries(
                row.months.map((cell) => [cell.month, cell.unbudgeted]),
              ),
              annualVariancePercent:
                row.budgetTotalXof === 0
                  ? null
                  : Math.round(
                      ((row.actualTotalXof - row.budgetTotalXof) /
                        row.budgetTotalXof) *
                        10_000,
                    ) / 100,
              annualUnbudgeted:
                row.budgetTotalXof === 0 && row.actualTotalXof !== 0,
            }
          : {}),
      };
    });
    const monthKeys = rows[0]?.months.map((cell) => cell.month) ?? [];
    const result = {
      rows: values,
      monthTotalsXof: Object.fromEntries(
        monthKeys.map((month) => [
          month,
          sumXof(
            values.map((row) => row.months[month] ?? 0),
            `${metric} monthly total`,
          ),
        ]),
      ),
      totalXof: sumXof(
        values.map((row) => row.totalXof),
        `${metric} matrix total`,
      ),
    };
    if (metric !== "deviation") return result;
    const monthBudget = Object.fromEntries(
      monthKeys.map((month) => [
        month,
        sumXof(
          rows.map(
            (row) =>
              row.months.find((cell) => cell.month === month)?.budgetXof ?? 0,
          ),
          "Deviation budget month total",
        ),
      ]),
    );
    const monthActual = Object.fromEntries(
      monthKeys.map((month) => [
        month,
        sumXof(
          rows.map(
            (row) =>
              row.months.find((cell) => cell.month === month)?.actualXof ?? 0,
          ),
          "Deviation actual month total",
        ),
      ]),
    );
    const budgetTotal = sumXof(
      Object.values(monthBudget),
      "Annual deviation budget total",
    );
    const actualTotal = sumXof(
      Object.values(monthActual),
      "Annual deviation actual total",
    );
    return {
      ...result,
      variancePercentByMonth: Object.fromEntries(
        monthKeys.map((month) => {
          const budget = monthBudget[month] ?? 0;
          const actual = monthActual[month] ?? 0;
          return [
            month,
            budget === 0
              ? null
              : Math.round(((actual - budget) / budget) * 10_000) / 100,
          ];
        }),
      ),
      annualVariancePercent:
        budgetTotal === 0
          ? null
          : Math.round(((actualTotal - budgetTotal) / budgetTotal) * 10_000) /
            100,
    };
  }

  async getOperatingBudget(academicYear?: string, preferredBudgetId?: string) {
    const year = await this.academicYear(this.prisma, academicYear);
    const yearBounds = academicYearBounds(year.label);
    const actualTimestampEndExclusive = new Date(
      Math.min(yearBounds.endExclusive.getTime(), Date.now() + 1),
    );
    const [
      categories,
      selected,
      actualRecords,
      defaultOpeningBalanceXof,
      availableYears,
      ambiguousPaymentCandidates,
    ] = await Promise.all([
      this.prisma.managementCategory.findMany({
        where: { isActive: true },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      }),
      preferredBudgetId
        ? this.prisma.operatingBudget.findFirst({
            where: { id: preferredBudgetId, academicYearId: year.id },
            include: {
              lines: { orderBy: { monthIndex: "asc" } },
              createdBy: {
                select: { firstName: true, lastName: true, email: true },
              },
              reviewedBy: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          })
        : this.prisma.operatingBudget.findFirst({
            where: { academicYearId: year.id },
            orderBy: { revision: "desc" },
            include: {
              lines: { orderBy: { monthIndex: "asc" } },
              createdBy: {
                select: { firstName: true, lastName: true, email: true },
              },
              reviewedBy: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          }),
      this.actualRecords(this.prisma, year),
      this.carryForwardOpeningBalance(year),
      this.prisma.academicYear.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.payment.findMany({
        where: {
          status: "refunded",
          settledAt: {
            gte: yearBounds.start,
            lt: actualTimestampEndExclusive,
          },
          refundedAt: { not: null },
        },
        select: { id: true, amount: true, settledAt: true, refundedAt: true },
      }),
    ]);
    const ambiguousLegacyPaymentDates = ambiguousPaymentCandidates.filter(
      (payment) =>
        payment.settledAt?.getTime() === payment.refundedAt?.getTime(),
    );
    const months = operatingBudgetMonths(year.label);
    const planned = selected
      ? this.plannedCells(year.label, selected.lines)
      : [];
    const actual = this.toActualCells(actualRecords);
    const unclassifiedExpenses = actualRecords.filter(
      (record) =>
        record.kind === "expense" &&
        record.categoryKey === UNCLASSIFIED_EXPENSE_CATEGORY.key,
    );
    const unclassifiedCollections = actualRecords.filter(
      (record) =>
        record.kind === "income" &&
        record.categoryKey === UNCLASSIFIED_COLLECTION_CATEGORY.key,
    );
    const balanceReconciliations = actualRecords.filter(
      (record) => record.source === "balance_reconciliation",
    );
    const matrix = matrixFromCells(year.label, planned, actual);
    const openingBalanceXof = selected
      ? toApiXof(selected.openingBalanceXof, "Opening balance")
      : defaultOpeningBalanceXof;
    let plannedBalanceXof = openingBalanceXof;
    let actualBalanceXof = openingBalanceXof;
    const currentMonth = monthKeyInDakar(new Date());
    const cashflow = months.map((month, index) => {
      const plannedIncomeXof = matrix.income.rows.reduce(
        (sum, row) =>
          toApiXof(
            sum + row.months[index]!.budgetXof,
            "Monthly planned income",
          ),
        0,
      );
      const plannedExpenseXof = matrix.expense.rows.reduce(
        (sum, row) =>
          toApiXof(
            sum + row.months[index]!.budgetXof,
            "Monthly planned expense",
          ),
        0,
      );
      const actualIncomeXof = matrix.income.rows.reduce(
        (sum, row) =>
          toApiXof(sum + row.months[index]!.actualXof, "Monthly actual income"),
        0,
      );
      const actualExpenseXof = matrix.expense.rows.reduce(
        (sum, row) =>
          toApiXof(
            sum + row.months[index]!.actualXof,
            "Monthly actual expense",
          ),
        0,
      );
      plannedBalanceXof = addXof(
        addXof(plannedBalanceXof, plannedIncomeXof, "Planned cash balance"),
        -plannedExpenseXof,
        "Planned cash balance",
      );
      actualBalanceXof = addXof(
        addXof(actualBalanceXof, actualIncomeXof, "Actual cash balance"),
        -actualExpenseXof,
        "Actual cash balance",
      );
      return {
        month: month.key,
        plannedIncomeXof,
        plannedExpenseXof,
        actualIncomeXof,
        actualExpenseXof,
        plannedBalanceXof,
        actualBalanceXof: month.key <= currentMonth ? actualBalanceXof : null,
        forecastBalanceXof: null,
      };
    });
    const budget = {
      income: this.presentSide(matrix.income.rows, "budget"),
      expense: this.presentSide(matrix.expense.rows, "budget"),
    };
    const actualView = {
      income: this.presentSide(matrix.income.rows, "actual"),
      expense: this.presentSide(matrix.expense.rows, "actual"),
    };
    return {
      academicYear: {
        id: year.id,
        label: year.label,
        startDate: academicYearBounds(year.label)
          .start.toISOString()
          .slice(0, 10),
        endDate: new Date(
          academicYearBounds(year.label).endExclusive.getTime() - 86_400_000,
        )
          .toISOString()
          .slice(0, 10),
      },
      months,
      categories:
        categories.length > 0
          ? categories.map((category) => ({
              key: category.key,
              label: category.label,
              kind: category.kind,
              sortOrder: category.sortOrder,
            }))
          : OPERATING_BUDGET_CATEGORIES,
      revision: selected
        ? {
            id: selected.id,
            revision: selected.revision,
            contentVersion: selected.contentVersion,
            status: selected.status,
            openingBalanceXof: toApiXof(
              selected.openingBalanceXof,
              "Opening balance",
            ),
            reason: selected.reason,
            baseRevision: selected.baseRevision,
            createdAt: selected.createdAt,
            updatedAt: selected.updatedAt,
            contentHash: this.budgetContentHash(selected),
            submittedAt: selected.submittedAt,
            reviewedAt: selected.reviewedAt,
            approvedAt: selected.approvedAt,
            createdBy: {
              name: `${selected.createdBy.firstName} ${selected.createdBy.lastName}`.trim(),
              email: selected.createdBy.email,
            },
            reviewedBy: selected.reviewedBy
              ? {
                  name: `${selected.reviewedBy.firstName} ${selected.reviewedBy.lastName}`.trim(),
                  email: selected.reviewedBy.email,
                }
              : null,
          }
        : null,
      pendingApprovalId:
        selected?.status === "pending" ? selected.approvalRequestId : null,
      defaultOpeningBalanceXof,
      openingBalanceXof,
      openingBalanceSource: selected
        ? ("approved_override" as const)
        : defaultOpeningBalanceXof === 0
          ? ("zero" as const)
          : ("carry_forward" as const),
      availableAcademicYears: availableYears.flatMap((candidate) => {
        try {
          const bounds = academicYearBounds(candidate.label);
          return [
            {
              id: candidate.id,
              label: candidate.label,
              startDate: bounds.start.toISOString().slice(0, 10),
              endDate: new Date(bounds.endExclusive.getTime() - 86_400_000)
                .toISOString()
                .slice(0, 10),
            },
          ];
        } catch {
          return [];
        }
      }),
      integrityWarnings: [
        ...(unclassifiedExpenses.length > 0
          ? [
              {
                code: "unclassified_expenses" as const,
                count: unclassifiedExpenses.length,
                amountXof: sumXof(
                  unclassifiedExpenses.map((row) => row.amountXof),
                  "Unclassified expense total",
                ),
                message:
                  "Approved legacy expenses need a management category. They remain included in cash and closing totals.",
              },
            ]
          : []),
        ...(unclassifiedCollections.length > 0
          ? [
              {
                code: "unclassified_collections" as const,
                count: unclassifiedCollections.length,
                amountXof: sumXof(
                  unclassifiedCollections.map((row) => row.amountXof),
                  "Unclassified collection total",
                ),
                message:
                  "Settled cash outside tuition, housing and cafeteria components remains included in cash and closing totals but needs Finance classification.",
              },
            ]
          : []),
        ...(ambiguousLegacyPaymentDates.length > 0
          ? [
              {
                code: "ambiguous_legacy_payment_dates" as const,
                count: ambiguousLegacyPaymentDates.length,
                amountXof: sumXof(
                  ambiguousLegacyPaymentDates.map((payment) => payment.amount),
                  "Ambiguous legacy payment total",
                ),
                message:
                  "Some legacy refunds have identical settlement and refund timestamps. Net totals remain included, but their monthly timing cannot be stated precisely.",
              },
            ]
          : []),
        ...(balanceReconciliations.length > 0
          ? [
              {
                code: "source_as_of_balance_reconciliations" as const,
                count: new Set(
                  balanceReconciliations.map((record) => record.sourceId),
                ).size,
                amountXof: sumXof(
                  balanceReconciliations.map((record) => record.amountXof),
                  "Paid-to-date balance reconciliation total",
                ),
                message:
                  "Paid-to-date workbook deltas are recognized on the reviewed source-as-of date. Individual settlement timestamps remain unknown and were not invented.",
              },
            ]
          : []),
      ],
      summary: {
        openingBalanceXof,
        actualIncomeXof: actualView.income.totalXof,
        actualExpenseXof: actualView.expense.totalXof,
        actualClosingBalanceXof: addXof(
          addXof(
            openingBalanceXof,
            actualView.income.totalXof,
            "Actual closing balance",
          ),
          -actualView.expense.totalXof,
          "Actual closing balance",
        ),
        plannedClosingBalanceXof: addXof(
          addXof(
            openingBalanceXof,
            budget.income.totalXof,
            "Planned closing balance",
          ),
          -budget.expense.totalXof,
          "Planned closing balance",
        ),
      },
      budget,
      actual: actualView,
      deviation: {
        income: this.presentSide(matrix.income.rows, "deviation"),
        expense: this.presentSide(matrix.expense.rows, "deviation"),
      },
      cashflow,
    };
  }

  private async remainingScheduledBursarByMonth(year: {
    id: string;
    label: string;
  }) {
    const students = await this.prisma.student.findMany({
      where: {
        invoices: {
          some: {
            status: { not: "void" },
            totalAmount: { gt: 0 },
            OR: [
              { academicYearLabel: year.label },
              { term: { academicYearId: year.id } },
            ],
          },
        },
      },
      include: {
        invoices: {
          include: {
            term: true,
            plan: { include: { installments: true } },
          },
        },
      },
    });
    const result: Record<string, number> = {};
    const months = new Set(
      operatingBudgetMonths(year.label).map((month) => month.key),
    );
    for (const student of students) {
      const position = deriveApiAccountPosition(student.invoices);
      const targetIds = new Set(
        student.invoices
          .filter(
            (invoice) =>
              invoice.status !== "void" &&
              invoice.totalAmount > 0 &&
              (invoice.academicYearLabel === year.label ||
                invoice.term.academicYearId === year.id),
          )
          .map((invoice) => invoice.id),
      );
      for (const line of position.installments) {
        if (
          !targetIds.has(line.invoiceId) ||
          !line.dueDate ||
          line.outstandingXof <= 0
        ) {
          continue;
        }
        const dueMonth = line.dueDate.slice(0, 7);
        const month = scheduledReceivableForecastMonth(
          dueMonth,
          monthKeyInDakar(new Date()),
          months,
        );
        if (!month) continue;
        result[month] = toApiXof(
          (result[month] ?? 0) + line.outstandingXof,
          "Scheduled Bursar collections",
        );
      }
    }
    return result;
  }

  async forecast(input: {
    academicYear: string;
    scenario: ForecastScenario;
    collectionRatePercent?: number;
    expenseGrowthPercent?: number;
  }) {
    const year = await this.academicYear(this.prisma, input.academicYear);
    const budget = await this.prisma.operatingBudget.findFirst({
      where: { academicYearId: year.id, status: "approved" },
      orderBy: { revision: "desc" },
      include: { lines: true },
    });
    if (!budget) {
      throw new BadRequestException(
        "An administrator-approved operating budget is required before forecasting",
      );
    }
    if (
      input.collectionRatePercent !== undefined &&
      (input.collectionRatePercent < 0 || input.collectionRatePercent > 100)
    ) {
      throw new BadRequestException(
        "Collection rate must be between 0 and 100",
      );
    }
    if (
      input.expenseGrowthPercent !== undefined &&
      (input.expenseGrowthPercent < -100 || input.expenseGrowthPercent > 100)
    ) {
      throw new BadRequestException(
        "Monthly expense growth must be between -100 and 100",
      );
    }
    const [records, scheduledBursarByMonth] = await Promise.all([
      this.actualRecords(this.prisma, year),
      this.remainingScheduledBursarByMonth(year),
    ]);
    const asOf = new Date();
    const result = forecastOperatingBudget({
      label: year.label,
      openingBalanceXof: toApiXof(budget.openingBalanceXof, "Opening balance"),
      planned: this.plannedCells(year.label, budget.lines),
      actual: this.toActualCells(records),
      scenario: input.scenario,
      today: asOf,
      collectionRatePercent: input.collectionRatePercent,
      expenseGrowthPercent: input.expenseGrowthPercent,
      scheduledBursarByMonth,
    });
    return {
      scenario: result.scenario,
      collectionRatePercent: result.metadata.collectionRatePercent,
      expenseGrowthPercent: result.metadata.expenseGrowthPercent,
      metadata: {
        asOfDate: asOf.toISOString(),
        actualThroughMonth: monthKeyInDakar(asOf),
        forecastStatus: "ready" as const,
        basisStatus: "approved" as const,
        basisRevision: budget.revision,
      },
      months: result.months.map((month) => ({
        month: month.month,
        incomeXof: month.forecastIncomeXof,
        expenseXof: month.forecastExpenseXof,
        balanceXof: month.forecastBalanceXof,
        source: month.source,
      })),
      projectedClosingBalanceXof: result.projectedClosingBalanceXof,
    };
  }

  async listActuals(input: {
    academicYear?: string;
    kind?: OperatingBudgetKind;
    categoryKey?: string;
    month?: string;
    costCenterCode?: string;
    source?: ActualRecord["source"] | "bursar";
    cursor?: string;
    limit?: number;
  }) {
    const year = await this.academicYear(this.prisma, input.academicYear);
    if (
      input.categoryKey &&
      input.categoryKey !== UNCLASSIFIED_EXPENSE_CATEGORY.key &&
      input.categoryKey !== UNCLASSIFIED_COLLECTION_CATEGORY.key
    ) {
      categoryDefinition(input.categoryKey);
    }
    if (
      input.month &&
      !operatingBudgetMonths(year.label).some(
        (month) => month.key === input.month,
      )
    ) {
      throw new BadRequestException(
        `${input.month} is outside academic year ${year.label}`,
      );
    }
    const offset = input.cursor ? Number(input.cursor) : 0;
    const limit = Math.min(200, Math.max(1, input.limit ?? 100));
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException("Invalid actual-entry cursor");
    }
    const filtered = (
      await this.actualRecords(this.prisma, year, { includeEstimates: true })
    )
      .filter((row) => !input.kind || row.kind === input.kind)
      .filter(
        (row) => !input.categoryKey || row.categoryKey === input.categoryKey,
      )
      .filter(
        (row) =>
          !input.month || monthKeyInDakar(row.occurredOn) === input.month,
      )
      .filter(
        (row) =>
          !input.costCenterCode || row.costCenterCode === input.costCenterCode,
      )
      .filter(
        (row) =>
          !input.source ||
          (input.source === "bursar"
            ? row.categoryKey === "bursar" &&
              (row.source === "payment" ||
                row.source === "legacy_payment" ||
                row.source === "balance_reconciliation")
            : row.source === input.source),
      )
      .sort(
        (left, right) =>
          right.occurredOn.getTime() - left.occurredOn.getTime() ||
          left.id.localeCompare(right.id),
      );
    const items = filtered.slice(offset, offset + limit);
    return {
      items,
      total: filtered.length,
      totalXof: sumXof(
        filtered.filter((row) => !row.isEstimate).map((row) => row.amountXof),
        "Actual register total",
      ),
      excludedEstimateXof: sumXof(
        filtered.filter((row) => row.isEstimate).map((row) => row.amountXof),
        "Excluded estimate total",
      ),
      nextCursor:
        offset + items.length < filtered.length
          ? String(offset + items.length)
          : null,
    };
  }

  validateManagementInput(input: ManagementActualInput) {
    const category = categoryDefinition(input.categoryKey);
    if (category.kind !== input.kind) {
      throw new BadRequestException(
        `${category.label} is an ${category.kind} category`,
      );
    }
    if (!input.costCenterCode.trim()) {
      throw new BadRequestException("A cost center is required");
    }
    if (!Number.isSafeInteger(input.amountXof) || input.amountXof <= 0) {
      throw new BadRequestException(
        "Actual amount must be a positive whole XOF value",
      );
    }
    if (!input.description.trim()) {
      throw new BadRequestException("A description is required");
    }
    const occurredOn = parseDateOnly(input.occurredOn, "Actual date");
    this.assertDateInYear(input.academicYear, occurredOn);
    if (input.occurredOn > toDakarDateKey(new Date()) && !input.isEstimate) {
      throw new BadRequestException("Actual entries cannot be future-dated");
    }
    return { ...input, occurredOn: input.occurredOn };
  }

  async prepareActualCreate(
    input: Omit<ManagementActualInput, "description"> & {
      description?: string;
    },
    mode: "create_income" | "create_expense",
  ) {
    const year = await this.academicYear(this.prisma, input.academicYear);
    const category = categoryDefinition(input.categoryKey);
    const normalized = this.validateManagementInput({
      ...input,
      academicYear: year.label,
      description: input.description?.trim() || category.label,
    });
    await this.requireCostCenter(normalized.costCenterCode);
    if (mode === "create_income" && normalized.kind !== "income") {
      throw new BadRequestException("Manual income needs an income category");
    }
    if (mode === "create_income" && normalized.categoryKey === "bursar") {
      throw new BadRequestException(
        "Bursar income is derived from settled payments and cannot be entered manually",
      );
    }
    if (mode === "create_income" && normalized.isEstimate) {
      throw new BadRequestException(
        "Estimates are expense-only; manual income records approved actual cash",
      );
    }
    if (mode === "create_expense" && normalized.kind !== "expense") {
      throw new BadRequestException("An expense needs an expense category");
    }
    if (mode === "create_expense" && normalized.amountXof > 2_000_000_000) {
      throw new BadRequestException(
        "A single expense cannot exceed 2,000,000,000 XOF",
      );
    }
    return {
      mode,
      ...normalized,
      academicYearId: year.id,
      categoryLabel: category.label,
      isEstimate: Boolean(normalized.isEstimate),
    };
  }

  async prepareExpenseUpdate(
    id: string,
    patch: Partial<
      Omit<ManagementActualInput, "kind" | "academicYear"> & {
        academicYear: string;
      }
    >,
  ) {
    const existing = await this.prisma.expense.findUnique({
      where: { id },
      include: { academicYear: true, managementCategory: true },
    });
    if (!existing) throw new NotFoundException("Expense not found");
    if (existing.status !== "approved") {
      throw new BadRequestException("Only an approved expense can be changed");
    }
    const categoryKey =
      patch.categoryKey ?? existing.managementCategoryKey ?? undefined;
    if (!categoryKey) {
      throw new BadRequestException(
        "Classify this legacy expense before submitting a correction",
      );
    }
    const academicYear = patch.academicYear ?? existing.academicYear?.label;
    if (!academicYear) {
      throw new BadRequestException(
        "Select an academic year for this legacy expense correction",
      );
    }
    return this.prepareActualCreate(
      {
        academicYear,
        kind: "expense",
        categoryKey,
        costCenterCode: patch.costCenterCode ?? existing.costCenterCode,
        amountXof: patch.amountXof ?? existing.amount,
        occurredOn:
          patch.occurredOn ?? existing.incurredOn.toISOString().slice(0, 10),
        description:
          patch.description ?? existing.description ?? existing.category,
        payee: patch.payee ?? existing.payee ?? undefined,
        isEstimate: patch.isEstimate ?? existing.isEstimate,
      },
      "create_expense",
    ).then((after) => ({
      ...after,
      mode: "update_expense" as const,
      legacyCategory: existing.category,
      personId: existing.personId,
    }));
  }

  async prepareActualEntryUpdate(
    id: string,
    patch: Partial<
      Omit<ManagementActualInput, "kind" | "academicYear"> & {
        academicYear: string;
      }
    >,
  ) {
    const existing = await this.prisma.managementActualEntry.findUnique({
      where: { id },
      include: { academicYear: true, category: true },
    });
    if (!existing) throw new NotFoundException("Manual actual entry not found");
    if (existing.status !== "approved" || existing.type !== "manual_income") {
      throw new BadRequestException(
        "Only an approved manual income entry can be edited",
      );
    }
    return this.prepareActualCreate(
      {
        academicYear: patch.academicYear ?? existing.academicYear.label,
        kind: "income",
        categoryKey: patch.categoryKey ?? existing.categoryKey,
        costCenterCode: patch.costCenterCode ?? existing.costCenterCode,
        amountXof:
          patch.amountXof ??
          toApiXof(existing.amountXof, "Management actual amount"),
        occurredOn:
          patch.occurredOn ?? existing.occurredOn.toISOString().slice(0, 10),
        description: patch.description ?? existing.description,
      },
      "create_income",
    ).then((after) => ({ ...after, mode: "update_entry" as const }));
  }

  async adjustmentRequest(input: {
    academicYear: string;
    kind: OperatingBudgetKind;
    categoryKey: string;
    costCenterCode: string;
    month: string;
    requestedActualXof: number;
    description?: string;
  }) {
    const year = await this.academicYear(this.prisma, input.academicYear);
    const category = categoryDefinition(input.categoryKey);
    if (category.kind !== input.kind) {
      throw new BadRequestException(
        `${category.label} is an ${category.kind} category`,
      );
    }
    if (
      !operatingBudgetMonths(year.label).some(
        (month) => month.key === input.month,
      )
    ) {
      throw new BadRequestException(
        `${input.month} is outside academic year ${year.label}`,
      );
    }
    await this.requireCostCenter(input.costCenterCode);
    if (!Number.isSafeInteger(input.requestedActualXof)) {
      throw new BadRequestException(
        "Requested actual must be a signed whole XOF value",
      );
    }
    if (`${input.month}-01` > toDakarDateKey(new Date())) {
      throw new BadRequestException(
        "Actual adjustments cannot be future-dated",
      );
    }
    const actual = sumXof(
      (await this.actualRecords(this.prisma, year))
        .filter(
          (row) =>
            row.kind === input.kind &&
            row.categoryKey === input.categoryKey &&
            monthKeyInDakar(row.occurredOn) === input.month,
        )
        .map((row) => row.amountXof),
      "Management actual cell total",
    );
    const amountXof = toApiXof(
      input.requestedActualXof - actual,
      "Management adjustment amount",
    );
    if (amountXof === 0) {
      throw new BadRequestException(
        "Requested actual already equals the approved total",
      );
    }
    return {
      mode: "adjustment",
      academicYear: year.label,
      academicYearId: year.id,
      kind: input.kind,
      categoryKey: input.categoryKey,
      costCenterCode: input.costCenterCode,
      month: input.month,
      occurredOn: `${input.month}-01`,
      amountXof,
      baseActualXof: actual,
      targetActualXof: input.requestedActualXof,
      description:
        input.description?.trim() ||
        `Adjustment to ${category.label} actual for ${input.month}`,
    };
  }

  async approvalSnapshot(change: {
    kind: string;
    targetId?: string;
    academicYearLabel?: string;
    after: Record<string, unknown>;
  }) {
    if (change.kind === "operating_budget") {
      const budgetId = String(change.after.budgetId ?? change.targetId ?? "");
      const budget = await this.prisma.operatingBudget.findUnique({
        where: { id: budgetId },
        include: { lines: true },
      });
      if (!budget) throw new NotFoundException("Operating budget not found");
      if (budget.status !== "draft") {
        throw new BadRequestException("Only a draft budget can be submitted");
      }
      const expectedContentVersion = Number(
        change.after.expectedContentVersion,
      );
      const expectedContentHash = String(
        change.after.expectedContentHash ?? "",
      );
      if (
        !Number.isSafeInteger(expectedContentVersion) ||
        expectedContentVersion < 0 ||
        !/^[a-f0-9]{64}$/.test(expectedContentHash)
      ) {
        throw new BadRequestException(
          "Operating-budget submission requires the saved content version and hash",
        );
      }
      if (
        budget.contentVersion !== expectedContentVersion ||
        this.budgetContentHash(budget) !== expectedContentHash
      ) {
        throw new ConflictException(
          "The operating-budget draft changed before submission; refresh and review it again",
        );
      }
      const current = await this.prisma.operatingBudget.findFirst({
        where: {
          academicYearId: budget.academicYearId,
          status: "approved",
        },
        orderBy: { revision: "desc" },
        include: { lines: true },
      });
      return {
        before: current,
        baseRevision: budget.baseRevision,
        after: {
          ...change.after,
          budgetId: budget.id,
          draft: budget,
          draftContentVersion: budget.contentVersion,
          draftContentHash: this.budgetContentHash(budget),
        },
      };
    }
    if (change.kind !== "management_actual") return null;
    const mode = String(change.after.mode ?? "");
    if (["update_expense", "void_expense"].includes(mode)) {
      const expense = change.targetId
        ? await this.prisma.expense.findUnique({
            where: { id: change.targetId },
          })
        : null;
      if (!expense) throw new NotFoundException("Expense not found");
      if (expense.status !== "approved") {
        throw new BadRequestException(
          "Only an approved expense can be changed",
        );
      }
      return {
        before: expense,
        baseRevision: expense.revision,
        after: change.after,
      };
    }
    if (["update_entry", "void_entry"].includes(mode)) {
      const entry = change.targetId
        ? await this.prisma.managementActualEntry.findUnique({
            where: { id: change.targetId },
            include: { category: true },
          })
        : null;
      if (!entry) throw new NotFoundException("Manual actual entry not found");
      if (entry.status !== "approved") {
        throw new BadRequestException(
          "Only an approved manual actual can be changed",
        );
      }
      return {
        before: entry,
        baseRevision: entry.revision,
        after: change.after,
      };
    }
    return { before: null, baseRevision: 0, after: change.after };
  }

  async markSubmitted(
    tx: Prisma.TransactionClient,
    budgetId: string,
    requestId: string,
    expectedContentVersion: number,
    expectedContentHash: string,
  ) {
    const claimed = await tx.operatingBudget.updateMany({
      where: {
        id: budgetId,
        status: "draft",
        contentVersion: expectedContentVersion,
      },
      data: {
        status: "pending",
        approvalRequestId: requestId,
        submittedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        "Operating-budget draft changed while it was being submitted; review and submit again",
      );
    }
    const claimedBudget = await tx.operatingBudget.findUniqueOrThrow({
      where: { id: budgetId },
      include: { lines: true },
    });
    if (this.budgetContentHash(claimedBudget) !== expectedContentHash) {
      throw new ConflictException(
        "Operating-budget contents changed while it was being submitted",
      );
    }
  }

  async approvalStaleReason(
    tx: Prisma.TransactionClient,
    request: ApprovalRequest,
  ): Promise<string | null> {
    const after = request.afterJson as Record<string, unknown>;
    if (request.kind === "operating_budget") {
      const budget = await tx.operatingBudget.findUnique({
        where: { id: String(after.budgetId ?? request.targetId ?? "") },
      });
      if (!budget) return "The operating-budget draft no longer exists";
      if (
        budget.status !== "pending" ||
        budget.approvalRequestId !== request.id
      ) {
        return "The operating-budget draft changed after submission";
      }
      const expectedHash = String(after.draftContentHash ?? "");
      const currentWithLines = await tx.operatingBudget.findUnique({
        where: { id: budget.id },
        include: { lines: true },
      });
      if (
        !expectedHash ||
        !currentWithLines ||
        this.budgetContentHash(currentWithLines) !== expectedHash
      ) {
        return "The operating-budget contents changed after submission";
      }
      const approved = await tx.operatingBudget.findFirst({
        where: {
          academicYearId: budget.academicYearId,
          status: "approved",
        },
        orderBy: { revision: "desc" },
      });
      return (approved?.revision ?? 0) === request.baseRevision
        ? null
        : "The approved operating budget changed after this request was submitted";
    }
    if (request.kind !== "management_actual") return null;
    const mode = String(after.mode ?? "");
    if (["update_expense", "void_expense"].includes(mode)) {
      const expense = request.targetId
        ? await tx.expense.findUnique({ where: { id: request.targetId } })
        : null;
      if (!expense) return "The target expense no longer exists";
      if (
        expense.status !== "approved" ||
        expense.revision !== request.baseRevision
      ) {
        return "The target expense changed after this request was submitted";
      }
    }
    if (["update_entry", "void_entry"].includes(mode)) {
      const entry = request.targetId
        ? await tx.managementActualEntry.findUnique({
            where: { id: request.targetId },
          })
        : null;
      if (!entry) return "The target actual entry no longer exists";
      if (
        entry.status !== "approved" ||
        entry.revision !== request.baseRevision
      ) {
        return "The target actual entry changed after this request was submitted";
      }
    }
    if (mode === "adjustment") {
      const year = await this.academicYear(tx, String(after.academicYear));
      const actual = sumXof(
        (await this.actualRecords(tx, year))
          .filter(
            (row) =>
              row.kind === String(after.kind) &&
              row.categoryKey === String(after.categoryKey) &&
              monthKeyInDakar(row.occurredOn) === String(after.month),
          )
          .map((row) => row.amountXof),
        "Management actual cell total",
      );
      if (actual !== Number(after.baseActualXof)) {
        return "The approved actual total changed after this adjustment was submitted";
      }
    }
    return null;
  }

  private async academicYearIdsForLegacyExpenseDate(
    tx: Prisma.TransactionClient,
    incurredOn: Date,
  ) {
    const years = await tx.academicYear.findMany({
      select: { id: true, label: true },
    });
    return years.flatMap((year) => {
      try {
        const bounds = academicYearBounds(year.label);
        return incurredOn >= bounds.start && incurredOn < bounds.endExclusive
          ? [year.id]
          : [];
      } catch {
        return [];
      }
    });
  }

  private async validateProjectedActuals(
    tx: Prisma.TransactionClient,
    request: ApprovalRequest,
    after: Record<string, unknown>,
  ) {
    const mode = String(after.mode ?? "");
    const removals = new Map<string, Set<string>>();
    const additions = new Map<string, ActualCell[]>();
    const addRemoval = (academicYearId: string, sourceId: string) => {
      const ids = removals.get(academicYearId) ?? new Set<string>();
      ids.add(sourceId);
      removals.set(academicYearId, ids);
    };
    const addCandidate = (academicYearId: string, cell: ActualCell | null) => {
      if (!cell) return;
      additions.set(academicYearId, [
        ...(additions.get(academicYearId) ?? []),
        cell,
      ]);
    };
    const candidateCell = (kind: OperatingBudgetKind): ActualCell | null => {
      if (Boolean(after.isEstimate)) return null;
      const occurredOn = parseDateOnly(String(after.occurredOn), "Actual date");
      if (occurredOn.toISOString().slice(0, 10) > toDakarDateKey(new Date())) {
        return null;
      }
      return {
        kind,
        categoryKey: String(after.categoryKey),
        month: monthKeyInDakar(occurredOn),
        amountXof: toApiXof(Number(after.amountXof)),
      };
    };

    if (["update_expense", "void_expense"].includes(mode)) {
      const expense = await tx.expense.findUnique({
        where: { id: request.targetId! },
      });
      if (!expense) throw new NotFoundException("Expense not found");
      const yearIds = expense.academicYearId
        ? [expense.academicYearId]
        : await this.academicYearIdsForLegacyExpenseDate(
            tx,
            expense.incurredOn,
          );
      for (const yearId of yearIds) addRemoval(yearId, expense.id);
    }
    if (["update_entry", "void_entry"].includes(mode)) {
      const entry = await tx.managementActualEntry.findUnique({
        where: { id: request.targetId! },
      });
      if (!entry) throw new NotFoundException("Manual actual entry not found");
      addRemoval(entry.academicYearId, entry.id);
    }

    if (["create_expense", "update_expense"].includes(mode)) {
      addCandidate(String(after.academicYearId), candidateCell("expense"));
    }
    if (["create_income", "update_entry"].includes(mode)) {
      addCandidate(String(after.academicYearId), candidateCell("income"));
    }
    if (mode === "adjustment") {
      addCandidate(
        String(after.academicYearId),
        candidateCell(String(after.kind) as OperatingBudgetKind),
      );
    }

    const affectedYearIds = new Set([...removals.keys(), ...additions.keys()]);
    for (const academicYearId of affectedYearIds) {
      const year = await tx.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, label: true },
      });
      if (!year) throw new NotFoundException("Academic year not found");
      const removedSourceIds = removals.get(academicYearId) ?? new Set();
      const projectedActuals = this.toActualCells(
        (await this.actualRecords(tx, year)).filter(
          (record) => !removedSourceIds.has(record.sourceId),
        ),
      );
      projectedActuals.push(...(additions.get(academicYearId) ?? []));

      const budgets = await tx.operatingBudget.findMany({
        where: { academicYearId },
        include: { lines: true },
      });
      if (budgets.length === 0) {
        validateOperatingBudgetAggregateBounds(
          year.label,
          await this.carryForwardOpeningBalance(year, tx),
          [],
          projectedActuals,
        );
        continue;
      }
      for (const budget of budgets) {
        validateOperatingBudgetAggregateBounds(
          year.label,
          toApiXof(budget.openingBalanceXof, "Opening balance"),
          this.plannedCells(year.label, budget.lines),
          projectedActuals,
        );
      }
    }
  }

  async applyApproval(
    tx: Prisma.TransactionClient,
    request: ApprovalRequest,
    actorId: string,
  ) {
    const after = request.afterJson as Record<string, unknown>;
    if (request.kind === "operating_budget") {
      const id = String(after.budgetId ?? request.targetId ?? "");
      const budget = await tx.operatingBudget.findUnique({ where: { id } });
      if (!budget) throw new NotFoundException("Operating budget not found");
      await tx.operatingBudget.updateMany({
        where: {
          academicYearId: budget.academicYearId,
          status: "approved",
          id: { not: budget.id },
        },
        data: { status: "superseded" },
      });
      const approved = await tx.operatingBudget.update({
        where: { id: budget.id },
        data: {
          status: "approved",
          reviewedById: actorId,
          reviewedAt: new Date(),
          approvedAt: new Date(),
        },
      });
      return {
        operatingBudgetId: approved.id,
        revision: approved.revision,
        status: approved.status,
      };
    }
    if (request.kind !== "management_actual") return null;
    const mode = String(after.mode ?? "");
    await this.validateProjectedActuals(tx, request, after);
    const now = new Date();
    if (mode === "create_expense") {
      const expense = await tx.expense.create({
        data: {
          academicYearId: String(after.academicYearId),
          managementCategoryKey: String(after.categoryKey),
          category: String(after.legacyCategory ?? after.categoryLabel),
          costCenterCode: String(after.costCenterCode),
          description: String(after.description),
          payee: after.payee ? String(after.payee) : null,
          amount: Number(after.amountXof),
          isEstimate: Boolean(after.isEstimate),
          incurredOn: parseDateOnly(String(after.occurredOn), "Expense date"),
          status: "approved",
          approvalRequestId: request.id,
          createdById: request.requestedById,
          approvedById: actorId,
          approvedAt: now,
        },
      });
      return { expenseId: expense.id, status: expense.status };
    }
    if (mode === "update_expense") {
      const current = await tx.expense.findUniqueOrThrow({
        where: { id: request.targetId! },
      });
      await tx.expense.update({
        where: { id: current.id },
        data: { status: "corrected", revision: { increment: 1 } },
      });
      const replacement = await tx.expense.create({
        data: {
          academicYearId: String(after.academicYearId),
          managementCategoryKey: String(after.categoryKey),
          category: String(after.legacyCategory ?? after.categoryLabel),
          personId: after.personId ? String(after.personId) : null,
          costCenterCode: String(after.costCenterCode),
          description: String(after.description),
          payee: after.payee ? String(after.payee) : null,
          amount: Number(after.amountXof),
          isEstimate: Boolean(after.isEstimate),
          incurredOn: parseDateOnly(String(after.occurredOn), "Expense date"),
          status: "approved",
          revision: current.revision + 1,
          correctionOfId: current.id,
          approvalRequestId: request.id,
          createdById: request.requestedById,
          approvedById: actorId,
          approvedAt: now,
        },
      });
      return { expenseId: replacement.id, correctedExpenseId: current.id };
    }
    if (mode === "void_expense") {
      const expense = await tx.expense.update({
        where: { id: request.targetId! },
        data: {
          status: "void",
          revision: { increment: 1 },
          voidApprovalRequestId: request.id,
          voidedById: actorId,
          voidedAt: now,
          voidReason: request.reason,
        },
      });
      return { expenseId: expense.id, status: expense.status };
    }
    if (mode === "create_income" || mode === "adjustment") {
      const entry = await tx.managementActualEntry.create({
        data: {
          academicYearId: String(after.academicYearId),
          categoryKey: String(after.categoryKey),
          costCenterCode: String(after.costCenterCode),
          type: mode === "adjustment" ? "adjustment" : "manual_income",
          status: "approved",
          amountXof: toDbXof(Number(after.amountXof)),
          baseActualXof:
            after.baseActualXof === undefined
              ? null
              : toDbXof(Number(after.baseActualXof), "Base actual amount"),
          targetActualXof:
            after.targetActualXof === undefined
              ? null
              : toDbXof(Number(after.targetActualXof), "Target actual amount"),
          occurredOn: parseDateOnly(String(after.occurredOn), "Actual date"),
          description: String(after.description),
          approvalRequestId: request.id,
          createdById: request.requestedById,
          approvedById: actorId,
          approvedAt: now,
        },
      });
      return { actualEntryId: entry.id, status: entry.status };
    }
    if (mode === "update_entry") {
      const current = await tx.managementActualEntry.findUniqueOrThrow({
        where: { id: request.targetId! },
      });
      await tx.managementActualEntry.update({
        where: { id: current.id },
        data: { status: "corrected", revision: { increment: 1 } },
      });
      const entry = await tx.managementActualEntry.create({
        data: {
          academicYearId: String(after.academicYearId),
          categoryKey: String(after.categoryKey),
          costCenterCode: String(after.costCenterCode),
          type: "manual_income",
          status: "approved",
          amountXof: toDbXof(Number(after.amountXof)),
          occurredOn: parseDateOnly(String(after.occurredOn), "Actual date"),
          description: String(after.description),
          revision: current.revision + 1,
          correctionOfId: current.id,
          approvalRequestId: request.id,
          createdById: request.requestedById,
          approvedById: actorId,
          approvedAt: now,
        },
      });
      return { actualEntryId: entry.id, correctedEntryId: current.id };
    }
    if (mode === "void_entry") {
      const entry = await tx.managementActualEntry.update({
        where: { id: request.targetId! },
        data: {
          status: "void",
          revision: { increment: 1 },
          voidApprovalRequestId: request.id,
          voidedById: actorId,
          voidedAt: now,
          voidReason: request.reason,
        },
      });
      return { actualEntryId: entry.id, status: entry.status };
    }
    throw new BadRequestException(`Unsupported management actual mode ${mode}`);
  }

  async markDecision(
    tx: Prisma.TransactionClient,
    request: ApprovalRequest,
    status: "rejected" | "cancelled" | "stale",
    actorId: string,
  ) {
    if (request.kind !== "operating_budget") return;
    const after = request.afterJson as Record<string, unknown>;
    const budgetId = String(after.budgetId ?? request.targetId ?? "");
    if (status === "cancelled") {
      await tx.operatingBudget.updateMany({
        where: { id: budgetId, approvalRequestId: request.id },
        data: {
          status: "draft",
          approvalRequestId: null,
          submittedAt: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      return;
    }
    await tx.operatingBudget.updateMany({
      where: { id: budgetId, approvalRequestId: request.id },
      data: {
        status: "rejected",
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
  }
}
