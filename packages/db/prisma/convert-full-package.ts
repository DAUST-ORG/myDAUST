import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { toDakarDateKey } from "@mydaust/shared";

/**
 * Convert every active student in an academic year to the live approved package.
 *
 * Dry run (default):
 *   pnpm --filter @mydaust/db convert:full-package
 * Commit only after the dry run reports zero unresolved accounts:
 *   CONFIRM=1 pnpm --filter @mydaust/db convert:full-package
 */

const prisma = new PrismaClient();

type Db = PrismaClient | Prisma.TransactionClient;
type Action = {
  studentId: string;
  studentNo: string;
  invoiceId?: string;
  action: "create" | "convert" | "refresh" | "unchanged";
};
type Issue = { studentId: string; studentNo: string; reason: string };

function installmentStatus(row: {
  dueDate: Date;
  amountDue: number;
  amountPaid: number;
}): "pending" | "partial" | "paid" | "overdue" {
  if (row.amountPaid >= row.amountDue) return "paid";
  if (toDakarDateKey(new Date()) > toDakarDateKey(row.dueDate))
    return "overdue";
  return row.amountPaid > 0 ? "partial" : "pending";
}

function splitXof(
  amountXof: number,
  balances: { id: string; availableXof: number }[],
) {
  const capacity = balances.reduce((sum, row) => sum + row.availableXof, 0);
  if (amountXof > capacity)
    throw new Error("Payment exceeds package-component capacity");
  if (amountXof === 0) return [];
  const weighted = balances
    .filter((row) => row.availableXof > 0)
    .map((row) => {
      const numerator = BigInt(amountXof) * BigInt(row.availableXof);
      const denominator = BigInt(capacity);
      return {
        ...row,
        amountXof: Number(numerator / denominator),
        remainder: numerator % denominator,
      };
    })
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id.localeCompare(b.id)
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let left = amountXof - weighted.reduce((sum, row) => sum + row.amountXof, 0);
  for (const row of weighted) {
    if (left === 0) break;
    if (row.amountXof < row.availableXof) {
      row.amountXof += 1;
      left -= 1;
    }
  }
  if (left !== 0) throw new Error("Component split did not reconcile");
  return weighted
    .filter((row) => row.amountXof > 0)
    .map(({ id, amountXof }) => ({ id, amountXof }));
}

async function loadSchedule(db: Db) {
  const label = process.env.ACADEMIC_YEAR?.trim();
  const schedule = await db.feeSchedule.findFirst({
    where: {
      status: "approved",
      ...(label
        ? { academicYearLabel: label }
        : { academicYear: { status: "active" } }),
    },
    orderBy: { revision: "desc" },
    include: {
      academicYear: { select: { id: true } },
      rows: { orderBy: { sequence: "asc" } },
    },
  });
  if (!schedule) throw new Error("No approved fee schedule was found.");
  if (!schedule.approvedById || !schedule.approvedAt) {
    throw new Error(
      "The live fee schedule has not been explicitly approved by an administrator.",
    );
  }
  if (schedule.rows.length === 0 || schedule.rows.some((row) => !row.dueOn)) {
    throw new Error("The approved fee schedule is incomplete.");
  }
  const totals = {
    tuition: schedule.rows.reduce((sum, row) => sum + row.amountTuitionXof, 0),
    housing: schedule.rows.reduce((sum, row) => sum + row.amountHousingXof, 0),
    cafeteria: schedule.rows.reduce(
      (sum, row) => sum + row.amountCafeteriaXof,
      0,
    ),
    full: schedule.rows.reduce((sum, row) => sum + row.amountFullXof, 0),
  };
  if (totals.full !== totals.tuition + totals.housing + totals.cafeteria) {
    throw new Error("Approved fee schedule components do not reconcile.");
  }
  return { schedule, totals };
}

