import type { Prisma } from "@mydaust/db";
import { projectedInstallmentStatus } from "./account-position.js";
import { feePackageTotalXof, splitEvenlyXof } from "./fee-components.js";
import { SEED_SCHOLARSHIPS } from "./scholarship-catalog.js";
import { TARGET_CATALOG } from "./student-billing-import.catalog.js";
import type { BillingRepriceAction } from "./student-billing-import.planner.js";

/**
 * Batch applier for a billing plan, mirroring applyInvoiceComponentSelection.
 *
 * Deliberately the catalog-selection path and not the installment grid: component
 * amounts always come from the approved schedule, so no invoice acquires
 * paymentPlanOverride, every one stays a standard package, and restore-to-standard
 * keeps working. Whatever the workbook bills below the catalog total is carried as
 * a credit rather than by bending a component.
 */

export class BillingApplyError extends Error {}

type Tx = Prisma.TransactionClient;

export interface ApplyContext {
  actorId: string;
  academicYearLabel: string;
  batchLabel: string;
}

/**
 * Adds the workbook's charges and awards to the approved schedule as a new
 * revision. Every added component is defaultSelected false, so no student's total
 * moves; the revision exists so the keys are selectable at all.
 */
export async function applyCatalogRevision(
  tx: Tx,
  context: ApplyContext,
  reason: string,
): Promise<{ scheduleId: string; revision: number; relinkedInvoices: number }> {
  const current = await tx.feeSchedule.findFirst({
    where: { academicYearLabel: context.academicYearLabel, status: "approved" },
    orderBy: { revision: "desc" },
    include: { rows: true, components: true, scholarships: true },
  });
  if (!current) {
    throw new BillingApplyError(
      `No approved fee schedule for ${context.academicYearLabel}`,
    );
  }
  const existingKeys = new Set(
    current.components.map((component) => component.key),
  );
  const missing = TARGET_CATALOG.filter(
    (component) => !existingKeys.has(component.key),
  );
  if (missing.length === 0) {
    // Already landed by a previous run. Creating another revision would supersede a
    // good one and orphan nothing useful, so leave the catalog alone.
    return {
      scheduleId: current.id,
      revision: current.revision,
      relinkedInvoices: 0,
    };
  }
  const merged = [
    ...current.components.map((component) => ({
      key: component.key,
      label: component.label,
      description: component.description,
      costCenterCode: component.costCenterCode,
      annualAmountXof: component.annualAmountXof,
      defaultSelected: component.defaultSelected,
      sortOrder: component.sortOrder,
    })),
    ...TARGET_CATALOG.filter(
      (component) => !existingKeys.has(component.key),
    ).map((component) => ({
      key: component.key,
      label: component.label,
      description: component.description,
      costCenterCode: component.costCenterCode,
      annualAmountXof: component.annualAmountXof,
      defaultSelected: false,
      sortOrder: component.sortOrder,
    })),
  ];

  const next = await tx.feeSchedule.create({
    data: {
      academicYearLabel: current.academicYearLabel,
      revision: current.revision + 1,
      status: "approved",
      reason,
      createdById: context.actorId,
      approvedById: context.actorId,
      approvedAt: new Date(),
      rows: {
        create: current.rows.map((row) => ({
          academicYearLabel: row.academicYearLabel,
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
      components: { create: merged },
      scholarships: {
        create:
          current.scholarships.length > 0
            ? current.scholarships.map((scholarship) => ({
                key: scholarship.key,
                label: scholarship.label,
                description: scholarship.description,
                basis: scholarship.basis,
                rateMode: scholarship.rateMode,
                pctBps: scholarship.pctBps,
                flatXof: scholarship.flatXof,
                costCenterCode: scholarship.costCenterCode,
                active: scholarship.active,
                sortOrder: scholarship.sortOrder,
              }))
            : SEED_SCHOLARSHIPS.map((scholarship) => ({
                key: scholarship.key,
                label: scholarship.label,
                description: scholarship.description,
                basis: scholarship.basis,
                rateMode: scholarship.rateMode,
                pctBps: scholarship.pctBps ?? null,
                flatXof: scholarship.flatXof ?? null,
                costCenterCode: scholarship.costCenterCode,
                active: scholarship.active,
                sortOrder: scholarship.sortOrder,
              })),
      },
    },
  });

  await tx.feeSchedule.update({
    where: { id: current.id },
    data: { status: "superseded" },
  });
  const relinked = await tx.invoice.updateMany({
    where: {
      feeScheduleId: current.id,
      packageType: "standard_full",
      status: { not: "void" },
    },
    data: { feeScheduleId: next.id, feeScheduleRevision: next.revision },
  });
  await tx.auditLog.create({
    data: {
      entity: "FeeSchedule",
      entityId: next.id,
      action: "billing-workbook-catalog-revision",
      actorId: context.actorId,
      data: {
        batchLabel: context.batchLabel,
        fromRevision: current.revision,
        toRevision: next.revision,
        addedComponentKeys: merged
          .filter((component) => !existingKeys.has(component.key))
          .map((component) => component.key),
        relinkedInvoices: relinked.count,
      },
    },
  });
  return {
    scheduleId: next.id,
    revision: next.revision,
    relinkedInvoices: relinked.count,
  };
}

async function applyOne(
  tx: Tx,
  action: BillingRepriceAction,
  context: ApplyContext,
  scheduleId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: action.invoiceId },
    include: {
      components: { include: { allocations: true } },
      plan: { include: { installments: true } },
    },
  });
  if (invoice.revision !== action.baseRevision) {
    throw new BillingApplyError(
      `${action.studentNo} changed since the plan was made (revision ${invoice.revision} vs ${action.baseRevision})`,
    );
  }
  const catalog = await tx.feeScheduleComponent.findMany({
    where: { scheduleId },
  });
  const byKey = new Map(catalog.map((component) => [component.key, component]));

  for (const key of action.keysToRemove) {
    const existing = invoice.components.find(
      (component) => component.kind === key,
    );
    if (existing) {
      // The reference refuses this in three places: cash already booked against a
      // component cannot be stranded by removing it. Zeroing the amount while
      // PaymentComponentAllocation rows still point at it corrupts the revenue split.
      const allocated = existing.allocations.reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      );
      if (allocated > 0) {
        throw new BillingApplyError(
          `${action.studentNo}: component ${key} already has ${allocated} XOF collected against it; Finance must resolve or refund that allocation before the charge can be removed`,
        );
      }
      await tx.invoiceComponent.delete({ where: { id: existing.id } });
    }
    await tx.invoiceComponentOverride.upsert({
      where: {
        invoiceId_componentKey: { invoiceId: invoice.id, componentKey: key },
      },
      create: {
        invoiceId: invoice.id,
        componentKey: key,
        included: false,
        createdById: context.actorId,
      },
      update: { included: false, createdById: context.actorId },
    });
  }

  for (const key of action.keysToAdd) {
    const component = byKey.get(key);
    if (!component) {
      throw new BillingApplyError(`Catalog has no component ${key}`);
    }
    await tx.invoiceComponent.upsert({
      where: { invoiceId_kind: { invoiceId: invoice.id, kind: key } },
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
    await tx.invoiceComponentOverride.upsert({
      where: {
        invoiceId_componentKey: { invoiceId: invoice.id, componentKey: key },
      },
      create: {
        invoiceId: invoice.id,
        componentKey: key,
        included: true,
        createdById: context.actorId,
      },
      update: { included: true, createdById: context.actorId },
    });
  }

  const selected = action.selectedKeys
    .map((key) => byKey.get(key))
    .filter((component): component is NonNullable<typeof component> =>
      Boolean(component),
    );
  if (selected.length !== action.selectedKeys.length) {
    throw new BillingApplyError(
      `${action.studentNo}: the catalog is missing one of ${action.selectedKeys.join(", ")}`,
    );
  }
  if (selected.length === 0) {
    throw new BillingApplyError(
      `${action.studentNo}: a package must retain at least one charge`,
    );
  }
  const total = feePackageTotalXof(selected);
  if (total !== action.catalogTotalXof) {
    throw new BillingApplyError(
      `${action.studentNo}: catalog now totals ${total} XOF, not the planned ${action.catalogTotalXof}`,
    );
  }
  if (action.residualXof > 0) {
    throw new BillingApplyError(
      `${action.studentNo}: the workbook bills ${action.residualXof} XOF above the catalog; an extra charge is not written by this tool`,
    );
  }

  // Components in neither keysToAdd nor keysToRemove are left alone above, so the
  // written rows must be reconciled against the total rather than assumed to match.
  const written = await tx.invoiceComponent.findMany({
    where: { invoiceId: invoice.id },
    select: { kind: true, amountXof: true },
  });
  const writtenTotal = written.reduce(
    (sum, component) => sum + component.amountXof,
    0,
  );
  const writtenKeys = new Set(written.map((component) => component.kind));
  const wantedKeys = new Set(action.selectedKeys);
  const extra = [...writtenKeys].filter((key) => !wantedKeys.has(key));
  const absent = [...wantedKeys].filter((key) => !writtenKeys.has(key));
  if (extra.length > 0 || absent.length > 0) {
    throw new BillingApplyError(
      `${action.studentNo}: component rows do not match the selection (unexpected ${extra.join(", ") || "none"}; missing ${absent.join(", ") || "none"})`,
    );
  }
  if (writtenTotal !== total) {
    throw new BillingApplyError(
      `${action.studentNo}: components sum to ${writtenTotal} XOF but the package is ${total} XOF`,
    );
  }
  if (total < invoice.amountPaid) {
    throw new BillingApplyError(
      `${action.studentNo}: package ${total} XOF is below ${invoice.amountPaid} XOF already paid`,
    );
  }

  const installments = [...(invoice.plan?.installments ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  if (installments.length === 0) {
    throw new BillingApplyError(`${action.studentNo} has no installment plan`);
  }
  const amounts = splitEvenlyXof(total, installments.length);
  for (const [index, installment] of installments.entries()) {
    const amountDue = amounts[index]!;
    if (amountDue < installment.amountPaid) {
      throw new BillingApplyError(
        `${action.studentNo}: installment ${installment.sequence} would fall to ${amountDue} XOF, below ${installment.amountPaid} XOF paid`,
      );
    }
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
      action: "billing-workbook-repriced",
      actorId: context.actorId,
      data: {
        batchLabel: context.batchLabel,
        studentNo: action.studentNo,
        fromTotalXof: action.currentTotalXof,
        toTotalXof: total,
        workbookTotalXof: action.workbookTotalXof,
        residualXof: action.residualXof,
        keysAdded: action.keysToAdd,
        keysRemoved: action.keysToRemove,
      },
    },
  });
}

/**
 * The discount that takes a student from the catalog total down to what the
 * workbook bills. A separate negative invoice, which is how every other credit in
 * this system is represented.
 */
export function workbookCreditNumber(
  batchLabel: string,
  studentNo: string,
): string {
  return `WB-CR-${batchLabel}-${studentNo}`;
}

async function applyResidualCredit(
  tx: Tx,
  action: BillingRepriceAction,
  context: ApplyContext,
): Promise<boolean> {
  if (action.residualXof >= 0) return false;

  // Invoice.number is unique, so this is a functional key and not a label: a second
  // run of the same batch finds the credit already written and does nothing, rather
  // than halving the student's balance again.
  const number = workbookCreditNumber(context.batchLabel, action.studentNo);
  const already = await tx.invoice.findUnique({
    where: { number },
    select: { id: true, totalAmount: true },
  });
  if (already) {
    if (already.totalAmount !== -Math.abs(action.residualXof)) {
      throw new BillingApplyError(
        `${action.studentNo}: credit ${number} already exists for ${already.totalAmount} XOF, not ${-Math.abs(action.residualXof)}`,
      );
    }
    return false;
  }

  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: action.invoiceId },
    select: { termId: true, academicYearLabel: true },
  });
  const credit = await tx.invoice.create({
    data: {
      number,
      studentId: action.studentId,
      termId: invoice.termId,
      academicYearLabel: invoice.academicYearLabel,
      totalAmount: -Math.abs(action.residualXof),
      amountPaid: 0,
      status: "paid",
      packageType: "credit",
      costCenterCode: "9100",
      description: `Scholarship — workbook billing ${action.workbookTotalXof} XOF`,
    },
  });
  await tx.auditLog.create({
    data: {
      entity: "Invoice",
      entityId: credit.id,
      action: "billing-workbook-credit",
      actorId: context.actorId,
      data: {
        batchLabel: context.batchLabel,
        studentNo: action.studentNo,
        packageInvoiceId: action.invoiceId,
        amountXof: -Math.abs(action.residualXof),
      },
    },
  });
  return true;
}

export async function applyBillingPlanInTransaction(
  tx: Tx,
  actions: readonly BillingRepriceAction[],
  context: ApplyContext,
  catalogReason: string,
): Promise<{
  scheduleId: string;
  scheduleRevision: number;
  relinkedInvoices: number;
  repricedStudents: number;
  creditsWritten: number;
}> {
  const revision = await applyCatalogRevision(tx, context, catalogReason);
  let credits = 0;
  for (const action of actions) {
    await applyOne(tx, action, context, revision.scheduleId);
    if (await applyResidualCredit(tx, action, context)) credits += 1;
  }
  return {
    scheduleId: revision.scheduleId,
    scheduleRevision: revision.revision,
    relinkedInvoices: revision.relinkedInvoices,
    repricedStudents: actions.length,
    creditsWritten: credits,
  };
}
