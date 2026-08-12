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
      { name: "test" } as never,
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
      include: { rows: { orderBy: { sequence: "asc" } } },
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
            { kind: "tuition", costCenterCode: "9100", amountXof: 2_975_000 },
            { kind: "housing", costCenterCode: "3700", amountXof: 680_000 },
            { kind: "cafeteria", costCenterCode: "3600", amountXof: 630_000 },
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
});
