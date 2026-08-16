import { BadRequestException } from "@nestjs/common";
import { Prisma, type PaymentMethod } from "@mydaust/db";
import { allocateProportionallyXof } from "./component-allocation.js";
import { projectedInstallmentStatus } from "./account-position.js";
import {
  type EnrollmentActivation,
  syncEnrollmentGateInTransaction,
} from "./admission-payment-gate.js";

export type HistoricalCashSettlementInput = {
  paymentId: string;
  invoiceId: string;
  studentId: string;
  amountXof: number;
  method: PaymentMethod;
  providerRef: string;
  externalReferenceFingerprintSha256?: string | null;
  settledAt: Date;
  actorId: string;
  importBatchId?: string;
  importRowKey?: string;
  importSheetName?: string;
  importRowNumber?: number;
  ipnPayload: Prisma.InputJsonValue;
  auditAction: string;
  auditData: Prisma.InputJsonValue;
  plannedInstallmentAllocations?: {
    installmentId: string;
    amountXof: number;
  }[];
  plannedComponentAllocations?: {
    invoiceComponentId: string;
    amountXof: number;
  }[];
};

export type HistoricalCashSettlementResult = {
  paymentId: string;
  activation: EnrollmentActivation | null;
};

export function assertHistoricalInstallmentAllocations(input: {
  paymentAmountXof: number;
  allocations: { installmentId: string; amountXof: number }[];
  capacities: Map<string, number>;
}): void {
  const totalsByInstallment = new Map<string, number>();
  let duplicateInstallment = false;
  for (const allocation of input.allocations) {
    if (totalsByInstallment.has(allocation.installmentId)) {
      duplicateInstallment = true;
    }
    totalsByInstallment.set(
      allocation.installmentId,
      (totalsByInstallment.get(allocation.installmentId) ?? 0) +
        allocation.amountXof,
    );
  }
  const allocationTotalXof = [...totalsByInstallment.values()].reduce(
    (sum, amountXof) => sum + amountXof,
    0,
  );
  if (
    duplicateInstallment ||
    allocationTotalXof !== input.paymentAmountXof ||
    [...totalsByInstallment].some(
      ([installmentId, amountXof]) =>
        !Number.isSafeInteger(amountXof) ||
        amountXof <= 0 ||
        !input.capacities.has(installmentId) ||
        amountXof > input.capacities.get(installmentId)!,
    )
  ) {
    throw new BadRequestException(
      "Reviewed installment allocations are stale or do not reconcile",
    );
  }
}

/**
 * Canonical in-transaction settlement primitive for reviewed historical cash.
 * It never creates account credit, always reconciles installment/component
 * allocations, and invokes the same enrollment gate as live settlements.
 */
