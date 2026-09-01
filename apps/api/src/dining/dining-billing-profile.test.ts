import { describe, expect, it, vi } from "vitest";
import { syncBillingProfileOperationsInTransaction } from "../finance/billing-profile.service.js";
import { DiningService } from "./dining.service.js";

describe("student cafeteria changes", () => {
  it("fails closed when a billed cafeteria option has no Dining access mapping", async () => {
    const mealPlanUpsert = vi.fn();
    await expect(
      syncBillingProfileOperationsInTransaction(
        {
          mealPlan: { upsert: mealPlanUpsert },
          housingAssignment: { upsert: vi.fn(), updateMany: vi.fn() },
        } as never,
        {
          studentId: "student-1",
          profileId: "profile-1",
          academicYearLabel: "2026-2027",
          selections: [
            {
              kind: "housing",
              serviceOptionId: "housing-none",
              optionCode: "none",
              percentageBasisOptionId: null,
              percentageBasisOptionCode: null,
              percentageBasisServiceKind: null,
              label: "No housing",
              amountXof: 0,
              refundable: false,
            },
            {
              kind: "cafeteria",
              serviceOptionId: "cafeteria-weekdays",
              optionCode: "weekdays",
              percentageBasisOptionId: null,
              percentageBasisOptionCode: null,
              percentageBasisServiceKind: null,
              label: "Weekday cafeteria",
              amountXof: 500_000,
              refundable: false,
            },
          ],
        },
      ),
    ).rejects.toThrow("no supported Dining access mapping");
    expect(mealPlanUpsert).not.toHaveBeenCalled();
  });

  it("releases an existing room operationally without erasing its historical location", async () => {
    const housingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    await syncBillingProfileOperationsInTransaction(
      {
        mealPlan: { upsert: vi.fn() },
        housingAssignment: {
          upsert: vi.fn(),
          updateMany: housingUpdateMany,
        },
      } as never,
      {
        studentId: "student-1",
        profileId: "profile-1",
        academicYearLabel: "2026-2027",
        selections: [
          {
            kind: "housing",
            serviceOptionId: "housing-none",
            optionCode: "none",
            percentageBasisOptionId: null,
            percentageBasisOptionCode: null,
            percentageBasisServiceKind: null,
            label: "No housing",
            amountXof: 0,
            refundable: false,
          },
          {
            kind: "cafeteria",
            serviceOptionId: "cafeteria-none",
            optionCode: "none",
            percentageBasisOptionId: null,
            percentageBasisOptionCode: null,
            percentageBasisServiceKind: null,
            label: "No cafeteria",
            amountXof: 0,
            refundable: false,
          },
        ],
      },
    );

    expect(housingUpdateMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        academicYearLabel: "2026-2027",
      },
      data: {
        academicYearLabel: "2026-2027",
        billedServiceOptionId: null,
        status: "unassigned",
      },
    });
    expect(housingUpdateMany.mock.calls[0]![0].data).not.toHaveProperty(
      "hallId",
    );
    expect(housingUpdateMany.mock.calls[0]![0].data).not.toHaveProperty("room");
  });

  it("creates a revision-checked approval request without activating MealPlan directly", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ id: "request-1", status: "pending" });
    const mealPlanUpsert = vi.fn();
    const prisma = {
      academicYear: {
        findMany: vi.fn().mockResolvedValue([{ label: "2026-2027" }]),
      },
      student: {
        findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
      },
      annualBillingProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: "profile-1",
          studentId: "student-1",
          academicYearLabel: "2026-2027",
          revision: 2,
          selections: [
            {
              kind: "housing",
              optionCode: "double",
              amountXof: 680_000,
            },
            {
              kind: "cafeteria",
              optionCode: "none",
              amountXof: 0,
            },
            {
              kind: "insurance",
              optionCode: "annual",
              amountXof: 10_000,
            },
            {
              kind: "housing_caution",
              optionCode: "housing_10_percent",
              amountXof: 68_000,
            },
          ],
          awards: [
            {
              definitionId: "definition-old",
              calculation: "percentage",
              invoiceAdjustmentId: "adjustment-old",
            },
            {
              definitionId: "definition-current",
              calculation: "percentage",
              invoiceAdjustmentId: "adjustment-current-award",
            },
            {
              definitionId: "definition-family",
              calculation: "manual",
              invoiceAdjustmentId: "adjustment-current-family",
            },
          ],
          invoiceAdjustments: [
            {
              id: "adjustment-old",
              definitionId: "definition-old",
              label: "Old award",
              calculation: "percentage",
              effect: "discount",
              amountXof: 400_000,
              reason: null,
              sourceReference: "billing-profile:profile-1:revision:1",
            },
            {
              id: "adjustment-current-award",
              definitionId: "definition-current",
              label: "Current configured award",
              calculation: "percentage",
              effect: "discount",
              amountXof: 400_000,
              reason: null,
              sourceReference: "billing-profile:profile-1:revision:2",
            },
            {
              id: "adjustment-current-family",
              definitionId: "definition-family",
              label: "Family award",
              calculation: "manual",
              effect: "discount",
              amountXof: 100_000,
              reason: "Reviewed family award",
              sourceReference: "billing-profile:profile-1:revision:2",
            },
            {
              id: "adjustment-current-manual",
              definitionId: null,
              label: "Workbook reconciliation",
              calculation: "manual",
              effect: "charge",
              amountXof: 1_433,
              reason: "Reviewed account correction",
              sourceReference: "billing-profile:profile-1:revision:2",
            },
          ],
        }),
      },
      billingServiceOption: {
        findMany: vi.fn().mockResolvedValue([
          {
            code: "full",
            label: "Full cafeteria plan",
            description: "Breakfast, lunch and dinner",
            calculation: "fixed",
            amountXof: 630_000,
          },
        ]),
      },
      mealPlan: { upsert: mealPlanUpsert },
    };
    const service = new DiningService(
      { SESSION_SECRET: "test-secret" } as never,
      prisma as never,
      {} as never,
      { request } as never,
    );
    const actor = {
      personId: "person-1",
      studentId: "student-1",
      roles: ["student"],
      email: "student@test.local",
      name: "Student One",
    } as const;

    await expect(
      service.choosePlan("student-1", actor as never, "full"),
    ).resolves.toMatchObject({ id: "request-1", status: "pending" });
    expect(mealPlanUpsert).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        kind: "billing_profile",
        targetType: "Student",
        targetId: "student-1",
        academicYearLabel: "2026-2027",
        after: {
          academicYearLabel: "2026-2027",
          expectedRevision: 2,
          housingOptionCode: "double",
          cafeteriaOptionCode: "full",
          insuranceSelected: true,
          cautionSelected: true,
          awardDefinitionIds: ["definition-current"],
          manualAdjustments: [
            {
              definitionId: "definition-family",
              label: "Family award",
              amountXof: -100_000,
              reason: "Reviewed family award",
            },
            {
              definitionId: undefined,
              label: "Workbook reconciliation",
              amountXof: 1_433,
              reason: "Reviewed account correction",
            },
          ],
        },
      }),
    );
  });

  it("leaves half-plan availability to the approved billing catalog", async () => {
    const mealPlanUpsert = vi.fn();
    const request = vi
      .fn()
      .mockRejectedValue(
        new Error("Billing option cafeteria:half is unavailable"),
      );
    const service = new DiningService(
      { SESSION_SECRET: "test-secret" } as never,
      {
        academicYear: {
          findMany: vi.fn().mockResolvedValue([{ label: "2026-2027" }]),
        },
        student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
        annualBillingProfile: {
          findFirst: vi.fn().mockResolvedValue({
            id: "profile-1",
            academicYearLabel: "2026-2027",
            revision: 1,
            selections: [
              { kind: "housing", optionCode: "none", amountXof: 0 },
              { kind: "insurance", optionCode: "none", amountXof: 0 },
              {
                kind: "housing_caution",
                optionCode: "none",
                amountXof: 0,
              },
            ],
            awards: [],
            invoiceAdjustments: [],
          }),
        },
        billingServiceOption: { findMany: vi.fn().mockResolvedValue([]) },
        mealPlan: { upsert: mealPlanUpsert },
      } as never,
      {} as never,
      { request } as never,
    );
    await expect(
      service.choosePlan(
        "student-1",
        {
          personId: "person-1",
          studentId: "student-1",
          roles: ["student"],
          email: "student@test.local",
          name: "Student One",
        },
        "half",
      ),
    ).rejects.toThrow("not active and priced");
    expect(request).not.toHaveBeenCalled();
    expect(mealPlanUpsert).not.toHaveBeenCalled();
  });

  it("returns only active, fixed, priced annual cafeteria options and pending state", async () => {
    const prisma = {
      academicYear: {
        findMany: vi.fn().mockResolvedValue([{ label: "2026-2027" }]),
      },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      annualBillingProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: "profile-1",
          academicYearLabel: "2026-2027",
          selections: [{ kind: "cafeteria", optionCode: "none" }],
        }),
      },
      billingServiceOption: {
        findMany: vi.fn().mockResolvedValue([
          {
            code: "none",
            label: "No cafeteria",
            description: null,
            calculation: "fixed",
            amountXof: 0,
          },
          {
            code: "half",
            label: "Half plan",
            description: "Approved half plan",
            calculation: "fixed",
            amountXof: 420_000,
          },
          {
            code: "full",
            label: "Full plan",
            description: "Approved full plan",
            calculation: "fixed",
            amountXof: 630_000,
          },
          {
            code: "half",
            label: "Unpriced half plan",
            description: null,
            calculation: "fixed",
            amountXof: null,
          },
        ]),
      },
      approvalRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: "request-1",
          status: "pending",
          createdAt: new Date("2026-09-01T10:00:00.000Z"),
          afterJson: { cafeteriaOptionCode: "half" },
        }),
      },
    };
    const service = new DiningService(
      { SESSION_SECRET: "test-secret" } as never,
      prisma as never,
      {} as never,
      { request: vi.fn() } as never,
    );

    await expect(service.myPlanOptions("student-1")).resolves.toEqual({
      academicYearLabel: "2026-2027",
      currentOptionCode: "none",
      options: [
        {
          code: "none",
          label: "No cafeteria",
          description: null,
          amountXof: 0,
        },
        {
          code: "half",
          label: "Half plan",
          description: "Approved half plan",
          amountXof: 420_000,
        },
        {
          code: "full",
          label: "Full plan",
          description: "Approved full plan",
          amountXof: 630_000,
        },
      ],
      pendingRequest: {
        id: "request-1",
        status: "pending",
        requestedOptionCode: "half",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    });
    expect(prisma.annualBillingProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-1",
          academicYearLabel: "2026-2027",
          status: "active",
        },
      }),
    );
  });

  it("never lets a future-year MealPlan grant access in the current year", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new DiningService(
      { SESSION_SECRET: "test-secret" } as never,
      {
        academicYear: {
          findMany: vi.fn().mockResolvedValue([{ label: "2026-2027" }]),
        },
        student: {
          findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
        },
        mealPlan: { findUnique },
        appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
        diningScan: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      { request: vi.fn() } as never,
    );

    await expect(
      service.myEligibility("student-1", "lunch"),
    ).resolves.toMatchObject({
      academicYearLabel: "2026-2027",
      code: "NO_PLAN",
      serve: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        studentId_academicYearLabel: {
          studentId: "student-1",
          academicYearLabel: "2026-2027",
        },
      },
    });
  });

  it("blocks Dining when date-bounded active academic years overlap", async () => {
    const findUnique = vi.fn();
    const service = new DiningService(
      { SESSION_SECRET: "test-secret" } as never,
      {
        academicYear: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { label: "2026-2027" },
              { label: "2026 special" },
            ]),
        },
        student: { findUniqueOrThrow: vi.fn() },
        mealPlan: { findUnique },
      } as never,
      {} as never,
      { request: vi.fn() } as never,
    );

    await expect(service.myPass("student-1")).rejects.toThrow(
      /effective academic year is ambiguous/,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