async function analyze(db: Db) {
  const { schedule, totals } = await loadSchedule(db);
  const students = await db.student.findMany({
    where: { recordStatus: "active" },
    orderBy: { studentNo: "asc" },
    include: {
      invoices: {
        where: { status: { not: "void" } },
        include: {
          term: true,
          plan: { include: { installments: true } },
          feeSchedule: {
            include: { rows: { orderBy: { sequence: "asc" } } },
          },
          payments: { select: { id: true, status: true } },
          components: { include: { allocations: true } },
        },
      },
    },
  });
  const actions: Action[] = [];
  const issues: Issue[] = [];
  const scheduleSequences = new Set(schedule.rows.map((row) => row.sequence));
  for (const student of students) {
    const belongsToScheduleYear = (
      invoice: (typeof student.invoices)[number],
    ) =>
      invoice.academicYearLabel === schedule.academicYearLabel ||
      invoice.term.academicYearId === schedule.academicYear.id;
    const candidates = student.invoices.filter(
      (invoice) =>
        belongsToScheduleYear(invoice) &&
        (invoice.packageType === "standard_full" ||
          invoice.packageType === "standard_tuition_legacy"),
    );
    const plausibleOverlap = student.invoices.find((row) => {
      if (
        !belongsToScheduleYear(row) ||
        row.packageType !== "custom" ||
        row.totalAmount <= 0 ||
        row.costCenterCode !== "9100"
      ) {
        return false;
      }
      const description = row.description?.trim() ?? "";
      const exactStandardAmount =
        row.totalAmount === totals.tuition || row.totalAmount === totals.full;
      const tuitionLike =
        description.length === 0 ||
        /(tuition|annual\s+fees?|academic\s+fees?|school\s+fees?|full\s+package|scolarit[ée])/i.test(
          description,
        );
      const clearlyAdHoc =
        /(lab|technology|application|insurance|transport|library|damage|exam|graduation)/i.test(
          description,
        );
      return tuitionLike || (exactStandardAmount && !clearlyAdHoc);
    });
    if (candidates.length > 1) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "Multiple active standard invoices exist for the academic year",
      });
      continue;
    }
    if (candidates.length === 1 && plausibleOverlap) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: `A standard invoice and unclassified tuition-like invoice ${plausibleOverlap.number ?? plausibleOverlap.id} both exist for the academic year`,
      });
      continue;
    }
    const invoice = candidates[0];
    if (!invoice) {
      // A pre-migration tuition bill can still carry packageType=custom. Creating
      // alongside it would double-bill the student, so ambiguous current-year
      // 9100 invoices must be explicitly classified/resolved first.
      if (plausibleOverlap) {
        issues.push({
          studentId: student.id,
          studentNo: student.studentNo,
          reason: `Unclassified current-year tuition-like invoice ${plausibleOverlap.number ?? plausibleOverlap.id} must be resolved before creating a package`,
        });
        continue;
      }
      actions.push({
        studentId: student.id,
        studentNo: student.studentNo,
        action: "create",
      });
      continue;
    }
    if (
      !invoice.plan ||
      invoice.plan.installments.length !== schedule.rows.length ||
      invoice.plan.installments.some(
        (row) => !scheduleSequences.has(row.sequence),
      )
    ) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "Standard invoice does not have the approved installment shape",
      });
      continue;
    }
    if (
      invoice.description !== null &&
      !/(tuition|package|scolarité)/i.test(invoice.description)
    ) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "The exact-total invoice has a non-standard charge description",
      });
      continue;
    }
    const amountPatternMatches =
      invoice.packageType === "standard_tuition_legacy"
        ? (() => {
            const baseAmount = Math.floor(
              invoice.totalAmount / invoice.plan!.installments.length,
            );
            const amountRemainder =
              invoice.totalAmount -
              baseAmount * invoice.plan!.installments.length;
            return invoice.plan!.installments.every(
              (installment) =>
                installment.amountDue ===
                baseAmount + (installment.sequence <= amountRemainder ? 1 : 0),
            );
          })()
        : invoice.plan.installments.every((installment) => {
            const approved = schedule.rows.find(
              (row) => row.sequence === installment.sequence,
            );
            const linked = invoice.feeSchedule?.rows.find(
              (row) => row.sequence === installment.sequence,
            );
            return (
              installment.amountDue === approved?.amountFullXof ||
              installment.amountDue === linked?.amountFullXof
            );
          });
    if (!amountPatternMatches) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason:
          "Installment amounts do not match the approved legacy/full schedule pattern",
      });
      continue;
    }
    const unsafeInstallment = invoice.plan.installments.find((installment) => {
      const row = schedule.rows.find(
        (candidate) => candidate.sequence === installment.sequence,
      )!;
      return installment.amountPaid > row.amountFullXof;
    });
    if (unsafeInstallment) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: `Installment ${unsafeInstallment.sequence} is paid above the approved amount`,
      });
      continue;
    }
    if (invoice.amountPaid > totals.full) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "Collected amount exceeds the approved full package",
      });
      continue;
    }
    if (
      invoice.payments.some((payment) => payment.status === "refund_pending")
    ) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "A refund is still being processed on the standard invoice",
      });
      continue;
    }
    const allowedKinds = new Set(["tuition", "housing", "cafeteria"]);
    if (
      invoice.components.some((component) => !allowedKinds.has(component.kind))
    ) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: "Standard invoice contains a non-standard accounting component",
      });
      continue;
    }
    const netComponentAllocations = invoice.components.reduce(
      (invoiceTotal, component) =>
        invoiceTotal +
        component.allocations.reduce(
          (componentTotal, allocation) =>
            componentTotal +
            allocation.amountXof -
            allocation.refundedAmountXof,
          0,
        ),
      0,
    );
    if (netComponentAllocations !== invoice.amountPaid) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: `Paid history does not reconcile: invoice records ${invoice.amountPaid} XOF but component allocations record ${netComponentAllocations} XOF`,
      });
      continue;
    }
    const targetByKind = new Map([
      ["tuition", totals.tuition],
      ["housing", totals.housing],
      ["cafeteria", totals.cafeteria],
    ]);
    const overallocated = invoice.components.find(
      (component) =>
        component.allocations.reduce(
          (sum, allocation) =>
            sum + allocation.amountXof - allocation.refundedAmountXof,
          0,
        ) > (targetByKind.get(component.kind) ?? 0),
    );
    if (overallocated) {
      issues.push({
        studentId: student.id,
        studentNo: student.studentNo,
        reason: `${overallocated.kind} collections exceed the approved component amount`,
      });
      continue;
    }
    const componentsAligned = [...targetByKind].every(
      ([kind, amountXof]) =>
        invoice.components.find((component) => component.kind === kind)
          ?.amountXof === amountXof,
    );
    const aligned =
      invoice.packageType === "standard_full" &&
      invoice.totalAmount === totals.full &&
      invoice.feeScheduleId === schedule.id &&
      invoice.feeScheduleRevision === schedule.revision &&
      componentsAligned &&
      invoice.plan.installments.every((installment) => {
        const row = schedule.rows.find(
          (candidate) => candidate.sequence === installment.sequence,
        )!;
        return (
          installment.amountDue === row.amountFullXof &&
          toDakarDateKey(installment.dueDate) === toDakarDateKey(row.dueOn!)
        );
      });
    actions.push({
      studentId: student.id,
      studentNo: student.studentNo,
      invoiceId: invoice.id,
      action: aligned
        ? "unchanged"
        : invoice.packageType === "standard_tuition_legacy"
          ? "convert"
          : "refresh",
    });
  }
  return { schedule, totals, actions, issues };
}

