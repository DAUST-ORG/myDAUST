import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@mydaust/db";
import { projectedInstallmentStatus } from "./account-position.js";
import type { OpeningBalanceManifest } from "./opening-balance-import.manifest.js";
import {
  type OpeningBalancePlan,
  type OpeningBalanceStudent,
  planOpeningBalanceImport,
} from "./opening-balance-import.planner.js";

export const openingBalanceDryRunExitCode = 2;

export class OpeningBalanceBlockedError extends Error {
  constructor(readonly plan: OpeningBalancePlan) {
    super(
      `Opening-balance import blocked by ${plan.blockers.length} finding(s)`,
    );
    this.name = "OpeningBalanceBlockedError";
  }
}

export interface OpeningBalanceContext {
  manifestSha256: string;
  actorId: string;
}

type Db = PrismaClient;

export async function loadOpeningBalanceStudents(
  prisma: Pick<Db, "student">,
  academicYearLabel: string,
): Promise<OpeningBalanceStudent[]> {
  const students = await prisma.student.findMany({
    select: {
      id: true,
      studentNo: true,
      recordStatus: true,
      payments: {
        where: { status: "success" },
        select: { id: true, amount: true, settledAt: true, method: true },
      },
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
          plan: {
            select: {
              installments: {
                select: {
                  id: true,
                  sequence: true,
                  amountDue: true,
                  amountPaid: true,
                },
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
      recordStatus:
        student.recordStatus as OpeningBalanceStudent["recordStatus"],
      payments: student.payments.map((payment) => ({
        id: payment.id,
        amountXof: payment.amount,
        settledAt: payment.settledAt ? payment.settledAt.toISOString() : null,
        method: payment.method,
      })),
      invoice: invoice
        ? {
            id: invoice.id,
            totalAmount: invoice.totalAmount,
            amountPaid: invoice.amountPaid,
            installments: invoice.plan?.installments ?? [],
          }
        : null,
    };
  });
}

export async function planOpeningBalanceFromDatabase(
  prisma: Pick<Db, "student">,
  manifest: OpeningBalanceManifest,
): Promise<OpeningBalancePlan> {
  const students = await loadOpeningBalanceStudents(
    prisma,
    manifest.academicYearLabel,
  );
  return planOpeningBalanceImport(manifest, students);
}

/**
 * Posts reconstructed cash in one transaction.
 *
 * Every payment is written as `legacy_unknown` with a null `settledAt`, which is
 * what the source supports and what the schema now enforces for this rail. The
 * batch row carries the three has* flags and the reconstruction note, so the
 * absence of dates and methods is a recorded fact rather than a silent gap.
 */
export async function executeOpeningBalanceImport(
  prisma: Db,
  manifest: OpeningBalanceManifest,
  context: OpeningBalanceContext,
): Promise<{ batchId: string; postedRows: number; postedXof: number }> {
  const existing = await prisma.openingBalanceBatch.findUnique({
    where: { sourceSha256: manifest.sourceWorkbookSha256 },
    select: { id: true, status: true, manifestSha256: true },
  });
  if (existing) {
    if (
      existing.status === "posted" &&
      existing.manifestSha256 === context.manifestSha256
    ) {
      throw new Error(
        `This workbook and manifest were already posted as batch ${existing.id}`,
      );
    }
    throw new Error(
      `Workbook ${manifest.sourceWorkbookSha256} already has batch ${existing.id} in status ${existing.status}`,
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const students = await loadOpeningBalanceStudents(
        tx,
        manifest.academicYearLabel,
      );
      const plan = planOpeningBalanceImport(manifest, students);
      if (plan.blockers.length > 0) throw new OpeningBalanceBlockedError(plan);

      const batch = await tx.openingBalanceBatch.create({
        data: {
          sourceFileName: manifest.sourceFileName,
          sourceSha256: manifest.sourceWorkbookSha256,
          manifestSha256: context.manifestSha256,
          academicYearLabel: manifest.academicYearLabel,
          asOfDate: new Date(`${manifest.asOfDate}T00:00:00.000Z`),
          status: "posted",
          hasSettlementDates: false,
          hasPaymentMethods: false,
          hasExternalRefs: false,
          reconstructionNote: manifest.reconstructionNote,
          totalRows: plan.rowCount,
          postedRows: plan.postable.length,
          skippedRows: plan.alreadyRecorded.length,
          sourceTotalXof: BigInt(plan.totals.manifestTotalXof),
          postedXof: BigInt(plan.totals.postableXof),
          createdById: context.actorId,
          postedAt: new Date(),
        },
      });

      for (const planned of plan.postable) {
        const paymentId = randomUUID();
        await tx.payment.create({
          data: {
            id: paymentId,
            invoiceId: planned.invoiceId,
            studentId: planned.studentId,
            amount: planned.amountXof,
            method: "legacy_unknown",
            status: "success",
            provider: "opening_balance_reconstruction",
            providerRef: planned.providerRef,
            source: "finance_workbook_reconstruction",
            settledAt: null,
            openingBalanceBatchId: batch.id,
            importRowKey: planned.rowKey,
            ipnPayload: {
              sourceWorkbookSha256: manifest.sourceWorkbookSha256,
              manifestSha256: context.manifestSha256,
              asOfDate: manifest.asOfDate,
              rowKey: planned.rowKey,
              reconstruction: true,
              sourceHadSettlementDate: false,
              sourceHadMethod: false,
              sourceHadReference: false,
              unallocatedXof: planned.unallocatedXof,
            },
          },
        });

        if (planned.allocations.length > 0) {
          await tx.paymentAllocation.createMany({
            data: planned.allocations.map((allocation) => ({
              paymentId,
              installmentId: allocation.installmentId,
              amount: allocation.amountXof,
            })),
          });
        }
        for (const allocation of planned.allocations) {
          const installment = await tx.installment.findUniqueOrThrow({
            where: { id: allocation.installmentId },
          });
          const amountPaid = installment.amountPaid + allocation.amountXof;
          await tx.installment.update({
            where: { id: installment.id },
            data: {
              amountPaid,
              status: projectedInstallmentStatus({
                dueDate: installment.dueDate,
                amountDue: installment.amountDue,
                amountPaid,
              }),
            },
          });
        }

        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: planned.invoiceId },
        });
        const amountPaid = invoice.amountPaid + planned.amountXof;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid,
            revision: { increment: 1 },
            status: amountPaid >= invoice.totalAmount ? "paid" : "partial",
          },
        });

        await tx.auditLog.create({
          data: {
            entity: "Payment",
            entityId: paymentId,
            action: "opening-balance-reconstructed",
            actorId: context.actorId,
            data: {
              batchId: batch.id,
              sourceSha256: manifest.sourceWorkbookSha256,
              manifestSha256: context.manifestSha256,
              rowKey: planned.rowKey,
              invoiceId: planned.invoiceId,
              amountXof: planned.amountXof,
              asOfDate: manifest.asOfDate,
              settlementDateKnown: false,
              methodKnown: false,
            },
          },
        });
      }

      return {
        batchId: batch.id,
        postedRows: plan.postable.length,
        postedXof: plan.totals.postableXof,
      };
    },
    { isolationLevel: "Serializable", maxWait: 15_000, timeout: 120_000 },
  );
}