export async function applyHistoricalCashSettlementInTransaction(
  tx: Prisma.TransactionClient,
  input: HistoricalCashSettlementInput,
): Promise<HistoricalCashSettlementResult> {
  if (!Number.isSafeInteger(input.amountXof) || input.amountXof <= 0) {
    throw new BadRequestException(
      "Historical cash must be a positive whole number of XOF",
    );
  }
  const duplicate = await tx.payment.findUnique({
    where: { providerRef: input.providerRef },
    select: {
      id: true,
      invoiceId: true,
      studentId: true,
      amount: true,
      status: true,
    },
  });
  if (duplicate) {
    if (
      duplicate.id === input.paymentId &&
      duplicate.invoiceId === input.invoiceId &&
      duplicate.studentId === input.studentId &&
      duplicate.amount === input.amountXof &&
      duplicate.status === "success"
    ) {
      return { paymentId: duplicate.id, activation: null };
    }
    throw new BadRequestException(
      "Historical payment reference is already attached to different cash",
    );
  }

  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      plan: {
        include: {
          installments: {
            orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
          },
        },
      },
      components: {
        include: { allocations: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!invoice || invoice.studentId !== input.studentId) {
    throw new BadRequestException(
      "Historical payment target does not match the reviewed student invoice",
    );
  }
  if (invoice.status === "void") {
    throw new BadRequestException(
      "Historical cash cannot target a void invoice",
    );
  }
  const remainingInvoiceXof = invoice.totalAmount - invoice.amountPaid;
  if (input.amountXof > remainingInvoiceXof) {
    throw new BadRequestException(
      "Historical cash exceeds the reviewed invoice balance",
    );
  }
  if (!invoice.plan || invoice.plan.installments.length === 0) {
    throw new BadRequestException(
      "Historical cash requires a reconciled payment plan",
    );
  }
  const installmentDueXof = invoice.plan.installments.reduce(
    (sum, installment) => sum + installment.amountDue,
    0,
  );
  const installmentPaidXof = invoice.plan.installments.reduce(
    (sum, installment) => sum + installment.amountPaid,
    0,
  );
  if (
    installmentDueXof !== invoice.totalAmount ||
    installmentPaidXof !== invoice.amountPaid
  ) {
    throw new BadRequestException(
      "Invoice installments do not reconcile before historical settlement",
    );
  }
  if (invoice.components.length === 0) {
    throw new BadRequestException(
      "Historical cash requires reconciled invoice components",
    );
  }
  const componentTotalXof = invoice.components.reduce(
    (sum, component) => sum + component.amountXof,
    0,
  );
  const componentPaidXof = invoice.components.reduce(
    (sum, component) =>
      sum +
      component.allocations.reduce(
        (allocated, allocation) =>
          allocated + allocation.amountXof - allocation.refundedAmountXof,
        0,
      ),
    0,
  );
  if (
    componentTotalXof !== invoice.totalAmount ||
    componentPaidXof !== invoice.amountPaid
  ) {
    throw new BadRequestException(
      "Invoice components do not reconcile before historical settlement",
    );
  }

  const installmentById = new Map(
    invoice.plan.installments.map((installment) => [
      installment.id,
      installment,
    ]),
  );
  let installmentAllocations = input.plannedInstallmentAllocations;
  if (!installmentAllocations) {
    let remaining = input.amountXof;
    installmentAllocations = [];
    for (const installment of invoice.plan.installments) {
      if (remaining === 0) break;
      const capacity = installment.amountDue - installment.amountPaid;
      const amountXof = Math.min(capacity, remaining);
      if (amountXof > 0) {
        installmentAllocations.push({
          installmentId: installment.id,
          amountXof,
        });
        remaining -= amountXof;
      }
    }
    if (remaining !== 0) {
      throw new BadRequestException(
        "Historical cash cannot reconcile to installment capacity",
      );
    }
  }
  assertHistoricalInstallmentAllocations({
    paymentAmountXof: input.amountXof,
    allocations: installmentAllocations,
    capacities: new Map(
      [...installmentById].map(([id, installment]) => [
        id,
        installment.amountDue - installment.amountPaid,
      ]),
    ),
  });

  const componentById = new Map(
    invoice.components.map((component) => [component.id, component]),
  );
  let componentAllocations = input.plannedComponentAllocations;
  if (!componentAllocations) {
    componentAllocations = allocateProportionallyXof(
      input.amountXof,
      invoice.components.map((component) => ({
        id: component.id,
        availableXof:
          component.amountXof -
          component.allocations.reduce(
            (sum, allocation) =>
              sum + allocation.amountXof - allocation.refundedAmountXof,
            0,
          ),
      })),
    ).map((allocation) => ({
      invoiceComponentId: allocation.id,
      amountXof: allocation.amountXof,
    }));
  }
  if (
    componentAllocations.reduce(
      (sum, allocation) => sum + allocation.amountXof,
      0,
    ) !== input.amountXof ||
    componentAllocations.some((allocation) => {
      const component = componentById.get(allocation.invoiceComponentId);
      if (!component || allocation.amountXof <= 0) return true;
      const paid = component.allocations.reduce(
        (sum, row) => sum + row.amountXof - row.refundedAmountXof,
        0,
      );
      return allocation.amountXof > component.amountXof - paid;
    })
  ) {
    throw new BadRequestException(
      "Reviewed component allocations are stale or do not reconcile",
    );
  }

  await tx.payment.create({
    data: {
      id: input.paymentId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
      amount: input.amountXof,
      method: input.method,
      status: "success",
      provider: "historical_import",
      providerRef: input.providerRef,
      externalReferenceFingerprintSha256:
        input.externalReferenceFingerprintSha256 ?? null,
      source: "legacy_cohort_import",
      initiatedById: input.actorId,
      settledAt: input.settledAt,
      importBatchId: input.importBatchId,
      importRowKey: input.importRowKey,
      importSheetName: input.importSheetName,
      importRowNumber: input.importRowNumber,
      ipnPayload: input.ipnPayload,
    },
  });
  await tx.paymentAllocation.createMany({
    data: installmentAllocations.map((allocation) => ({
      paymentId: input.paymentId,
      installmentId: allocation.installmentId,
      amount: allocation.amountXof,
    })),
  });
  for (const allocation of installmentAllocations) {
    const installment = installmentById.get(allocation.installmentId)!;
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
  await tx.paymentComponentAllocation.createMany({
    data: componentAllocations.map((allocation) => ({
      paymentId: input.paymentId,
      invoiceComponentId: allocation.invoiceComponentId,
      amountXof: allocation.amountXof,
    })),
  });
  const amountPaid = invoice.amountPaid + input.amountXof;
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
      entityId: input.paymentId,
      action: input.auditAction,
      actorId: input.actorId,
      data: input.auditData,
    },
  });
  const gate = await syncEnrollmentGateInTransaction(tx, {
    invoiceId: invoice.id,
    paymentId: input.paymentId,
    actorId: input.actorId,
    inFlightRotationPolicy: "preserve",
  });
  return {
    paymentId: input.paymentId,
    activation: gate?.activation ?? null,
  };
}
