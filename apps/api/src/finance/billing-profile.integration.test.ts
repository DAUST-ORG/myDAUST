import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import {
  BillingProfileViewSchema,
  INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_SERVICE_OPTIONS,
} from "@mydaust/shared";
import {
  type BillingCatalogChangeInput,
  BillingProfileService,
} from "./billing-profile.service.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import { assignStandardPackageInTransaction } from "./standard-package.js";

const SCHEMA = `billing_profile_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

describe.skipIf(!DB_URL)("annual billing profiles", () => {
  let prisma: PrismaClient;
  let service: BillingProfileService;
  let actorId: string;
  let studentId: string;
  let academicYearId: string;

  async function createPackagedStudent(label: string) {
    const person = await prisma.person.create({
      data: {
        email: `billing-${label}-${randomUUID()}@test.local`,
        firstName: "Profile",
        lastName: label,
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `S2031${randomUUID().slice(0, 6).toUpperCase()}`,
        catalogYear: "2031-2032",
        catalogYearId: academicYearId,
      },
    });
    await prisma.$transaction((tx) =>
      assignStandardPackageInTransaction(
        tx,
        student.id,
        actorId,
        academicYearId,
      ),
    );
    return student.id;
  }

  async function catalogChangeInput(): Promise<BillingCatalogChangeInput> {
    const catalog = await service.catalog("2031-2032");
    return {
      academicYearLabel: catalog.academicYearLabel,
      expectedCatalogFingerprint: catalog.catalogFingerprint,
      serviceOptions: catalog.serviceOptions.map((option) => ({
        id: option.id,
        kind: option.kind,
        code: option.code,
        label: option.label,
        description: option.description,
        calculation: option.calculation,
        amountXof: option.amountXof,
        percentageBasisPoints: option.percentageBasisPoints,
        basisServiceKind: option.basisServiceKind,
        costCenterCode: option.costCenterCode,
        refundable: option.refundable,
        defaultSelected: option.defaultSelected,
        active: option.active,
        sortOrder: option.sortOrder,
      })),
      adjustmentDefinitions: catalog.adjustmentDefinitions.map(
        (definition) => ({
          id: definition.id,
          key: definition.key,
          label: definition.label,
          description: definition.description,
          basis: definition.basis,
          calculation: definition.calculation,
          stacking: definition.stacking,
          effect: definition.effect,
          percentageBasisPoints: definition.percentageBasisPoints,
          fixedAmountXof: definition.fixedAmountXof,
          requiresApproval: definition.requiresApproval,
          active: definition.active,
          sortOrder: definition.sortOrder,
        }),
      ),
    };
  }

  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    service = new BillingProfileService(prisma as never);
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    const actor = await prisma.person.create({
      data: {
        email: `billing-admin-${randomUUID()}@test.local`,
        firstName: "Billing",
        lastName: "Admin",
        kind: "staff",
        roles: ["admin"],
      },
    });
    actorId = actor.id;
    const academicYear = await prisma.academicYear.create({
      data: {
        label: "2031-2032",
        status: "active",
        startsOn: new Date("2031-08-01T00:00:00.000Z"),
        endsOn: new Date("2032-07-31T00:00:00.000Z"),
      },
    });
    academicYearId = academicYear.id;
    await prisma.billingServiceOption.createMany({
      data: INITIAL_BILLING_SERVICE_OPTIONS.map((option) => ({
        ...option,
        academicYearLabel: academicYear.label,
        active: true,
      })),
    });
    await prisma.billingAdjustmentDefinition.createMany({
      data: INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.map((definition) => ({
        ...definition,
        academicYearLabel: academicYear.label,
        active: true,
      })),
    });
    await prisma.term.create({
      data: {
        name: "Fall 2031",
        startDate: new Date("2031-08-01T00:00:00.000Z"),
        endDate: new Date("2031-12-31T00:00:00.000Z"),
        academicYearId,
      },
    });
    await prisma.feeSchedule.create({
      data: {
        academicYearLabel: academicYear.label,
        revision: 1,
        status: "approved",
        reason: "Billing profile test",
        createdById: actorId,
        approvedById: actorId,
        approvedAt: new Date(),
        components: {
          create: {
            key: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            annualAmountXof: 4_000_000,
            defaultSelected: true,
          },
        },
        rows: {
          create: [
            [1, "Registration", "2031-08-25"],
            [2, "Fall balance", "2031-11-25"],
            [3, "Spring registration", "2032-01-25"],
            [4, "Spring balance", "2032-04-25"],
          ].map(([sequence, label, dueOn]) => ({
            academicYearLabel: academicYear.label,
            semester: Number(sequence) < 3 ? "Fall" : "Spring",
            label: String(label),
            sequence: Number(sequence),
            dueOn: new Date(String(dueOn)),
            amountFullXof: 1_000_000,
            amountTuitionXof: 1_000_000,
          })),
        },
      },
    });
    const person = await prisma.person.create({
      data: {
        email: `billing-student-${randomUUID()}@test.local`,
        firstName: "Profile",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `S2031${randomUUID().slice(0, 6).toUpperCase()}`,
        catalogYear: academicYear.label,
        catalogYearId: academicYear.id,
      },
    });
    studentId = student.id;
    await prisma.$transaction((tx) =>
      assignStandardPackageInTransaction(
        tx,
        student.id,
        actorId,
        academicYear.id,
      ),
    );
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("uses an explicitly configured catalog and snapshots services plus an automatic admission award", async () => {
    const options = await service.options("2031-2032");
    expect(options.housingOptions.map((option) => option.code)).toEqual([
      "none",
      "double",
      "individual",
      "double_ac",
      "individual_ac",
    ]);
    expect(options.cafeteriaOptions.map((option) => option.code)).toEqual([
      "none",
      "full",
    ]);
    const applied = await prisma.$transaction((tx) =>
      service.createAdmissionProfile(tx, {
        studentId,
        actorId,
        academicYearLabel: "2031-2032",
        automaticAwardKey: "merit_10",
        pricingClaims: {
          feeScheduleId: options.feeScheduleId!,
          feeScheduleRevision: options.feeScheduleRevision,
          feeScheduleFingerprintSha256: options.feeScheduleFingerprintSha256!,
          billingCatalogFingerprintSha256:
            options.billingCatalogFingerprintSha256!,
        },
        selection: {
          housingOptionCode: "double",
          cafeteriaOptionCode: "full",
          insuranceSelected: true,
          cautionSelected: true,
          awardDefinitionIds: [],
        },
      }),
    );
    expect(applied).toMatchObject({
      revision: 1,
      grossChargesXof: 5_388_000,
      netBilledXof: 4_988_000,
    });

    const [view, invoice, mealPlan, housing, cautionSelection] =
      await Promise.all([
        service.get(studentId),
        prisma.invoice.findUniqueOrThrow({
          where: { id: applied.canonicalInvoiceId },
          include: {
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
        }),
        prisma.mealPlan.findUniqueOrThrow({
          where: {
            studentId_academicYearLabel: {
              studentId,
              academicYearLabel: "2031-2032",
            },
          },
        }),
        prisma.housingAssignment.findUniqueOrThrow({
          where: {
            studentId_academicYearLabel: {
              studentId,
              academicYearLabel: "2031-2032",
            },
          },
        }),
        prisma.billingProfileSelection.findUniqueOrThrow({
          where: {
            profileId_kind: {
              profileId: applied.profileId,
              kind: "housing_caution",
            },
          },
          include: { percentageBasisOption: true },
        }),
      ]);
    expect(() => BillingProfileViewSchema.parse(view)).not.toThrow();
    expect(view).toMatchObject({
      revision: 1,
      grossChargesXof: 5_388_000,
      netBilledXof: 4_988_000,
      housing: { code: "double", amountXof: 680_000 },
      cafeteria: { code: "full", amountXof: 630_000 },
      insurance: { selected: true, amountXof: 10_000 },
      caution: { selected: true, amountXof: 68_000, refundable: true },
      awards: [
        expect.objectContaining({
          code: "merit_10",
          calculation: "percentage",
          amountXof: 400_000,
        }),
      ],
      adjustments: [],
      mismatchWarnings: [],
    });
    expect(invoice.totalAmount).toBe(4_988_000);
    expect(invoice.feeScheduleId).toBe(options.feeScheduleId);
    expect(invoice.plan?.installments).toHaveLength(4);
    for (const installment of invoice.plan?.installments ?? []) {
      expect(installment.components).toHaveLength(invoice.components.length);
      expect(
        installment.components.reduce((sum, row) => sum + row.amountDue, 0),
      ).toBe(installment.amountDue);
    }
    for (const component of invoice.components) {
      expect(
        invoice.plan?.installments.reduce(
          (sum, installment) =>
            sum +
            (installment.components.find(
              (row) => row.invoiceComponentId === component.id,
            )?.amountDue ?? 0),
          0,
        ),
      ).toBe(component.amountXof);
    }
    expect(mealPlan).toMatchObject({
      type: "full",
      active: true,
      billingProfileId: applied.profileId,
    });
    expect(housing).toMatchObject({
      academicYearLabel: "2031-2032",
      billedServiceOptionId: expect.any(String),
    });
    expect(cautionSelection).toMatchObject({
      academicYearLabel: "2031-2032",
      percentageBasisOptionCode: "double",
      percentageBasisServiceKind: "housing",
      percentageBasisOption: {
        code: "double",
        academicYearLabel: "2031-2032",
        kind: "housing",
      },
    });
  });

  it("does not auto-create financial catalogs for future academic years", async () => {
    await prisma.academicYear.create({
      data: { label: "2032-2033", status: "draft" },
    });

    const options = await service.options("2032-2033");

    expect(options).toMatchObject({
      academicYearLabel: "2032-2033",
      housingOptions: [],
      cafeteriaOptions: [],
      insuranceOption: null,
      cautionOption: null,
      awardDefinitions: [],
    });
    await expect(
      prisma.billingServiceOption.count({
        where: { academicYearLabel: "2032-2033" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.billingAdjustmentDefinition.count({
        where: { academicYearLabel: "2032-2033" },
      }),
    ).resolves.toBe(0);
  });

  it("limits the approved bootstrap catalog to the workbook cutover year", async () => {
    await prisma.academicYear.create({
      data: {
        label: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
        status: "draft",
      },
    });

    const options = await service.options(
      INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
    );

    expect(options.housingOptions.map((option) => option.code)).toEqual([
      "none",
      "double",
      "individual",
      "double_ac",
      "individual_ac",
    ]);
    expect(options.awardDefinitions).toHaveLength(
      INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.length,
    );
  });

  it("binds profile toggles to the canonical active insurance and caution rows", async () => {
    const options = await service.options("2031-2032");
    expect(options.insuranceOption).toMatchObject({
      code: "annual",
      active: true,
      amountXof: 10_000,
    });
    expect(options.cautionOption).toMatchObject({
      code: "housing_10_percent",
      active: true,
      percentageBasisPoints: 1_000,
    });

    const arbitraryInsurance = await catalogChangeInput();
    arbitraryInsurance.serviceOptions.push({
      kind: "insurance",
      code: "premium",
      label: "Unsupported premium insurance",
      calculation: "fixed",
      amountXof: 20_000,
      percentageBasisPoints: null,
      basisServiceKind: null,
      costCenterCode: "9100",
      refundable: false,
      defaultSelected: false,
      active: true,
      sortOrder: 20,
    });
    await expect(
      service.catalogApprovalSnapshot(arbitraryInsurance),
    ).rejects.toThrow("not supported by billing-profile selection");

    const missingAnnual = await catalogChangeInput();
    missingAnnual.serviceOptions.find(
      (option) => option.kind === "insurance" && option.code === "annual",
    )!.active = false;
    await expect(
      service.catalogApprovalSnapshot(missingAnnual),
    ).rejects.toThrow("Required active billing options are missing");

    const arbitraryCaution = await catalogChangeInput();
    arbitraryCaution.serviceOptions.push({
      kind: "housing_caution",
      code: "deposit_20_percent",
      label: "Unsupported caution",
      calculation: "percentage_of_service",
      amountXof: null,
      percentageBasisPoints: 2_000,
      basisServiceKind: "housing",
      costCenterCode: "3700",
      refundable: true,
      defaultSelected: false,
      active: true,
      sortOrder: 20,
    });
    await expect(
      service.catalogApprovalSnapshot(arbitraryCaution),
    ).rejects.toThrow("not supported by billing-profile selection");
  });

  it("keeps existing catalog codes and definition keys immutable", async () => {
    const renamedOption = await catalogChangeInput();
    renamedOption.serviceOptions.find(
      (option) => option.kind === "housing" && option.code === "double",
    )!.code = "shared_room";
    await expect(
      service.catalogApprovalSnapshot(renamedOption),
    ).rejects.toThrow("stable catalog identifier");

    const renamedDefinition = await catalogChangeInput();
    renamedDefinition.adjustmentDefinitions.find(
      (definition) => definition.key === "family",
    )!.key = "family_renamed";
    await expect(
      service.catalogApprovalSnapshot(renamedDefinition),
    ).rejects.toThrow("stable adjustment identifier");
  });

  it("allows the supported half cafeteria plan only with an active positive price", async () => {
    const zeroPrice = await catalogChangeInput();
    zeroPrice.serviceOptions.push({
      kind: "cafeteria",
      code: "half",
      label: "Half cafeteria plan",
      calculation: "fixed",
      amountXof: 0,
      percentageBasisPoints: null,
      basisServiceKind: null,
      costCenterCode: "3600",
      refundable: false,
      defaultSelected: false,
      active: true,
      sortOrder: 20,
    });
    await expect(service.catalogApprovalSnapshot(zeroPrice)).rejects.toThrow(
      "cannot be active without an approved price",
    );

    const priced = await catalogChangeInput();
    priced.serviceOptions.push({
      kind: "cafeteria",
      code: "half",
      label: "Half cafeteria plan",
      calculation: "fixed",
      amountXof: 315_000,
      percentageBasisPoints: null,
      basisServiceKind: null,
      costCenterCode: "3600",
      refundable: false,
      defaultSelected: false,
      active: true,
      sortOrder: 20,
    });
    await expect(
      service.catalogApprovalSnapshot(priced),
    ).resolves.toMatchObject({ after: { serviceOptions: expect.any(Array) } });
  });

  it("rejects a stale revision before creating another profile request snapshot", async () => {
    await expect(
      service.approvalSnapshot(studentId, {
        academicYearLabel: "2031-2032",
        expectedRevision: 0,
        housingOptionCode: "none",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
      }),
    ).rejects.toThrow("billing profile changed");
  });

  it("applies a complete service change only after administrator approval", async () => {
    const options = await service.options("2031-2032");
    const family = options.awardDefinitions.find(
      (definition) => definition.code === "family",
    )!;
    const approvals = new FinanceApprovalsService(
      prisma as never,
      undefined,
      undefined,
      service,
    );
    const bursar = {
      personId: actorId,
      roles: ["bursar"],
      email: "billing-admin@test.local",
      name: "Billing Admin",
    } as const;
    const admin = { ...bursar, roles: ["admin"] } as const;
    const requested = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: studentId,
      academicYearLabel: "2031-2032",
      reason: "Student left housing and dining",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: 1,
        housingOptionCode: "none",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
        awardDefinitionIds: [],
        manualAdjustments: [
          {
            definitionId: family.id,
            label: "Family award",
            amountXof: -100_000,
            reason: "Reviewed sibling award",
          },
        ],
      },
    });
    expect(requested).toMatchObject({
      applied: false,
      request: { status: "pending" },
    });
    await expect(
      prisma.annualBillingProfile.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
    ).resolves.toMatchObject({ revision: 1, netBilledXof: 4_988_000 });

    await expect(
      approvals.approve(requested.request.id, admin as never),
    ).resolves.toMatchObject({ ok: true, status: "approved" });
    const [profile, mealPlan, housing, view] = await Promise.all([
      prisma.annualBillingProfile.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
      prisma.mealPlan.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
      prisma.housingAssignment.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
      service.get(studentId),
    ]);
    expect(profile).toMatchObject({ revision: 2, netBilledXof: 3_900_000 });
    expect(mealPlan).toMatchObject({ type: "none", active: false });
    expect(housing).toMatchObject({
      billedServiceOptionId: null,
      status: "unassigned",
    });
    expect(view).toMatchObject({
      revision: 2,
      housing: { code: "none", amountXof: 0 },
      cafeteria: { code: "none", amountXof: 0 },
      awards: [expect.objectContaining({ code: "family", amountXof: 100_000 })],
      mismatchWarnings: [],
    });
    expect(() => BillingProfileViewSchema.parse(view)).not.toThrow();
  });

  it("marks a billing-profile request stale when catalog pricing drifts", async () => {
    const approvals = new FinanceApprovalsService(
      prisma as never,
      undefined,
      undefined,
      service,
    );
    const bursar = {
      personId: actorId,
      roles: ["bursar"],
      email: "billing-admin@test.local",
      name: "Billing Admin",
    } as const;
    const admin = { ...bursar, roles: ["admin"] } as const;
    const requested = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: studentId,
      academicYearLabel: "2031-2032",
      reason: "Return to double housing",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: 2,
        housingOptionCode: "double",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
        awardDefinitionIds: [],
      },
    });
    const option = await prisma.billingServiceOption.findUniqueOrThrow({
      where: {
        academicYearLabel_kind_code: {
          academicYearLabel: "2031-2032",
          kind: "housing",
          code: "double",
        },
      },
    });
    await prisma.billingServiceOption.update({
      where: { id: option.id },
      data: { amountXof: option.amountXof! + 1 },
    });

    await expect(
      approvals.approve(requested.request.id, admin as never),
    ).resolves.toMatchObject({
      ok: false,
      status: "stale",
      reason: expect.stringContaining("billing catalog changed"),
    });
    await expect(
      prisma.annualBillingProfile.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
    ).resolves.toMatchObject({ revision: 2, netBilledXof: 3_900_000 });
    await prisma.billingServiceOption.update({
      where: { id: option.id },
      data: { amountXof: option.amountXof },
    });
  });

  it("binds the complete approved fee schedule, not only its revision", async () => {
    const approvals = new FinanceApprovalsService(
      prisma as never,
      undefined,
      undefined,
      service,
    );
    const bursar = {
      personId: actorId,
      roles: ["bursar"],
      email: "billing-admin@test.local",
      name: "Billing Admin",
    } as const;
    const admin = { ...bursar, roles: ["admin"] } as const;
    const requested = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: studentId,
      academicYearLabel: "2031-2032",
      reason: "Keep the current profile",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: 2,
        housingOptionCode: "none",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
        awardDefinitionIds: [],
      },
    });
    const schedule = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: "2031-2032", status: "approved" },
      orderBy: { revision: "desc" },
    });
    await prisma.feeSchedule.update({
      where: { id: schedule.id },
      data: { reason: `${schedule.reason} (drift)` },
    });

    await expect(
      approvals.approve(requested.request.id, admin as never),
    ).resolves.toMatchObject({
      ok: false,
      status: "stale",
      reason: expect.stringContaining("fee schedule changed"),
    });
    await prisma.feeSchedule.update({
      where: { id: schedule.id },
      data: { reason: schedule.reason },
    });
  });

  it("never applies a cancelled approval request", async () => {
    const approvals = new FinanceApprovalsService(
      prisma as never,
      undefined,
      undefined,
      service,
    );
    const bursar = {
      personId: actorId,
      roles: ["bursar"],
      email: "billing-admin@test.local",
      name: "Billing Admin",
    } as const;
    const admin = { ...bursar, roles: ["admin"] } as const;
    const requested = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: studentId,
      academicYearLabel: "2031-2032",
      reason: "Cancelled profile request",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: 2,
        housingOptionCode: "none",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
        awardDefinitionIds: [],
      },
    });
    await approvals.cancel(
      requested.request.id,
      bursar as never,
      "No longer requested",
    );

    await expect(
      approvals.approve(requested.request.id, admin as never),
    ).rejects.toThrow("already cancelled");
    await expect(
      prisma.annualBillingProfile.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2031-2032",
          },
        },
      }),
    ).resolves.toMatchObject({ revision: 2, netBilledXof: 3_900_000 });
  });

  it("round-trips fixed, percentage, signed manual, and generic current adjustments exactly once", async () => {
    await prisma.billingAdjustmentDefinition.createMany({
      data: [
        {
          academicYearLabel: "2031-2032",
          key: `routine_percentage_${randomUUID().slice(0, 6)}`,
          label: "Routine percentage award",
          description: "Additive percentage award used for round-trip testing.",
          basis: "tuition",
          calculation: "percentage",
          stacking: "additive",
          effect: "discount",
          percentageBasisPoints: 500,
          fixedAmountXof: null,
          requiresApproval: true,
          active: true,
          sortOrder: 500,
        },
        {
          academicYearLabel: "2031-2032",
          key: `routine_fixed_${randomUUID().slice(0, 6)}`,
          label: "Routine fixed award",
          description: "Additive fixed award used for round-trip testing.",
          basis: "tuition",
          calculation: "fixed",
          stacking: "additive",
          effect: "discount",
          percentageBasisPoints: null,
          fixedAmountXof: 20_000,
          requiresApproval: true,
          active: true,
          sortOrder: 510,
        },
      ],
    });
    const definitions = await prisma.billingAdjustmentDefinition.findMany({
      where: {
        academicYearLabel: "2031-2032",
        label: { in: ["Routine percentage award", "Routine fixed award"] },
      },
    });
    const percentage = definitions.find(
      (definition) => definition.calculation === "percentage",
    )!;
    const fixed = definitions.find(
      (definition) => definition.calculation === "fixed",
    )!;
    const manualCharge =
      await prisma.billingAdjustmentDefinition.findUniqueOrThrow({
        where: {
          academicYearLabel_key: {
            academicYearLabel: "2031-2032",
            key: "manual_charge",
          },
        },
      });
    const isolatedStudentId = await createPackagedStudent("Roundtrip");
    const options = await service.options("2031-2032");
    const initial = await prisma.$transaction((tx) =>
      service.createAdmissionProfile(tx, {
        studentId: isolatedStudentId,
        actorId,
        academicYearLabel: "2031-2032",
        pricingClaims: {
          feeScheduleId: options.feeScheduleId!,
          feeScheduleRevision: options.feeScheduleRevision,
          feeScheduleFingerprintSha256: options.feeScheduleFingerprintSha256!,
          billingCatalogFingerprintSha256:
            options.billingCatalogFingerprintSha256!,
        },
        selection: {
          housingOptionCode: "double",
          cafeteriaOptionCode: "full",
          insuranceSelected: true,
          cautionSelected: false,
          awardDefinitionIds: [],
        },
      }),
    );
    const approvals = new FinanceApprovalsService(
      prisma as never,
      undefined,
      undefined,
      service,
    );
    const bursar = {
      personId: actorId,
      roles: ["bursar"],
      email: "billing-admin@test.local",
      name: "Billing Admin",
    } as const;
    const admin = { ...bursar, roles: ["admin"] } as const;
    const retainedAdjustments = [
      {
        definitionId: manualCharge.id,
        label: manualCharge.label,
        amountXof: 30_000,
        reason: "Workbook reviewed positive manual charge",
      },
      {
        label: "Workbook residual reconciliation",
        amountXof: -7_000,
        reason: "Workbook reviewed residual exactly as billed",
      },
    ];
    const addAdjustments = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: isolatedStudentId,
      academicYearLabel: "2031-2032",
      reason: "Record reviewed workbook adjustments",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: initial.revision,
        housingOptionCode: "double",
        cafeteriaOptionCode: "full",
        insuranceSelected: true,
        cautionSelected: false,
        awardDefinitionIds: [percentage.id, fixed.id],
        manualAdjustments: retainedAdjustments,
      },
    });
    await expect(
      approvals.approve(addAdjustments.request.id, admin as never),
    ).resolves.toMatchObject({ ok: true, status: "approved" });

    const firstRevision = await prisma.annualBillingProfile.findUniqueOrThrow({
      where: {
        studentId_academicYearLabel: {
          studentId: isolatedStudentId,
          academicYearLabel: "2031-2032",
        },
      },
      include: {
        invoiceAdjustments: true,
        awards: true,
      },
    });
    const firstReference = `billing-profile:${firstRevision.id}:revision:${firstRevision.revision}`;
    const firstCurrent = firstRevision.invoiceAdjustments.filter(
      (adjustment) => adjustment.sourceReference === firstReference,
    );
    const charge = firstCurrent.find(
      (adjustment) => adjustment.definitionId === manualCharge.id,
    )!;
    const generic = firstCurrent.find(
      (adjustment) => adjustment.definitionId === null,
    )!;
    await prisma.$transaction([
      prisma.invoiceAdjustment.updateMany({
        where: { id: { in: [charge.id, generic.id] } },
        data: { source: "workbook" },
      }),
      prisma.billingProfileAward.updateMany({
        where: { invoiceAdjustmentId: charge.id },
        data: { source: "workbook" },
      }),
    ]);

    const routineChange = await approvals.request(bursar as never, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: isolatedStudentId,
      academicYearLabel: "2031-2032",
      reason: "Routine cafeteria and insurance service change",
      after: {
        academicYearLabel: "2031-2032",
        expectedRevision: firstRevision.revision,
        housingOptionCode: "double",
        cafeteriaOptionCode: "none",
        insuranceSelected: false,
        cautionSelected: false,
        awardDefinitionIds: [percentage.id, fixed.id],
        manualAdjustments: retainedAdjustments,
      },
    });
    await expect(
      approvals.approve(routineChange.request.id, admin as never),
    ).resolves.toMatchObject({ ok: true, status: "approved" });

    const [view, finalProfile] = await Promise.all([
      service.get(isolatedStudentId, "2031-2032"),
      prisma.annualBillingProfile.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId: isolatedStudentId,
            academicYearLabel: "2031-2032",
          },
        },
        include: {
          feeSchedule: true,
          canonicalInvoice: {
            include: {
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
          },
          invoiceAdjustments: true,
        },
      }),
    ]);
    expect(
      view?.awards.filter((award) => award.code === percentage.key),
    ).toHaveLength(1);
    expect(
      view?.awards.filter((award) => award.code === fixed.key),
    ).toHaveLength(1);
    expect(
      view?.awards.filter((award) => award.code === "manual_charge"),
    ).toEqual([
      expect.objectContaining({
        effect: "charge",
        amountXof: 30_000,
        source: "workbook",
        reason: "Workbook reviewed positive manual charge",
      }),
    ]);
    expect(view?.adjustments).toEqual([
      expect.objectContaining({
        label: "Workbook residual reconciliation",
        amountXof: -7_000,
        kind: "discount",
        source: "workbook",
        reason: "Workbook reviewed residual exactly as billed",
      }),
    ]);
    expect(finalProfile.feeScheduleId).toBe(options.feeScheduleId);
    expect(finalProfile.canonicalInvoice?.feeScheduleId).toBe(
      options.feeScheduleId,
    );
    const finalReference = `billing-profile:${finalProfile.id}:revision:${finalProfile.revision}`;
    expect(
      finalProfile.invoiceAdjustments.filter(
        (adjustment) => adjustment.sourceReference === finalReference,
      ),
    ).toHaveLength(4);
    const finalInvoice = finalProfile.canonicalInvoice!;
    for (const installment of finalInvoice.plan?.installments ?? []) {
      expect(installment.components).toHaveLength(
        finalInvoice.components.length,
      );
      expect(
        installment.components.reduce((sum, row) => sum + row.amountDue, 0),
      ).toBe(installment.amountDue);
    }
    for (const component of finalInvoice.components) {
      expect(
        finalInvoice.plan?.installments.reduce(
          (sum, installment) =>
            sum +
            (installment.components.find(
              (row) => row.invoiceComponentId === component.id,
            )?.amountDue ?? 0),
          0,
        ),
      ).toBe(component.amountXof);
    }
  });

  it("shows full reconstructed cash and an annual account credit without duplicating awards", async () => {
    const profile = await prisma.annualBillingProfile.findUniqueOrThrow({
      where: {
        studentId_academicYearLabel: {
          studentId,
          academicYearLabel: "2031-2032",
        },
      },
      include: {
        canonicalInvoice: {
          include: { term: true, plan: { include: { installments: true } } },
        },
      },
    });
    const invoice = profile.canonicalInvoice!;
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: profile.netBilledXof, status: "paid" },
      });
      for (const installment of invoice.plan?.installments ?? []) {
        await tx.installment.update({
          where: { id: installment.id },
          data: { amountPaid: installment.amountDue, status: "paid" },
        });
      }
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId,
          amount: profile.netBilledXof + 1_433,
          method: "legacy_unknown",
          status: "success",
          providerRef: `billing-profile-credit-${randomUUID()}`,
          source: "workbook_cutover",
          settledAt: null,
          recognizedOn: new Date("2031-08-29T00:00:00.000Z"),
        },
      });
      await tx.invoice.create({
        data: {
          number: `CR-PAY-${payment.id}`,
          studentId,
          termId: invoice.termId,
          totalAmount: -1_433,
          amountPaid: 0,
          status: "paid",
          description: "Reviewed workbook account credit",
          costCenterCode: "9100",
          packageType: "credit",
          academicYearLabel: "2031-2032",
        },
      });
    });

    const view = await service.get(studentId, "2031-2032");
    expect(view).toMatchObject({
      paidXof: 3_901_433,
      outstandingXof: 0,
      accountCreditXof: 1_433,
      awards: [expect.objectContaining({ code: "family" })],
      adjustments: [],
    });
  });
});