async function createPackage(
  tx: Prisma.TransactionClient,
  action: Action,
  schedule: Awaited<ReturnType<typeof loadSchedule>>["schedule"],
  totals: Awaited<ReturnType<typeof loadSchedule>>["totals"],
) {
  const term = await tx.term.findFirst({
    where: { academicYear: { label: schedule.academicYearLabel } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  if (!term)
    throw new Error(`No billing term exists for ${schedule.academicYearLabel}`);
  await tx.invoice.create({
    data: {
      number: `BILL-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      studentId: action.studentId,
      termId: term.id,
      totalAmount: totals.full,
      status: "open",
      description: "Annual tuition, housing and cafeteria package",
      costCenterCode: "9100",
      packageType: "standard_full",
      academicYearLabel: schedule.academicYearLabel,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      components: {
        create: [
          {
            kind: "tuition",
            costCenterCode: "9100",
            amountXof: totals.tuition,
          },
          {
            kind: "housing",
            costCenterCode: "3700",
            amountXof: totals.housing,
          },
          {
            kind: "cafeteria",
            costCenterCode: "3600",
            amountXof: totals.cafeteria,
          },
        ],
      },
      plan: {
        create: {
          installments: {
            create: schedule.rows.map((row) => ({
              sequence: row.sequence,
              label: row.label,
              dueDate: row.dueOn!,
              amountDue: row.amountFullXof,
              status: installmentStatus({
                dueDate: row.dueOn!,
                amountDue: row.amountFullXof,
                amountPaid: 0,
              }),
            })),
          },
        },
      },
    },
  });
}

async function updatePackage(
  tx: Prisma.TransactionClient,
  action: Action,
  schedule: Awaited<ReturnType<typeof loadSchedule>>["schedule"],
  totals: Awaited<ReturnType<typeof loadSchedule>>["totals"],
) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: action.invoiceId! },
    include: {
      plan: { include: { installments: true } },
      payments: {
        orderBy: [{ settledAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!invoice.plan)
    throw new Error(`${action.studentNo}: payment plan disappeared`);
  for (const installment of invoice.plan.installments) {
    const row = schedule.rows.find(
      (candidate) => candidate.sequence === installment.sequence,
    );
    if (!row || installment.amountPaid > row.amountFullXof) {
      throw new Error(
        `${action.studentNo}: payment history no longer fits the schedule`,
      );
    }
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        label: row.label,
        dueDate: row.dueOn!,
        amountDue: row.amountFullXof,
        status: installmentStatus({
          dueDate: row.dueOn!,
          amountDue: row.amountFullXof,
          amountPaid: installment.amountPaid,
        }),
      },
    });
  }
  const componentDefs = [
    { kind: "tuition", costCenterCode: "9100", amountXof: totals.tuition },
    { kind: "housing", costCenterCode: "3700", amountXof: totals.housing },
    { kind: "cafeteria", costCenterCode: "3600", amountXof: totals.cafeteria },
  ];
  const components = [];
  for (const component of componentDefs) {
    components.push(
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: { invoiceId: invoice.id, kind: component.kind },
        },
        create: { invoiceId: invoice.id, ...component },
        update: {
          costCenterCode: component.costCenterCode,
          amountXof: component.amountXof,
        },
      }),
    );
  }

  const paymentIds = invoice.payments.map((payment) => payment.id);
  await tx.paymentComponentAllocation.deleteMany({
    where: { paymentId: { in: paymentIds } },
  });
  const remaining = new Map(
    components.map((component) => [component.id, component.amountXof]),
  );
  for (const payment of invoice.payments) {
    if (payment.status !== "success" && payment.status !== "refunded") continue;
    const credit = await tx.invoice.findUnique({
      where: { number: `CR-PAY-${payment.id}` },
      select: { totalAmount: true, status: true },
    });
    const creditXof =
      credit && credit.status !== "void" ? Math.max(0, -credit.totalAmount) : 0;
    const directXof = Math.max(0, payment.amount - creditXof);
    const split = splitXof(
      directXof,
      components.map((component) => ({
        id: component.id,
        availableXof: remaining.get(component.id) ?? 0,
      })),
    );
    if (split.length > 0) {
      await tx.paymentComponentAllocation.createMany({
        data: split.map((row) => ({
          paymentId: payment.id,
          invoiceComponentId: row.id,
          amountXof: row.amountXof,
          refundedAmountXof: payment.status === "refunded" ? row.amountXof : 0,
        })),
      });
    }
    if (payment.status === "success") {
      for (const row of split)
        remaining.set(row.id, (remaining.get(row.id) ?? 0) - row.amountXof);
    }
  }

  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      totalAmount: totals.full,
      status:
        invoice.amountPaid >= totals.full
          ? "paid"
          : invoice.amountPaid > 0
            ? "partial"
            : "open",
      description: "Annual tuition, housing and cafeteria package",
      costCenterCode: "9100",
      packageType: "standard_full",
      academicYearLabel: schedule.academicYearLabel,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      revision: { increment: 1 },
    },
  });
}

async function main() {
  const commit = process.env.CONFIRM === "1";
  const initial = await analyze(prisma);
  const report = {
    mode: commit ? "commit" : "dry-run",
    academicYear: initial.schedule.academicYearLabel,
    scheduleRevision: initial.schedule.revision,
    totals: initial.totals,
    counts: {
      activeStudents: initial.actions.length + initial.issues.length,
      create: initial.actions.filter((row) => row.action === "create").length,
      convert: initial.actions.filter((row) => row.action === "convert").length,
      refresh: initial.actions.filter((row) => row.action === "refresh").length,
      unchanged: initial.actions.filter((row) => row.action === "unchanged")
        .length,
      unresolved: initial.issues.length,
    },
    unresolved: initial.issues,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!commit) {
    console.log(
      JSON.stringify({
        event: "full-package-conversion",
        ok: initial.issues.length === 0,
        ...report,
        unresolved: undefined,
      }),
    );
    console.log(
      initial.issues.length === 0
        ? "Dry run clean. Re-run with CONFIRM=1 after backup and administrator review."
        : "Dry run only. Resolve every listed account before committing.",
    );
    return;
  }
  if (initial.issues.length > 0) {
    console.log(
      JSON.stringify({
        event: "full-package-conversion",
        ok: false,
        ...report,
        unresolved: undefined,
      }),
    );
    throw new Error("Conversion refused: dry run has unresolved accounts.");
  }

  await prisma.$transaction(
    async (tx) => {
      const reviewed = await analyze(tx);
      if (reviewed.issues.length > 0) {
        throw new Error(
          "Conversion refused: account state changed after dry run.",
        );
      }
      for (const action of reviewed.actions) {
        if (action.action === "create") {
          await createPackage(tx, action, reviewed.schedule, reviewed.totals);
        } else if (action.action !== "unchanged") {
          await updatePackage(tx, action, reviewed.schedule, reviewed.totals);
        }
      }
      await tx.auditLog.create({
        data: {
          entity: "FeeSchedule",
          entityId: reviewed.schedule.id,
          action: "full-package-conversion",
          data: {
            academicYear: reviewed.schedule.academicYearLabel,
            revision: reviewed.schedule.revision,
            counts: report.counts,
          },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
  console.log(
    JSON.stringify({
      event: "full-package-conversion",
      ok: true,
      ...report,
      unresolved: undefined,
    }),
  );
  console.log("Full-package conversion committed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
