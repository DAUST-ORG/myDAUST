import type { PrismaClient } from "@mydaust/db";
import type { StudentBillingManifest } from "./student-billing-import.manifest.js";
import {
  type BillingPlan,
  type StudentSnapshot,
  planStudentBillingImport,
} from "./student-billing-import.planner.js";
import { TARGET_CATALOG } from "./student-billing-import.catalog.js";
import { SEED_SCHOLARSHIPS } from "./scholarship-catalog.js";

export class StudentBillingImportBlockedError extends Error {
  constructor(readonly plan: BillingPlan) {
    super(`Billing import blocked by ${plan.blockers.length} finding(s)`);
    this.name = "StudentBillingImportBlockedError";
  }
}

export const studentBillingDryRunExitCode = 2;

type Db = Pick<PrismaClient, "student" | "feeSchedule">;

/**
 * Reads every student holding a live annual package for the year, plus their
 * installment-level cash. The planner needs installment `amountPaid` to refuse a
 * downward re-price that would strand collected money.
 */
export async function loadStudentSnapshots(
  prisma: Db,
  academicYearLabel: string,
): Promise<StudentSnapshot[]> {
  const students = await prisma.student.findMany({
    select: {
      id: true,
      studentNo: true,
      recordStatus: true,
      invoices: {
        where: {
          packageType: "standard_full",
          status: { not: "void" },
          academicYearLabel,
        },
        select: {
          id: true,
          totalAmount: true,
          amountPaid: true,
          revision: true,
          components: {
            select: {
              kind: true,
              allocations: {
                select: { amountXof: true, refundedAmountXof: true },
              },
            },
          },
          componentOverrides: {
            select: { componentKey: true, included: true },
          },
          plan: {
            select: {
              installments: {
                select: { sequence: true, amountDue: true, amountPaid: true },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      },
    },
  });
  return students.map((student) => {
    const invoice = student.invoices[0] ?? null;
    return {
      studentId: student.id,
      studentNo: student.studentNo,
      recordStatus: student.recordStatus as StudentSnapshot["recordStatus"],
      invoice: invoice
        ? {
            id: invoice.id,
            totalAmount: invoice.totalAmount,
            amountPaid: invoice.amountPaid,
            revision: invoice.revision,
            installments: invoice.plan?.installments ?? [],
            selectedKeys: invoice.components.map((component) => component.kind),
            collectedByComponentKey: Object.fromEntries(
              invoice.components.map((component) => [
                component.kind,
                component.allocations.reduce(
                  (sum, allocation) =>
                    sum + allocation.amountXof - allocation.refundedAmountXof,
                  0,
                ),
              ]),
            ),
          }
        : null,
    };
  });
}

/**
 * The workbook prices housing tiers, insurance and deposits that the live catalog
 * does not yet carry. Adding them is an ordinary fee-schedule revision — the keys
 * `student_insurance` and `housing_deposit*` are not on the reserved list, which
 * holds only the exact strings "application_fee" and "insurance".
 *
 * The run refuses until every key is present, because component selection writes
 * `catalog.annualAmountXof`: a key that does not exist cannot be selected.
 */
export async function missingCatalogKeys(
  prisma: Db,
  academicYearLabel: string,
): Promise<string[]> {
  const schedule = await prisma.feeSchedule.findFirst({
    where: { academicYearLabel, status: "approved" },
    orderBy: { revision: "desc" },
    select: { components: { select: { key: true } } },
  });
  const present = new Set(
    schedule?.components.map((component) => component.key) ?? [],
  );
  return TARGET_CATALOG.map((c) => c.key).filter((key) => !present.has(key));
}

export interface BillingDryRun {
  plan: BillingPlan;
  missingCatalogKeys: readonly string[];
  ok: boolean;
}

export async function planStudentBillingImportFromDatabase(
  prisma: Db,
  manifest: StudentBillingManifest,
): Promise<BillingDryRun> {
  const [snapshots, missing] = await Promise.all([
    loadStudentSnapshots(prisma, manifest.academicYearLabel),
    missingCatalogKeys(prisma, manifest.academicYearLabel),
  ]);
  const plan = planStudentBillingImport(manifest, snapshots);
  return {
    plan,
    missingCatalogKeys: missing,
    ok: plan.blockers.length === 0 && missing.length === 0,
  };
}

/**
 * Ordering the write path must follow, because the catalog revision relinks every
 * live invoice for the year and increments `Invoice.revision` on all of them:
 *
 *   1. Approve the fee-schedule revision adding TARGET_CATALOG, every new key
 *      `defaultSelected: false` so no student's total moves.
 *   2. Re-run the dry run. Every baseRevision captured before step 1 is now stale
 *      and would apply nothing.
 *   3. Per student, request and approve a component selection, then the residual
 *      credit or charge.
 *   4. Run reconcile:installment-statuses.
 *
 * Step 1 also fans the enrollment gate over every payment_pending applicant and
 * fails closed if one has proof under review, so clear pending submissions first.
 *
 * AGENTS.md forbids an agent running a bulk operation with CONFIRM=1 on its own
 * initiative; this stays a plan-only tool until an operator drives it.
 */
export async function executeStudentBillingImport(): Promise<never> {
  throw new Error(
    "Apply a billing plan through student-billing-import.driver.ts, which drives the admin approval endpoints. A direct transaction here would skip ApprovalRequest and leave paymentPlanOverride false, which turns restore-to-standard into a silent no-op.",
  );
}

/** The fee-plan payload that must be approved before any student can be repriced. */
export function catalogRevisionPayload(reason: string) {
  return {
    reason,
    components: TARGET_CATALOG.map((component) => ({ ...component })),
    scholarships: SEED_SCHOLARSHIPS.map((scholarship) => ({ ...scholarship })),
  };
}
