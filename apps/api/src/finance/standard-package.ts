import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mydaust/db";
import { projectedInstallmentStatus } from "./account-position.js";
import {
  displayFeeComponentLabel,
  feePackageTotalXof,
  splitEvenlyXof,
} from "./fee-components.js";

export type StandardPackageAssignment = {
  created: boolean;
  invoiceId: string;
  feeScheduleId: string;
  feeScheduleRevision: number;
};

/**
 * Assign the current administrator-approved package inside the caller's transaction.
 * Reading the schedule and writing the invoice in one serializable transaction keeps a
 * concurrent schedule approval from attaching a new account to a superseded revision.
 */
export async function assignStandardPackageInTransaction(
  tx: Prisma.TransactionClient,
  studentId: string,
  actorId: string,
  academicYearId?: string,
): Promise<StandardPackageAssignment> {
  const student = await tx.student.findFirst({
    where: {
      id: studentId,
      recordStatus: { in: ["pending_payment", "active"] },
    },
    select: { id: true },
  });
  if (!student) {
    throw new NotFoundException("Billable student not found");
  }

  const schedule = await tx.feeSchedule.findFirst({
    where: {
      academicYear: academicYearId
        ? { id: academicYearId }
        : { status: "active" },
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
      "The active academic year has no explicitly approved fee schedule",
    );
  }
  if (schedule.rows.some((row) => !row.dueOn)) {
    throw new BadRequestException(
      "Every approved standard installment must have a due date",
    );
  }
  const selectedComponents = schedule.components.filter(
    (component) => component.defaultSelected && component.annualAmountXof > 0,
  );
  if (selectedComponents.length === 0) {
    throw new BadRequestException(
      "The approved fee schedule has no default student charges",
    );
  }
  const full = feePackageTotalXof(selectedComponents);

  const existing = await tx.invoice.findFirst({
    where: {
      studentId,
      academicYearLabel: schedule.academicYearLabel,
      packageType: "standard_full",
      status: { not: "void" },
    },
  });
  if (existing) {
    return {
      created: false,
      invoiceId: existing.id,
      feeScheduleId: existing.feeScheduleId ?? schedule.id,
      feeScheduleRevision: existing.feeScheduleRevision ?? schedule.revision,
    };
  }

  const sameYearInvoices = await tx.invoice.findMany({
    where: {
      studentId,
      status: { not: "void" },
      totalAmount: { gt: 0 },
      OR: [
        { academicYearLabel: schedule.academicYearLabel },
        { term: { academicYear: { label: schedule.academicYearLabel } } },
      ],
    },
    include: { term: { include: { academicYear: true } } },
  });
  const legacy = sameYearInvoices.find(
    (invoice) => invoice.packageType === "standard_tuition_legacy",
  );
  if (legacy) {
    throw new BadRequestException(
      "This account has a legacy tuition plan; run the reviewed full-package conversion before assigning another package",
    );
  }
  const plausibleUnclassified = sameYearInvoices.find(
    (invoice) =>
      invoice.packageType === "custom" &&
      invoice.costCenterCode === "9100" &&
      (invoice.description === null ||
        /(tuition|annual\s+fees?|full\s+package|scolarit[ée])/i.test(
          invoice.description,
        )),
  );
  if (plausibleUnclassified) {
    throw new BadRequestException(
      `Invoice ${plausibleUnclassified.number ?? plausibleUnclassified.id} may already be this year's tuition bill; classify or resolve it before assigning the standard package`,
    );
  }

  const term = await tx.term.findFirst({
    where: { academicYear: { label: schedule.academicYearLabel } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  if (!term) {
    throw new BadRequestException(
      `Academic year ${schedule.academicYearLabel} has no billing term`,
    );
  }

  const installmentAmounts = splitEvenlyXof(full, schedule.rows.length);

  const invoice = await tx.invoice.create({
    data: {
      number: `BILL-${new Date().getUTCFullYear()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`,
      studentId,
      termId: term.id,
      totalAmount: full,
      costCenterCode: "9100",
      description: "Annual approved fee package",
      packageType: "standard_full",
      academicYearLabel: schedule.academicYearLabel,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      components: {
        create: selectedComponents.map((component) => ({
          scheduleComponentId: component.id,
          kind: component.key,
          label: component.label || displayFeeComponentLabel(component.key),
          costCenterCode: component.costCenterCode,
          amountXof: component.annualAmountXof,
        })),
      },
      plan: {
        create: {
          createdById: actorId,
          installments: {
            create: schedule.rows.map((row, index) => ({
              sequence: row.sequence,
              label: row.label,
              dueDate: row.dueOn!,
              amountDue: installmentAmounts[index]!,
              status: projectedInstallmentStatus({
                dueDate: row.dueOn!,
                amountDue: installmentAmounts[index]!,
                amountPaid: 0,
              }),
            })),
          },
        },
      },
    },
  });
  await tx.auditLog.create({
    data: {
      entity: "Invoice",
      entityId: invoice.id,
      action: "standard-package-billed",
      actorId,
      data: {
        amount: full,
        components: selectedComponents.map((component) => ({
          key: component.key,
          amountXof: component.annualAmountXof,
        })),
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
      },
    },
  });
  return {
    created: true,
    invoiceId: invoice.id,
    feeScheduleId: schedule.id,
    feeScheduleRevision: schedule.revision,
  };
}
