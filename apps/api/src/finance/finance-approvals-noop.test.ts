import { describe, expect, it, vi } from "vitest";
import { deriveApiAccountPosition } from "./account-position.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import {
  approvedAccountBillingBridge,
  invoiceComponentBillingBridge,
  invoiceComponentIsSelected,
} from "./finance.service.js";

function serviceWith(prisma: Record<string, unknown>) {
  return new FinanceApprovalsService(prisma as never) as unknown as {
    snapshot(change: Record<string, unknown>): Promise<unknown>;
    staleReason(
      tx: Record<string, unknown>,
      request: Record<string, unknown>,
    ): Promise<string | null>;
    applyPaymentPlan(
      tx: Record<string, unknown>,
      invoiceId: string,
      after: Record<string, unknown>,
      requesterId: string,
    ): Promise<unknown>;
  };
}

const invoice = (profileManaged: boolean) => ({
  id: "invoice-1",
  academicYearLabel: "2026–2027",
  feeScheduleId: "schedule-1",
  revision: 4,
  status: "paid",
  packageType: "standard_full",
  paymentPlanOverride: false,
  plan: { installments: [] },
  components: [
    {
      id: "tuition-component",
      kind: "tuition",
      amountXof: 0,
      grossAmountXof: 2_975_000,
    },
  ],
  componentOverrides: [],
  billingProfile: profileManaged
    ? { id: "profile-1", status: "active", academicYearLabel: "2026–2027" }
    : null,
});

const schedule = {
  id: "schedule-1",
  revision: 1,
  components: [
    {
      id: "catalog-tuition",
      key: "tuition",
      label: "Tuition",
      annualAmountXof: 2_975_000,
      costCenterCode: "9100",
      defaultSelected: true,
    },
  ],
};

const invoiceWithPlan = (withComponentGrid = false) => ({
  ...invoice(false),
  totalAmount: 1_000_000,
  plan: {
    installments: [
      {
        id: "installment-1",
        sequence: 1,
        dueDate: new Date("2026-09-01T00:00:00.000Z"),
        amountDue: 500_000,
        amountPaid: 0,
        label: null,
        components: withComponentGrid
          ? [
              { invoiceComponentId: "tuition-component", amountDue: 300_000 },
              { invoiceComponentId: "housing-component", amountDue: 200_000 },
            ]
          : [],
      },
      {
        id: "installment-2",
        sequence: 2,
        dueDate: new Date("2027-01-15T00:00:00.000Z"),
        amountDue: 500_000,
        amountPaid: 0,
        label: "Final payment",
        components: withComponentGrid
          ? [
              { invoiceComponentId: "tuition-component", amountDue: 300_000 },
              { invoiceComponentId: "housing-component", amountDue: 200_000 },
            ]
          : [],
      },
    ],
  },
});

const approvedSchedule = {
  id: "schedule-2",
  academicYearLabel: "2026–2027",
  revision: 2,
  status: "approved",
  rows: [
    {
      id: "fee-row-1",
      academicYearLabel: "2026–2027",
      semester: "Fall",
      label: "Payment 1",
      sequence: 1,
      dueOn: new Date("2026-09-01T00:00:00.000Z"),
      amountFullXof: 1_000_000,
      amountTuitionXof: 500_000,
      amountHousingXof: 250_000,
      amountCafeteriaXof: 250_000,
    },
    {
      id: "fee-row-2",
      academicYearLabel: "2026–2027",
      semester: "Spring",
      label: "Payment 2",
      sequence: 2,
      dueOn: new Date("2027-01-15T00:00:00.000Z"),
      amountFullXof: 1_000_000,
      amountTuitionXof: 500_000,
      amountHousingXof: 250_000,
      amountCafeteriaXof: 250_000,
    },
  ],
  components: [
    {
      id: "fee-tuition",
      key: "tuition",
      label: "Tuition",
      description: "Annual tuition",
      costCenterCode: "9100",
      annualAmountXof: 1_000_000,
      defaultSelected: true,
      sortOrder: 0,
    },
    {
      id: "fee-housing",
      key: "housing",
      label: "Housing",
      description: "Annual housing",
      costCenterCode: "3700",
      annualAmountXof: 500_000,
      defaultSelected: true,
      sortOrder: 1,
    },
    {
      id: "fee-cafeteria",
      key: "cafeteria",
      label: "Cafeteria",
      description: "Annual cafeteria",
      costCenterCode: "3600",
      annualAmountXof: 500_000,
      defaultSelected: true,
      sortOrder: 2,
    },
  ],
};

