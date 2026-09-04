import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import { FinanceService } from "./finance.service.js";

const SCHEMA = `approval_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

let prisma: PrismaClient;
let approvals: FinanceApprovalsService;
let finance: FinanceService;
let admin: AuthUser;
let bursar: AuthUser;
let scheduleId: string;
let invoiceId: string;
let studentId: string;
let originalInstallmentIds: string[];

describe.skipIf(!DB_URL)("protected finance approvals", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    approvals = new FinanceApprovalsService(prisma as never);
    finance = new FinanceService(
      prisma as never,
      {} as never,
      {} as never,
      new Map() as never,
    );
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    const [adminPerson, bursarPerson, studentPerson] = await Promise.all([
      prisma.person.create({
        data: {
          email: `admin-${randomUUID()}@test.local`,
          firstName: "Ada",
          lastName: "Admin",
          kind: "staff",
          roles: ["admin"],
        },
      }),
      prisma.person.create({
        data: {
          email: `bursar-${randomUUID()}@test.local`,
          firstName: "Binta",
          lastName: "Bursar",
          kind: "staff",
          roles: ["bursar"],
        },
      }),
      prisma.person.create({
        data: {
          email: `student-${randomUUID()}@test.local`,
          firstName: "Saliou",
          lastName: "Student",
          kind: "student",
          roles: ["student"],
        },
      }),
    ]);
    admin = {
      personId: adminPerson.id,
      roles: ["admin"],
      email: adminPerson.email,
      name: "Ada Admin",
    };
    bursar = {
      personId: bursarPerson.id,
      roles: ["bursar"],
      email: bursarPerson.email,
      name: "Binta Bursar",
    };
    const year = await prisma.academicYear.create({
      data: { label: "2026–2027", status: "active" },
    });
    const term = await prisma.term.create({
      data: {
        name: "Fall 2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-20"),
        academicYearId: year.id,
      },
    });
    const student = await prisma.student.create({
      data: { personId: studentPerson.id, studentNo: "APPROVAL-001" },
    });
    studentId = student.id;
    const schedule = await prisma.feeSchedule.create({
      data: {
        academicYearLabel: year.label,
        revision: 1,
        status: "approved",
        approvedAt: new Date(),
        reason: "Bootstrap fallback",
        components: {
          create: [
            {
              key: "tuition",
              label: "Tuition",
              costCenterCode: "9100",
              annualAmountXof: 2_975_000,
              defaultSelected: true,
              sortOrder: 0,
            },
            {
              key: "housing",
              label: "Housing",
              costCenterCode: "3700",
              annualAmountXof: 680_000,
              defaultSelected: true,
              sortOrder: 1,
            },
            {
              key: "cafeteria",
              label: "Cafeteria",
              costCenterCode: "3600",
              annualAmountXof: 630_000,
              defaultSelected: true,
              sortOrder: 2,
            },
          ],
        },
        rows: {
          create: [1, 2, 3, 4].map((sequence) => ({
            academicYearLabel: year.label,
            semester: sequence < 3 ? "Fall" : "Spring",
            label: `Installment ${sequence}`,
            sequence,
            dueOn: new Date(`2026-${String(sequence + 7).padStart(2, "0")}-05`),
            amountFullXof: 1_071_250,
            amountTuitionXof: 743_750,
            amountHousingXof: 170_000,
            amountCafeteriaXof: 157_500,
          })),
        },
      },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: true,
      },
    });
    scheduleId = schedule.id;
    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: 4_285_000,
        packageType: "standard_full",
        academicYearLabel: year.label,
        feeScheduleId: schedule.id,
        feeScheduleRevision: 1,
        costCenterCode: "9100",
        components: {
          create: [
            {
              scheduleComponentId: schedule.components.find(
                (row) => row.key === "tuition",
              )!.id,
              kind: "tuition",
              label: "Tuition",
              costCenterCode: "9100",
              amountXof: 2_975_000,
            },
            {
              scheduleComponentId: schedule.components.find(
                (row) => row.key === "housing",
              )!.id,
              kind: "housing",
              label: "Housing",
              costCenterCode: "3700",
              amountXof: 680_000,
            },
            {
              scheduleComponentId: schedule.components.find(
                (row) => row.key === "cafeteria",
              )!.id,
              kind: "cafeteria",
              label: "Cafeteria",
              costCenterCode: "3600",
              amountXof: 630_000,
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
              })),
            },
          },
        },
      },
      include: { plan: { include: { installments: true } } },
    });
    invoiceId = invoice.id;
    originalInstallmentIds = invoice
      .plan!.installments.map((row) => row.id)
      .sort();
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("queues a bursar schedule edit and applies it once after admin approval", async () => {
    const schedule = await prisma.feeSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    const response = await approvals.request(bursar, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: schedule.id,
      academicYearLabel: schedule.academicYearLabel,
      reason: "Move registration payment to September",
      after: {
        rows: schedule.rows.map((row, index) => ({
          id: row.id,
          label: row.label,
          dueOn:
            index === 0 ? "2026-09-25" : row.dueOn!.toISOString().slice(0, 10),
          amountFullXof: row.amountFullXof,
          amountTuitionXof: row.amountTuitionXof,
          amountHousingXof: row.amountHousingXof,
          amountCafeteriaXof: row.amountCafeteriaXof,
        })),
      },
    });
    expect(response.applied).toBe(false);
    expect(response.request.status).toBe("pending");

    const decision = await approvals.approve(response.request.id, admin);
    expect(decision).toMatchObject({ ok: true, status: "approved" });
    expect(await approvals.approve(response.request.id, admin)).toMatchObject({
      ok: true,
      status: "approved",
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { plan: { include: { installments: true } } },
    });
    expect(invoice.feeScheduleRevision).toBe(2);
    expect(invoice.plan!.installments.map((row) => row.id).sort()).toEqual(
      originalInstallmentIds,
    );
    expect(
      invoice
        .plan!.installments.find((row) => row.sequence === 1)!
        .dueDate.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-25");
  });

  it("marks an older request stale after a newer revision is approved", async () => {
    const current = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: "2026–2027", status: "approved" },
      orderBy: { revision: "desc" },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    const makeRows = (label: string) =>
      current.rows.map((row) => ({
        id: row.id,
        label: row.sequence === 1 ? label : row.label,
        dueOn: row.dueOn!.toISOString().slice(0, 10),
        amountFullXof: row.amountFullXof,
        amountTuitionXof: row.amountTuitionXof,
        amountHousingXof: row.amountHousingXof,
        amountCafeteriaXof: row.amountCafeteriaXof,
      }));
    const old = await approvals.request(bursar, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: current.id,
      academicYearLabel: current.academicYearLabel,
      reason: "Old request",
      after: { rows: makeRows("Old label") },
    });
    const newer = await approvals.request(admin, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: current.id,
      academicYearLabel: current.academicYearLabel,
      reason: "Newer admin request",
      after: { rows: makeRows("Director approved") },
    });
    expect(newer.applied).toBe(true);
    expect(await approvals.approve(old.request.id, admin)).toMatchObject({
      ok: false,
      status: "stale",
    });
  });

  it("allows exactly one concurrent approve-or-reject decision", async () => {
    const request = await approvals.request(bursar, {
      kind: "discount",
      targetType: "Student",
      targetId: studentId,
      reason: "One-time merit adjustment",
      after: {
        studentId,
        amountXof: 25_000,
        label: "Merit adjustment",
        costCenterCode: "9100",
      },
    });

    const decisions = await Promise.allSettled([
      approvals.approve(request.request.id, admin, "Approved"),
      approvals.reject(request.request.id, admin, "Rejected"),
    ]);
    expect(decisions.filter((row) => row.status === "fulfilled")).toHaveLength(
      1,
    );

    const stored = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: request.request.id },
      include: { events: true },
    });
    expect(["approved", "rejected"]).toContain(stored.status);
    expect(
      stored.events.filter((event) =>
        ["approved", "rejected"].includes(event.action),
      ),
    ).toHaveLength(1);
    const credits = await prisma.invoice.count({
      where: {
        studentId,
        packageType: "credit",
        description: { contains: "Merit adjustment" },
      },
    });
    expect(credits).toBe(stored.status === "approved" ? 1 : 0);
    expect(stored.appliedAt === null).toBe(stored.status !== "approved");
  });

  it("prevents duplicate pending plan changes for one student invoice", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const installments = invoice.plan!.installments.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amountDue: row.amountDue,
      label: row.label,
    }));
    const first = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Family requested a later first due date",
      after: { mode: "replace", installments },
    });
    const [pendingAccount, pendingRows] = await Promise.all([
      finance.getStudentAccount(studentId),
      finance.listStudentAccounts(),
    ]);
    expect(pendingAccount.specialAccount).toMatchObject({
      isSpecial: true,
      hasPendingPlanChange: true,
    });
    expect(pendingRows.find((row) => row.id === studentId)).toMatchObject({
      billed: invoice.totalAmount,
      remaining: pendingAccount.summary.outstandingXof,
      specialAccount: { hasPendingPlanChange: true },
    });
    await expect(
      approvals.request(bursar, {
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: invoice.id,
        reason: "Duplicate request",
        after: { mode: "replace", installments },
      }),
    ).rejects.toThrow("already awaiting Director approval");
    await approvals.cancel(first.request.id, bursar, "Test cleanup");

    const raced = await Promise.allSettled([
      approvals.request(bursar, {
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: invoice.id,
        reason: "Concurrent request A",
        after: { mode: "replace", installments },
      }),
      approvals.request(bursar, {
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: invoice.id,
        reason: "Concurrent request B",
        after: { mode: "replace", installments },
      }),
    ]);
    expect(
      raced.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    const winner = raced.find(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof approvals.request>>
      > => result.status === "fulfilled",
    )!;
    await approvals.cancel(winner.value.request.id, bursar, "Race cleanup");
  });

  it("rejects a standard-plan amount that differs from the component total", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const paid = invoice.plan!.installments[0]!;
    await prisma.$transaction([
      prisma.installment.update({
        where: { id: paid.id },
        data: { amountPaid: 100, status: "partial" },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: 100, status: "partial" },
      }),
    ]);
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Invalid paid-row reduction",
      after: {
        mode: "replace",
        installments: invoice.plan!.installments.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          amountDue: row.id === paid.id ? 99 : row.amountDue,
          label: row.label,
        })),
      },
    });
    await expect(approvals.approve(request.request.id, admin)).rejects.toThrow(
      "installment amounts are derived",
    );
    await approvals.cancel(request.request.id, bursar, "Test cleanup");
    await prisma.$transaction([
      prisma.installment.update({
        where: { id: paid.id },
        data: { amountPaid: 0, status: "pending" },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: 0, status: "open" },
      }),
    ]);
  });

  it("cancels a failed admin self-approval so a corrected plan is not locked", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const paid = invoice.plan!.installments[0]!;
    await prisma.$transaction([
      prisma.installment.update({
        where: { id: paid.id },
        data: { amountPaid: 100, status: "partial" },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: 100, status: "partial" },
      }),
    ]);
    const invalidReason = `Invalid admin plan ${randomUUID()}`;
    const rows = invoice.plan!.installments.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amountDue: row.id === paid.id ? 99 : row.amountDue,
      label: row.label,
    }));
    await expect(
      approvals.request(admin, {
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: invoice.id,
        reason: invalidReason,
        after: { mode: "replace", installments: rows },
      }),
    ).rejects.toThrow("installment amounts are derived");
    await expect(
      prisma.approvalRequest.findFirstOrThrow({
        where: { reason: invalidReason },
      }),
    ).resolves.toMatchObject({
      status: "cancelled",
      requestedById: admin.personId,
      reviewedById: admin.personId,
    });

    const corrected = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Corrected admin plan",
      after: {
        mode: "replace",
        installments: rows.map((row) => ({
          ...row,
          amountDue: row.id === paid.id ? paid.amountDue : row.amountDue,
        })),
      },
    });
    expect(corrected).toMatchObject({
      applied: true,
      request: { status: "approved" },
    });
    await prisma.$transaction([
      prisma.installment.update({
        where: { id: paid.id },
        data: { amountPaid: 0, status: "pending" },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: 0, status: "open" },
      }),
    ]);
  });

  it("never resurrects a void invoice through an approved plan change", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "void" },
    });
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Invalid change to a void charge",
      after: {
        mode: "replace",
        installments: invoice.plan!.installments.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          amountDue: row.amountDue,
          label: row.label,
        })),
      },
    });
    await expect(approvals.approve(request.request.id, admin)).rejects.toThrow(
      "void invoice",
    );
    await expect(
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).resolves.toMatchObject({ status: "void" });
    await approvals.cancel(request.request.id, bursar, "Test cleanup");
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "open" },
    });
  });

  it("marks a student plan request stale when billing changes after submission", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Plan submitted before another billing event",
      after: {
        mode: "replace",
        installments: invoice.plan!.installments.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          amountDue: row.amountDue,
          label: row.label,
        })),
      },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { revision: { increment: 1 } },
    });
    await expect(
      approvals.approve(request.request.id, admin),
    ).resolves.toMatchObject({ ok: false, status: "stale" });
  });

  it("approves, flags, propagates, and restores an individual date plan", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const first = invoice.plan!.installments[0]!;
    const individualDueDate = "2026-10-17";
    const individualTotal = invoice.totalAmount;
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Approved individual family arrangement",
      after: {
        mode: "replace",
        installments: invoice.plan!.installments.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          dueDate:
            row.id === first.id
              ? individualDueDate
              : row.dueDate.toISOString().slice(0, 10),
          amountDue: row.amountDue,
          label: row.label,
        })),
      },
    });
    await expect(
      approvals.approve(request.request.id, admin),
    ).resolves.toMatchObject({
      ok: true,
      status: "approved",
      result: { individualOverride: true, total: individualTotal },
    });
    const customized = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    expect(customized.feeScheduleId).not.toBeNull();
    expect(customized.paymentPlanOverride).toBe(true);
    expect(customized.totalAmount).toBe(individualTotal);
    expect(
      customized.plan!.installments[0]!.dueDate.toISOString().slice(0, 10),
    ).toBe(individualDueDate);

    const account = await finance.getStudentAccount(studentId);
    expect(account.totals).toMatchObject({
      billed: individualTotal,
      remaining: account.summary.outstandingXof,
    });
    expect(account.specialAccount).toMatchObject({
      isSpecial: true,
      hasIndividualPlan: true,
    });
    expect(account.invoices.find((row) => row.id === invoice.id)).toMatchObject(
      {
        planType: "individual_override",
      },
    );

    const currentSchedule = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: "2026–2027", status: "approved" },
      orderBy: { revision: "desc" },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    const global = await approvals.request(admin, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: currentSchedule.id,
      academicYearLabel: currentSchedule.academicYearLabel,
      reason: "Global label update must preserve individual dates",
      after: {
        rows: currentSchedule.rows.map((row) => ({
          id: row.id,
          label: row.sequence === 1 ? "Global registration" : row.label,
          dueOn: row.dueOn!.toISOString().slice(0, 10),
          amountFullXof: row.amountFullXof,
          amountTuitionXof: row.amountTuitionXof,
          amountHousingXof: row.amountHousingXof,
          amountCafeteriaXof: row.amountCafeteriaXof,
        })),
      },
    });
    expect(global.applied).toBe(true);
    expect(global.result).toMatchObject({ linkedPlansUpdated: 1 });
    const isolated = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { plan: { include: { installments: true } } },
    });
    expect(isolated.totalAmount).toBe(individualTotal);
    expect(isolated.feeScheduleId).toBe(global.result.scheduleId);
    expect(isolated.paymentPlanOverride).toBe(true);
    expect(
      isolated
        .plan!.installments.find((row) => row.sequence === 1)!
        .dueDate.toISOString()
        .slice(0, 10),
    ).toBe(individualDueDate);

    const restore = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoice.id,
      reason: "Administrator restored the approved standard plan",
      after: { mode: "restore_standard" },
    });
    expect(restore).toMatchObject({
      applied: true,
      request: { status: "approved" },
      result: { restored: true, total: 4_285_000 },
    });
    const restored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { plan: { include: { installments: true } } },
    });
    const latestSchedule = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: "2026–2027", status: "approved" },
      orderBy: { revision: "desc" },
    });
    expect(restored).toMatchObject({
      feeScheduleId: latestSchedule.id,
      feeScheduleRevision: latestSchedule.revision,
      totalAmount: 4_285_000,
    });
    expect(
      (await finance.getStudentAccount(studentId)).specialAccount,
    ).toMatchObject({ hasIndividualPlan: false });
  });

  it("preserves unspecified installments in a PATCH-style plan update", async () => {
    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const changed = before.plan!.installments[0]!;
    const response = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: before.id,
      reason: "Change only the first due date",
      after: {
        mode: "update",
        installments: [
          {
            id: changed.id,
            sequence: changed.sequence,
            dueDate: "2026-10-19",
            amountDue: changed.amountDue,
          },
        ],
      },
    });
    expect(response.applied).toBe(true);
    const updated = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    expect(updated.plan!.installments.map((row) => row.id)).toEqual(
      before.plan!.installments.map((row) => row.id),
    );
    expect(updated.plan!.installments).toHaveLength(
      before.plan!.installments.length,
    );
    expect(updated.totalAmount).toBe(before.totalAmount);
    expect(updated.plan!.installments[0]).toMatchObject({
      id: changed.id,
      label: changed.label,
    });

    const restore = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: before.id,
      reason: "Restore after PATCH regression test",
      after: { mode: "restore_standard" },
    });
    expect(restore.applied).toBe(true);
  });

  it("assigns one standard package when concurrent bursar retries race", async () => {
    const person = await prisma.person.create({
      data: {
        email: `package-${randomUUID()}@test.local`,
        firstName: "Package",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `PACKAGE-${randomUUID().slice(0, 8)}`,
      },
    });

    const results = await Promise.all([
      finance.assignStandardPackage(student.id, bursar.personId),
      finance.assignStandardPackage(student.id, bursar.personId),
    ]);
    expect(new Set(results.map((row) => row.invoiceId)).size).toBe(1);
    expect(
      await prisma.invoice.count({
        where: {
          studentId: student.id,
          academicYearLabel: "2026–2027",
          packageType: "standard_full",
          status: { not: "void" },
        },
      }),
    ).toBe(1);
  });

  it("bills an approved custom charge once, named, audited, and replay-safe", async () => {
    const response = await approvals.request(bursar, {
      kind: "custom_charge",
      targetType: "Invoice",
      reason: "Broke a spectrometer lens",
      after: {
        studentIds: [studentId],
        description: "Laboratory replacement fee",
        amountXof: 25_000,
        costCenterCode: "9100",
        installments: [
          { dueDate: "2026-10-01", amountXof: 10_000, label: "First" },
          { dueDate: "2026-11-01", amountXof: 15_000 },
        ],
      },
    });
    expect(response.applied).toBe(false);

    expect(await approvals.approve(response.request.id, admin)).toMatchObject({
      ok: true,
      status: "approved",
    });

    const charges = await prisma.invoice.findMany({
      where: { studentId, packageType: "custom" },
      include: {
        components: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    expect(charges).toHaveLength(1);
    const charge = charges[0]!;
    expect(charge.totalAmount).toBe(25_000);
    expect(charge.description).toBe("Laboratory replacement fee");
    // The billing number is derived from the approval, not random, so a replay
    // finds it instead of billing the student twice.
    expect(charge.number).toContain(
      response.request.id.replace(/-/g, "").slice(0, 12).toUpperCase(),
    );
    expect(charge.components).toHaveLength(1);
    expect(charge.components[0]!.label).toBe("Laboratory replacement fee");
    expect(charge.plan!.installments.map((row) => row.amountDue)).toEqual([
      10_000, 15_000,
    ]);

    const audits = await prisma.auditLog.findMany({
      where: { entity: "Invoice", entityId: charge.id },
    });
    expect(audits.map((row) => row.action)).toContain("custom-charge-billed");

    // The rail refuses a second decision outright, so the derived number guards
    // the remaining replay path: the serializable transaction retry in
    // FinanceApprovalsService.transaction re-runs apply on a P2034 conflict.
    await expect(approvals.approve(response.request.id, admin)).rejects.toThrow(
      /already approved/,
    );
    expect(
      await prisma.invoice.count({
        where: { studentId, packageType: "custom" },
      }),
    ).toBe(1);
  });
});
