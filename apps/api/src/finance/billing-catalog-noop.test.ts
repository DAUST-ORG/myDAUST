import {
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_SERVICE_OPTIONS,
} from "@mydaust/shared";
import { describe, expect, it, vi } from "vitest";
import {
  BillingProfileService,
  type BillingCatalogChangeInput,
  type BillingProfileChangeInput,
} from "./billing-profile.service.js";

const academicYearLabel = "2031–2032";
const input: BillingCatalogChangeInput = {
  academicYearLabel,
  serviceOptions: INITIAL_BILLING_SERVICE_OPTIONS.map((option) => ({
    ...option,
    active: true,
  })),
  adjustmentDefinitions: INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.map(
    (definition) => ({ ...definition, active: true }),
  ),
};

function service() {
  const serviceOptions = input.serviceOptions.map((option, index) => ({
    id: `service-${index}`,
    academicYearLabel,
    ...option,
    description: option.description ?? null,
    amountXof: option.amountXof ?? null,
    percentageBasisPoints: option.percentageBasisPoints ?? null,
    basisServiceKind: option.basisServiceKind ?? null,
    createdAt: new Date("2031-01-01T00:00:00.000Z"),
    updatedAt: new Date("2031-01-01T00:00:00.000Z"),
  }));
  const adjustmentDefinitions = input.adjustmentDefinitions.map(
    (definition, index) => ({
      id: `adjustment-${index}`,
      academicYearLabel,
      ...definition,
      description: definition.description ?? null,
      percentageBasisPoints: definition.percentageBasisPoints ?? null,
      fixedAmountXof: definition.fixedAmountXof ?? null,
      createdAt: new Date("2031-01-01T00:00:00.000Z"),
      updatedAt: new Date("2031-01-01T00:00:00.000Z"),
    }),
  );
  const prisma = {
    academicYear: {
      findUnique: vi.fn().mockResolvedValue({ label: academicYearLabel }),
    },
    billingServiceOption: {
      findMany: vi.fn().mockResolvedValue(serviceOptions),
    },
    billingAdjustmentDefinition: {
      findMany: vi.fn().mockResolvedValue(adjustmentDefinitions),
    },
    feeSchedule: {
      findFirst: vi.fn().mockResolvedValue({ revision: 3 }),
    },
  };
  return new BillingProfileService(prisma as never);
}

describe("billing catalog no-op approvals", () => {
  it("rejects a catalog request equal to the current persisted values", async () => {
    await expect(service().catalogApprovalSnapshot(input)).rejects.toThrow(
      "billing catalog already has these services",
    );
  });

  it("allows a catalog request with a real mutable-field change", async () => {
    const changed: BillingCatalogChangeInput = {
      ...input,
      adjustmentDefinitions: input.adjustmentDefinitions.map(
        (definition, index) =>
          index === 0
            ? { ...definition, description: "Director-reviewed description" }
            : definition,
      ),
    };
    await expect(
      service().catalogApprovalSnapshot(changed),
    ).resolves.toMatchObject({ baseRevision: 3 });
  });
});

describe("annual profile manual-adjustment no-op approvals", () => {
  const change: BillingProfileChangeInput = {
    academicYearLabel,
    housingOptionCode: "none",
    cafeteriaOptionCode: "none",
    insuranceSelected: false,
    cautionSelected: false,
    manualAdjustments: [
      {
        label: "Manual reconciliation",
        amountXof: 10_000,
        reason: "Reviewed correction",
      },
    ],
  };
  const adjustment = {
    definitionId: null,
    code: "manual_reconciliation",
    label: "Manual reconciliation",
    source: "manual_reconciliation",
    basis: "manual",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    requiresApproval: true,
    basisAmountXof: null,
    percentageBasisPoints: null,
    amountXof: 10_000,
    reason: "Reviewed correction",
    isAward: false,
  };
  const plan = {
    academicYearLabel,
    feeScheduleId: "schedule-1",
    feeScheduleRevision: 3,
    feeScheduleFingerprintSha256: "a".repeat(64),
    billingCatalogFingerprintSha256: "b".repeat(64),
    components: [],
    selections: [],
    adjustments: [adjustment],
    grossChargesXof: 100_000,
    netBilledXof: 90_000,
  };
  const profile = {
    id: "profile-1",
    studentId: "student-1",
    academicYearLabel,
    revision: 2,
    grossChargesXof: 100_000,
    netBilledXof: 90_000,
    selections: [],
    awards: [],
    invoiceAdjustments: [
      {
        id: "adjustment-1",
        ...adjustment,
        requiresApproval: undefined,
        sourceReference: "billing-profile:profile-1:revision:2",
      },
    ],
  };

  function manualProfileService() {
    const billingProfiles = new BillingProfileService({
      annualBillingProfile: {
        findUnique: vi.fn().mockResolvedValue(profile),
      },
    } as never) as unknown as {
      approvalSnapshot(
        studentId: string,
        input: BillingProfileChangeInput,
      ): Promise<unknown>;
      staleReason(
        tx: unknown,
        studentId: string,
        year: string,
        revision: number,
        input: BillingProfileChangeInput,
      ): Promise<string | null>;
      resolvePlanForStudent: ReturnType<typeof vi.fn>;
      preparedPlanStaleReason: ReturnType<typeof vi.fn>;
    };
    billingProfiles.resolvePlanForStudent = vi.fn().mockResolvedValue(plan);
    billingProfiles.preparedPlanStaleReason = vi.fn().mockReturnValue(null);
    return billingProfiles;
  }

  it("rejects an identical uncatalogued manual adjustment before request creation", async () => {
    await expect(
      manualProfileService().approvalSnapshot("student-1", change),
    ).rejects.toThrow("Annual profile already has these services");
  });

  it("marks an identical pending manual adjustment as having no change to apply", async () => {
    const billingProfiles = manualProfileService();
    await expect(
      billingProfiles.staleReason(
        {
          annualBillingProfile: {
            findUnique: vi.fn().mockResolvedValue(profile),
          },
        },
        "student-1",
        academicYearLabel,
        2,
        change,
      ),
    ).resolves.toContain("there is no change to apply");
  });
});