describe("finance approval no-op and annual-profile guards", () => {
  it("keeps the Ndao profile cleared while showing funded tuition as included", async () => {
    const fullScholarship = {
      id: "full-scholarship",
      label: "Full scholarship",
      effect: "discount",
      amountXof: 2_975_000,
      reason: "Full tuition scholarship",
    };
    const activeAdjustmentIds = new Set([fullScholarship.id]);
    const profileManaged = true;
    const tuition = invoiceComponentBillingBridge(
      {
        grossAmountXof: 2_975_000,
        amountXof: 0,
        adjustments: [fullScholarship],
      },
      profileManaged,
      activeAdjustmentIds,
    );
    const cafeteria = invoiceComponentBillingBridge(
      {
        grossAmountXof: 630_000,
        amountXof: 630_000,
        adjustments: [],
      },
      profileManaged,
      activeAdjustmentIds,
    );
    const retiredHousing = invoiceComponentBillingBridge(
      {
        grossAmountXof: 0,
        amountXof: 0,
        adjustments: [],
      },
      profileManaged,
      activeAdjustmentIds,
    );
    const adjustmentOnlyCharge = invoiceComponentBillingBridge(
      {
        grossAmountXof: 0,
        amountXof: 25_000,
        adjustments: [],
      },
      profileManaged,
      activeAdjustmentIds,
    );

    expect(tuition).toMatchObject({
      grossAmountXof: 2_975_000,
      netAmountXof: 0,
      selected: true,
      adjustments: [
        expect.objectContaining({
          label: "Full scholarship",
          effect: "discount",
          amountXof: 2_975_000,
        }),
      ],
    });
    expect(cafeteria).toMatchObject({
      grossAmountXof: 630_000,
      netAmountXof: 630_000,
      selected: true,
    });
    expect(retiredHousing).toMatchObject({
      grossAmountXof: 0,
      netAmountXof: 0,
      selected: false,
    });
    expect(adjustmentOnlyCharge).toMatchObject({
      grossAmountXof: 0,
      netAmountXof: 25_000,
      selected: true,
    });
    expect(
      invoiceComponentIsSelected(
        { grossAmountXof: 2_975_000, amountXof: 0 },
        true,
      ),
    ).toBe(true);
    expect(
      invoiceComponentIsSelected({ grossAmountXof: 0, amountXof: 0 }, true),
    ).toBe(false);
    expect(
      invoiceComponentIsSelected(
        { grossAmountXof: 0, amountXof: 25_000 },
        true,
      ),
    ).toBe(true);
    expect(tuition.grossAmountXof + cafeteria.grossAmountXof).toBe(3_605_000);
    expect(tuition.netAmountXof + cafeteria.netAmountXof).toBe(630_000);

    const position = deriveApiAccountPosition(
      [
        {
          id: "ndao-annual-invoice",
          status: "paid",
          totalAmount: 630_000,
          amountPaid: 630_000,
          plan: {
            installments: [
              {
                id: "ndao-installment",
                sequence: 1,
                dueDate: "2026-09-01",
                amountDue: 630_000,
                amountPaid: 630_000,
              },
            ],
          },
        },
      ],
      new Date("2026-09-03T12:00:00.000Z"),
    );
    expect(position.summary).toMatchObject({
      balanceXof: 0,
      outstandingXof: 0,
      standing: "cleared",
    });
    expect(
      approvedAccountBillingBridge(
        [
          {
            status: "paid",
            totalAmount: 630_000,
            amountPaid: 630_000,
            billingProfile: {
              status: "active",
              grossChargesXof: 3_605_000,
              netBilledXof: 630_000,
            },
          },
          {
            status: "void",
            totalAmount: 680_000,
            amountPaid: 0,
            billingProfile: null,
          },
        ],
        position.summary.outstandingXof,
      ),
    ).toEqual({
      grossChargesXof: 3_605_000,
      adjustmentsXof: -2_975_000,
      netBillXof: 630_000,
      paidXof: 630_000,
      outstandingXof: 0,
    });

    const approvals = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice(true)) },
    });
    await expect(
      approvals.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: { mode: "add_component", componentKey: "tuition" },
      }),
    ).rejects.toThrow("controlled by the Annual profile");
  });

  it("rejects direct component changes for a profile-managed invoice", async () => {
    const approvals = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice(true)) },
    });

    await expect(
      approvals.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: { mode: "add_component", componentKey: "tuition" },
      }),
    ).rejects.toThrow("controlled by the Annual profile");
  });

  it("preserves a funded net-zero component grid during a profile-managed date-only edit", async () => {
    const managedInvoice = {
      ...invoice(true),
      totalAmount: 630_000,
      amountPaid: 630_000,
      costCenterCode: "3600",
      paymentPlanOverride: true,
      plan: {
        id: "plan-1",
        installments: [
          {
            id: "installment-1",
            sequence: 1,
            dueDate: new Date("2026-09-01T00:00:00.000Z"),
            amountDue: 630_000,
            amountPaid: 630_000,
            label: "Annual payment",
            components: [
              {
                invoiceComponentId: "tuition-component",
                amountDue: 0,
              },
              {
                invoiceComponentId: "cafeteria-component",
                amountDue: 630_000,
              },
            ],
          },
        ],
      },
      components: [
        {
          id: "tuition-component",
          kind: "tuition",
          label: "Tuition",
          amountXof: 0,
          grossAmountXof: 2_975_000,
          allocations: [],
        },
        {
          id: "cafeteria-component",
          kind: "cafeteria",
          label: "Cafeteria",
          amountXof: 630_000,
          grossAmountXof: 630_000,
          allocations: [],
        },
      ],
    };
    const approvals = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(managedInvoice) },
    });
    const after = {
      mode: "update",
      installments: [
        {
          id: "installment-1",
          dueDate: "2026-09-15",
          amountDue: 630_000,
          label: "Annual payment",
        },
      ],
    };

    await expect(
      approvals.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after,
      }),
    ).resolves.toMatchObject({ baseRevision: 4 });

    const installmentComponentDelete = vi.fn();
    const installmentComponentCreate = vi.fn();
    const invoiceComponentUpdate = vi.fn();
    const tx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue(managedInvoice),
        update: vi.fn().mockResolvedValue({}),
      },
      installment: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({ id: "installment-1" }),
        create: vi.fn(),
      },
      installmentComponent: {
        deleteMany: installmentComponentDelete,
        createMany: installmentComponentCreate,
      },
      invoiceComponent: { update: invoiceComponentUpdate },
    };
    await expect(
      approvals.applyPaymentPlan(tx, "invoice-1", after, "director-1"),
    ).resolves.toMatchObject({ invoiceId: "invoice-1", total: 630_000 });
    expect(installmentComponentDelete).not.toHaveBeenCalled();
    expect(installmentComponentCreate).not.toHaveBeenCalled();
    expect(invoiceComponentUpdate).not.toHaveBeenCalled();

    for (const forbiddenAfter of [
      {
        ...after,
        installments: [
          {
            ...after.installments[0],
            amountDue: 640_000,
          },
        ],
      },
      {
        ...after,
        installments: [
          {
            ...after.installments[0],
            components: [
              {
                invoiceComponentId: "tuition-component",
                amountXof: 10_000,
              },
              {
                invoiceComponentId: "cafeteria-component",
                amountXof: 620_000,
              },
            ],
          },
        ],
      },
    ]) {
      await expect(
        approvals.snapshot({
          kind: "payment_plan",
          targetType: "Invoice",
          targetId: "invoice-1",
          after: forbiddenAfter,
        }),
      ).rejects.toThrow("Annual profile");
    }
  });

  it("rejects an add-component request when the charge is already selected", async () => {
    const approvals = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice(false)) },
      feeSchedule: { findFirst: vi.fn().mockResolvedValue(schedule) },
    });

    await expect(
      approvals.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: { mode: "add_component", componentKey: "tuition" },
      }),
    ).rejects.toThrow("Tuition is already included");
  });

  it("rejects create, partial-update, and replace requests equal to the current plan", async () => {
    const existingCreatedPlan = invoiceWithPlan();
    existingCreatedPlan.plan.installments[1]!.label = null;
    const create = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(existingCreatedPlan) },
    });
    await expect(
      create.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: {
          mode: "create",
          installments: [
            { sequence: 1, dueDate: "2026-09-01", percent: 50 },
            { sequence: 2, dueDate: "2027-01-15", percent: 50 },
          ],
        },
      }),
    ).rejects.toThrow("payment plan already has these");

    const ordinary = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(invoiceWithPlan()) },
    });
    await expect(
      ordinary.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: {
          mode: "update",
          installments: [
            {
              id: "installment-1",
              dueDate: "2026-09-01",
              amountDue: 500_000,
            },
          ],
        },
      }),
    ).rejects.toThrow("payment plan already has these");

    const withGrid = serviceWith({
      invoice: {
        findUnique: vi.fn().mockResolvedValue(invoiceWithPlan(true)),
      },
    });
    await expect(
      withGrid.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: {
          mode: "replace",
          installments: invoiceWithPlan(true).plan.installments.map((row) => ({
            id: row.id,
            sequence: row.sequence,
            dueDate: row.dueDate.toISOString().slice(0, 10),
            amountDue: row.amountDue,
            label: row.label,
            components: [...row.components].reverse().map((component) => ({
              invoiceComponentId: component.invoiceComponentId,
              amountXof: component.amountDue,
            })),
          })),
        },
      }),
    ).rejects.toThrow("payment plan already has these");
  });

  it("allows a payment-plan request with a real label or component-grid change", async () => {
    const ordinary = serviceWith({
      invoice: { findUnique: vi.fn().mockResolvedValue(invoiceWithPlan()) },
    });
    await expect(
      ordinary.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: {
          mode: "update",
          installments: [
            {
              id: "installment-1",
              dueDate: "2026-09-01",
              amountDue: 500_000,
              label: "Registration",
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ baseRevision: 4 });

    const withGrid = serviceWith({
      invoice: {
        findUnique: vi.fn().mockResolvedValue(invoiceWithPlan(true)),
      },
    });
    await expect(
      withGrid.snapshot({
        kind: "payment_plan",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: {
          mode: "update",
          installments: [
            {
              id: "installment-1",
              dueDate: "2026-09-01",
              amountDue: 500_000,
              components: [
                { invoiceComponentId: "tuition-component", amountXof: 310_000 },
                { invoiceComponentId: "housing-component", amountXof: 190_000 },
              ],
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ baseRevision: 4 });
  });

  it("rejects removal of a charge that is already void", async () => {
    const approvals = serviceWith({
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          ...invoice(false),
          status: "void",
        }),
      },
    });
    await expect(
      approvals.snapshot({
        kind: "charge_removal",
        targetType: "Invoice",
        targetId: "invoice-1",
        after: { invoiceId: "invoice-1" },
      }),
    ).rejects.toThrow("already removed");
  });

  it("rejects unchanged single-row and batch fee-schedule requests", async () => {
    const approvals = serviceWith({
      feeSchedule: {
        findFirst: vi.fn().mockResolvedValue(approvedSchedule),
      },
    });
    await expect(
      approvals.snapshot({
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: "fee-row-1",
        academicYearLabel: "2026–2027",
        after: {
          rowId: "fee-row-1",
          input: { label: "Payment 1", dueOn: "2026-09-01" },
        },
      }),
    ).rejects.toThrow("fee schedule already has these");
    await expect(
      approvals.snapshot({
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: "schedule-2",
        academicYearLabel: "2026–2027",
        after: {
          rows: approvedSchedule.rows.map((row) => ({
            id: row.id,
            label: row.label,
            dueOn: row.dueOn.toISOString().slice(0, 10),
            amountFullXof: row.amountFullXof,
            amountTuitionXof: row.amountTuitionXof,
            amountHousingXof: row.amountHousingXof,
            amountCafeteriaXof: row.amountCafeteriaXof,
          })),
          components: approvedSchedule.components,
        },
      }),
    ).rejects.toThrow("fee schedule already has these");
  });

  it("allows a fee-schedule request with a real date change", async () => {
    const approvals = serviceWith({
      feeSchedule: {
        findFirst: vi.fn().mockResolvedValue(approvedSchedule),
      },
    });
    await expect(
      approvals.snapshot({
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: "fee-row-1",
        academicYearLabel: "2026–2027",
        after: {
          rowId: "fee-row-1",
          input: { dueOn: "2026-09-08" },
        },
      }),
    ).resolves.toMatchObject({ baseRevision: 2 });
  });

  it("marks a pending component request stale when an active profile takes control", async () => {
    const approvals = serviceWith({});
    const tx = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice(true)) },
    };

    await expect(
      approvals.staleReason(tx, {
        kind: "payment_plan",
        targetId: "invoice-1",
        baseRevision: 4,
        afterJson: {
          mode: "add_component",
          componentKey: "tuition",
          catalogSnapshot: { label: "Tuition", defaultSelected: true },
        },
      }),
    ).resolves.toContain("Annual profile");
  });

  it("directs standalone scholarship requests to the Annual profile", async () => {
    const managedProfile = vi
      .fn()
      .mockResolvedValue({ academicYearLabel: "2026–2027" });
    const approvals = serviceWith({
      annualBillingProfile: {
        findFirst: managedProfile,
      },
      term: {
        findFirst: vi.fn().mockResolvedValue({
          id: "term-fall-2026",
          name: "Fall 2026",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", label: "2026–2027" },
        }),
      },
      costCenter: { findUnique: vi.fn().mockResolvedValue({ code: "9100" }) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
    });

    await expect(
      approvals.snapshot({
        kind: "scholarship",
        targetType: "Student",
        targetId: "student-1",
        after: {
          studentId: "student-1",
          label: "Full scholarship",
          amountXof: 2_975_000,
        },
      }),
    ).rejects.toThrow("managed by the Annual profile");
    expect(managedProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-1",
          academicYearLabel: "2026–2027",
          status: "active",
        }),
      }),
    );
  });

  it("does not let an active profile from another year block a standalone credit", async () => {
    const profileLookup = vi
      .fn()
      .mockImplementation(({ where }) =>
        where.academicYearLabel === "2025–2026"
          ? Promise.resolve({ academicYearLabel: "2025–2026" })
          : Promise.resolve(null),
      );
    const approvals = serviceWith({
      annualBillingProfile: { findFirst: profileLookup },
      term: {
        findFirst: vi.fn().mockResolvedValue({
          id: "term-fall-2026",
          name: "Fall 2026",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", label: "2026–2027" },
        }),
      },
      costCenter: { findUnique: vi.fn().mockResolvedValue({ code: "9100" }) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
    });

    await expect(
      approvals.snapshot({
        kind: "discount",
        targetType: "Student",
        targetId: "student-1",
        after: {
          studentId: "student-1",
          label: "Reviewed discount",
          amountXof: 25_000,
        },
      }),
    ).resolves.toMatchObject({
      after: {
        billingContext: { academicYearLabel: "2026–2027" },
      },
    });
    expect(profileLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academicYearLabel: "2026–2027" }),
      }),
    );
  });

  it("checks profile control against the frozen year when a credit is pending", async () => {
    const approvals = serviceWith({});
    const profileLookup = vi
      .fn()
      .mockImplementation(({ where }) =>
        where.academicYearLabel === "2026–2027"
          ? Promise.resolve({ id: "profile-2026" })
          : Promise.resolve(null),
      );
    const tx = {
      term: {
        findFirst: vi.fn().mockResolvedValue({
          id: "term-fall-2026",
          name: "Fall 2026",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", label: "2026–2027" },
        }),
      },
      costCenter: { findUnique: vi.fn().mockResolvedValue({ code: "9100" }) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      annualBillingProfile: { findFirst: profileLookup },
    };
    await expect(
      approvals.staleReason(tx, {
        kind: "scholarship",
        targetId: "student-1",
        afterJson: {
          studentId: "student-1",
          billingContext: {
            termId: "term-fall-2026",
            termName: "Fall 2026",
            academicYearId: "year-2026",
            academicYearLabel: "2026–2027",
          },
        },
      }),
    ).resolves.toContain("Annual profile now controls");
    expect(profileLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academicYearLabel: "2026–2027" }),
      }),
    );
  });

  it("does not stale a pending credit for a profile in another academic year", async () => {
    const approvals = serviceWith({});
    const profileLookup = vi
      .fn()
      .mockImplementation(({ where }) =>
        where.academicYearLabel === "2025–2026"
          ? Promise.resolve({ id: "profile-2025" })
          : Promise.resolve(null),
      );
    await expect(
      approvals.staleReason(
        {
          term: {
            findFirst: vi.fn().mockResolvedValue({
              id: "term-fall-2026",
              name: "Fall 2026",
              academicYearId: "year-2026",
              academicYear: { id: "year-2026", label: "2026–2027" },
            }),
          },
          costCenter: {
            findUnique: vi.fn().mockResolvedValue({ code: "9100" }),
          },
          student: {
            findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
          },
          annualBillingProfile: { findFirst: profileLookup },
        },
        {
          kind: "discount",
          targetId: "student-1",
          afterJson: {
            studentId: "student-1",
            billingContext: {
              termId: "term-fall-2026",
              termName: "Fall 2026",
              academicYearId: "year-2026",
              academicYearLabel: "2026–2027",
            },
          },
        },
      ),
    ).resolves.toBeNull();
    expect(profileLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academicYearLabel: "2026–2027" }),
      }),
    );
  });

  it("freezes the reviewed term and year on standalone money requests", async () => {
    const activeTerm = {
      id: "term-fall-2026",
      name: "Fall 2026",
      academicYearId: "year-2026",
      academicYear: { id: "year-2026", label: "2026–2027" },
    };
    const custom = serviceWith({
      term: { findFirst: vi.fn().mockResolvedValue(activeTerm) },
      costCenter: { findUnique: vi.fn().mockResolvedValue({ code: "9100" }) },
      student: {
        findMany: vi.fn().mockResolvedValue([{ id: "student-1" }]),
      },
    });
    await expect(
      custom.snapshot({
        kind: "custom_charge",
        targetType: "Student",
        after: {
          studentIds: ["student-1"],
          description: "Lab fee",
          amountXof: 25_000,
        },
      }),
    ).resolves.toMatchObject({
      after: {
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        billingContext: {
          termId: "term-fall-2026",
          termName: "Fall 2026",
          academicYearId: "year-2026",
          academicYearLabel: "2026–2027",
        },
      },
    });

    const credit = serviceWith({
      annualBillingProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      term: { findFirst: vi.fn().mockResolvedValue(activeTerm) },
      costCenter: { findUnique: vi.fn().mockResolvedValue({ code: "9100" }) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
    });
    await expect(
      credit.snapshot({
        kind: "discount",
        targetType: "Student",
        targetId: "student-1",
        after: {
          studentId: "student-1",
          label: "Reviewed discount",
          amountXof: 25_000,
        },
      }),
    ).resolves.toMatchObject({
      after: {
        billingContext: {
          termId: "term-fall-2026",
          academicYearLabel: "2026–2027",
        },
      },
    });
  });

  it("marks a standalone money request stale across a billing-period rollover", async () => {
    const approvals = serviceWith({});
    const invoiceCreate = vi.fn();
    const tx = {
      term: {
        findFirst: vi.fn().mockResolvedValue({
          id: "term-spring-2027",
          name: "Spring 2027",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", label: "2026–2027" },
        }),
      },
      invoice: { create: invoiceCreate },
    };
    await expect(
      approvals.staleReason(tx, {
        kind: "custom_charge",
        afterJson: {
          billingContext: {
            termId: "term-fall-2026",
            termName: "Fall 2026",
            academicYearId: "year-2026",
            academicYearLabel: "2026–2027",
          },
        },
      }),
    ).resolves.toContain("active billing period changed");
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("marks a standalone charge stale when a reviewed student is archived", async () => {
    const approvals = serviceWith({});
    const tx = {
      term: {
        findFirst: vi.fn().mockResolvedValue({
          id: "term-fall-2026",
          name: "Fall 2026",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", label: "2026–2027" },
        }),
      },
      costCenter: {
        findUnique: vi.fn().mockResolvedValue({ code: "9100" }),
      },
      student: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await expect(
      approvals.staleReason(tx, {
        kind: "custom_charge",
        afterJson: {
          studentIds: ["student-1"],
          billingContext: {
            termId: "term-fall-2026",
            termName: "Fall 2026",
            academicYearId: "year-2026",
            academicYearLabel: "2026–2027",
          },
        },
      }),
    ).resolves.toContain("missing or archived");
  });

  it("blocks direct approval when human review details cannot be resolved", async () => {
    const runTransaction = vi.fn();
    const approvals = new FinanceApprovalsService({
      approvalRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "approval-1",
          kind: "custom_charge",
          status: "pending",
          targetType: "Student",
          targetId: "student-1",
          academicYearLabel: "2026–2027",
          beforeJson: null,
          afterJson: {
            studentIds: ["student-1"],
            description: "Lab fee",
            amountXof: 10_000,
          },
          events: [],
        }),
      },
      // Intentionally omit the student resolver: enrichment must fail closed.
      $transaction: runTransaction,
    } as never);

    await expect(
      approvals.approve(
        "approval-1",
        { personId: "director-1", roles: ["admin"] } as never,
        "Reviewed",
      ),
    ).rejects.toThrow("human-readable review details could not be resolved");
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
