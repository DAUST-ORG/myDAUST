import { describe, expect, it } from "vitest";
import { buildApprovalPresentation } from "./approval-presentation.js";

describe("approval presentation", () => {
  const reviewedBillingContext = {
    termId: "term-1",
    termName: "Fall 2026",
    academicYearId: "year-1",
    academicYearLabel: "2026–2027",
  };
  it("explains the historical Ndao component no-op without technical fields", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "payment_plan",
        status: "approved",
        academicYearLabel: "2026–2027",
        beforeJson: { components: [{ kind: "tuition", amountXof: 0 }] },
        afterJson: {
          mode: "add_component",
          componentKey: "tuition",
          catalogSnapshot: {
            componentId: "85ec918d-technical-id",
            label: "Tuition",
            annualAmountXof: 2_975_000,
          },
        },
        events: [
          {
            action: "approved",
            data: { result: { alreadySelected: true } },
          },
        ],
      },
      {
        subject: "Abdoullah Ndao · F202325AN · Annual fees",
        componentLabel: "Tuition",
      },
    );

    expect(presentation.summary).toBe(
      "No change applied — Tuition was already included.",
    );
    expect(presentation.changes).toEqual([
      expect.objectContaining({
        label: "Tuition",
        type: "unchanged",
        previous: "Included",
        proposed: "Included",
      }),
    ]);
    expect(JSON.stringify(presentation)).not.toContain("componentId");
    expect(JSON.stringify(presentation)).not.toContain("85ec918d-technical-id");
  });

  it("shows the Ndao-shaped gross, scholarship and net billing bridge", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "billing_profile",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          id: "profile-id",
          grossChargesXof: 3_605_000,
          netBilledXof: 2_105_000,
          selections: [
            {
              kind: "cafeteria",
              optionCode: "full",
              label: "Full meal plan",
              amountXof: 630_000,
              refundable: false,
            },
            {
              kind: "housing",
              optionCode: "none",
              label: "No housing",
              amountXof: 0,
              refundable: false,
            },
            {
              kind: "insurance",
              optionCode: "none",
              label: "No insurance",
              amountXof: 0,
              refundable: false,
            },
            {
              kind: "housing_caution",
              optionCode: "none",
              label: "No housing caution",
              amountXof: 0,
              refundable: true,
            },
          ],
          revision: 2,
          awards: [
            {
              label: "Old scholarship",
              invoiceAdjustmentId: "old-adjustment",
            },
            {
              label: "Full scholarship",
              invoiceAdjustmentId: "current-adjustment",
              requiresApproval: true,
            },
          ],
          invoiceAdjustments: [
            {
              id: "old-adjustment",
              label: "Old scholarship",
              effect: "discount",
              amountXof: 1,
              sourceReference: "billing-profile:profile-id:revision:1",
            },
            {
              id: "current-adjustment",
              label: "Partial scholarship",
              effect: "discount",
              amountXof: 1_500_000,
              basis: "tuition",
              calculation: "percentage",
              stacking: "exclusive",
              percentageBasisPoints: 5_042,
              reason: "Partial scholarship",
              sourceReference: "billing-profile:profile-id:revision:2",
            },
          ],
        },
        afterJson: {
          academicYearLabel: "2026–2027",
          housingOptionCode: "none",
          housingOptionLabel: "No housing",
          cafeteriaOptionCode: "full",
          cafeteriaOptionLabel: "Full meal plan",
          insuranceSelected: false,
          cautionSelected: false,
          awardDefinitionIds: ["award-id"],
          awardSummary: "Full scholarship",
          preparedGrossChargesXof: 3_605_000,
          preparedNetBilledXof: 630_000,
          preparedSelections: [
            {
              kind: "housing",
              optionCode: "none",
              label: "No housing",
              amountXof: 0,
              refundable: false,
            },
            {
              kind: "cafeteria",
              optionCode: "full",
              label: "Full meal plan",
              amountXof: 630_000,
              refundable: false,
            },
            {
              kind: "insurance",
              optionCode: "none",
              label: "No insurance",
              amountXof: 0,
              refundable: false,
            },
            {
              kind: "housing_caution",
              optionCode: "none",
              label: "No housing caution",
              amountXof: 0,
              refundable: true,
            },
          ],
          preparedAdjustments: [
            {
              label: "Full scholarship",
              source: "catalog_award",
              effect: "discount",
              amountXof: 2_975_000,
              basis: "tuition",
              calculation: "percentage",
              stacking: "exclusive",
              percentageBasisPoints: 10_000,
              reason: "Full scholarship",
              requiresApproval: true,
              isAward: true,
            },
          ],
          preparedPlanSha256: "secret-hash",
        },
      },
      { subject: "Abdoullah Ndao · F202325AN" },
    );

    expect(presentation.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Gross charges",
          proposed: expect.stringContaining("3 605 000"),
        }),
        expect.objectContaining({
          label: "Awards & adjustments",
          proposed: expect.stringContaining("Full scholarship"),
        }),
        expect.objectContaining({
          label: "Net bill",
          proposed: expect.stringContaining("630 000"),
        }),
      ]),
    );
    expect(JSON.stringify(presentation)).not.toContain("preparedPlanSha256");
    expect(JSON.stringify(presentation)).not.toContain("secret-hash");
  });

  it("presents a single fee-schedule row request with derived component amounts", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "global_fee_schedule",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          rows: [
            {
              id: "row-1",
              label: "Payment 1",
              dueOn: "2026-09-05T00:00:00.000Z",
              amountFullXof: 1_071_250,
              amountTuitionXof: 743_750,
              amountHousingXof: 170_000,
              amountCafeteriaXof: 157_500,
            },
          ],
        },
        afterJson: {
          rowId: "row-1",
          input: {
            label: "First payment",
            dueOn: "2026-09-12",
            amountFullXof: 1_100_000,
          },
        },
      },
      { subject: "2026–2027 fee schedule" },
    );

    expect(presentation.summary).toContain("First payment");
    expect(presentation.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Due date",
          previous: "2026-09-05",
          proposed: "2026-09-12",
        }),
        expect.objectContaining({
          label: "Full package",
          previous: expect.stringContaining("1 071 250"),
          proposed: expect.stringContaining("1 100 000"),
        }),
        expect.objectContaining({ label: "Housing" }),
        expect.objectContaining({ label: "Cafeteria" }),
      ]),
    );
    expect(JSON.stringify(presentation)).not.toContain("row-1");
    expect(JSON.stringify(presentation)).not.toContain("amountFullXof");
  });

  it("shows batch schedule changes even when totals and installment counts stay equal", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "global_fee_schedule",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          rows: [
            {
              id: "row-1",
              sequence: 1,
              label: "Payment 1",
              dueOn: "2026-09-05",
              amountFullXof: 750_000,
              amountTuitionXof: 500_000,
              amountHousingXof: 250_000,
              amountCafeteriaXof: 0,
            },
            {
              id: "row-2",
              sequence: 2,
              label: "Payment 2",
              dueOn: "2027-01-05",
              amountFullXof: 750_000,
              amountTuitionXof: 500_000,
              amountHousingXof: 250_000,
              amountCafeteriaXof: 0,
            },
          ],
          components: [
            {
              id: "component-tuition",
              key: "tuition",
              label: "Tuition",
              description: "Annual tuition",
              annualAmountXof: 1_000_000,
              costCenterCode: "9100",
              defaultSelected: true,
              sortOrder: 0,
            },
            {
              id: "component-housing",
              key: "housing",
              label: "Housing",
              description: "Annual housing",
              annualAmountXof: 500_000,
              costCenterCode: "3700",
              defaultSelected: true,
              sortOrder: 1,
            },
            {
              id: "component-cafeteria",
              key: "cafeteria",
              label: "Cafeteria",
              description: "Annual cafeteria",
              annualAmountXof: 100_000,
              costCenterCode: "3600",
              defaultSelected: false,
              sortOrder: 2,
            },
          ],
        },
        afterJson: {
          rows: [
            {
              id: "row-1",
              sequence: 1,
              label: "Registration payment",
              dueOn: "2026-09-12",
            },
            {
              id: "row-2",
              sequence: 2,
              label: "Payment 2",
              dueOn: "2027-01-05",
            },
          ],
          components: [
            {
              key: "tuition",
              label: "Tuition",
              annualAmountXof: 1_100_000,
              costCenterCode: "9100",
            },
            {
              key: "housing",
              label: "Housing",
              annualAmountXof: 400_000,
              costCenterCode: "3700",
            },
            {
              key: "cafeteria",
              label: "Cafeteria",
              annualAmountXof: 100_000,
              costCenterCode: "3600",
            },
          ],
        },
      },
      { subject: "2026–2027 fee schedule" },
    );

    expect(presentation.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Installment 1",
          previous: expect.stringContaining("Payment 1"),
          proposed: expect.stringContaining("Registration payment"),
        }),
        expect.objectContaining({
          label: "Tuition",
          previous: expect.stringContaining("1 000 000"),
          proposed: expect.stringContaining("1 100 000"),
        }),
        expect.objectContaining({
          label: "Housing",
          previous: expect.stringContaining("500 000"),
          proposed: expect.stringContaining("400 000"),
        }),
      ]),
    );
    expect(presentation.changes).not.toContainEqual(
      expect.objectContaining({ label: "Annual standard package" }),
    );
    expect(
      presentation.changes.find((change) => change.label === "Tuition")
        ?.proposed,
    ).toContain("Annual tuition");
    expect(
      presentation.changes.find((change) => change.label === "Tuition")
        ?.proposed,
    ).toContain("Display order 0");
    expect(presentation.changes).not.toContainEqual(
      expect.objectContaining({ label: "Cafeteria" }),
    );
    expect(JSON.stringify(presentation)).not.toContain("row-1");
  });

  it("merges a date/label-only batch over the current fee amounts", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "global_fee_schedule",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          rows: [
            {
              id: "row-1",
              sequence: 1,
              label: "Payment 1",
              dueOn: "2026-09-05",
              amountFullXof: 750_000,
              amountTuitionXof: 500_000,
              amountHousingXof: 200_000,
              amountCafeteriaXof: 50_000,
            },
            {
              id: "row-2",
              sequence: 2,
              label: "Payment 2",
              dueOn: "2027-01-05",
              amountFullXof: 750_000,
              amountTuitionXof: 500_000,
              amountHousingXof: 200_000,
              amountCafeteriaXof: 50_000,
            },
          ],
          components: [
            {
              id: "tuition",
              key: "tuition",
              label: "Tuition",
              description: "Annual tuition",
              annualAmountXof: 1_000_000,
              costCenterCode: "9100",
              defaultSelected: true,
              sortOrder: 0,
            },
            {
              id: "housing",
              key: "housing",
              label: "Housing",
              description: "Annual housing",
              annualAmountXof: 400_000,
              costCenterCode: "3700",
              defaultSelected: true,
              sortOrder: 1,
            },
            {
              id: "cafeteria",
              key: "cafeteria",
              label: "Cafeteria",
              description: "Annual cafeteria",
              annualAmountXof: 100_000,
              costCenterCode: "3600",
              defaultSelected: true,
              sortOrder: 2,
            },
          ],
        },
        afterJson: {
          rows: [
            {
              id: "row-1",
              label: "Registration payment",
              dueOn: "2026-09-12",
            },
            {
              id: "row-2",
              label: "Payment 2",
              dueOn: "2027-01-05",
            },
          ],
        },
      },
      { subject: "2026–2027 fee schedule" },
    );

    expect(presentation.canApprove).toBe(true);
    expect(presentation.changes).toEqual([
      expect.objectContaining({
        label: "Installment 1",
        proposed: expect.stringContaining("Registration payment"),
      }),
    ]);
    expect(presentation.changes[0]?.proposed).toContain("750 000 XOF");
  });

  it("presents changed billing-catalog award values instead of only counts", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "billing_catalog",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          serviceOptions: [],
          adjustmentDefinitions: [
            {
              key: "full_scholarship",
              label: "Full scholarship",
              basis: "tuition",
              calculation: "percentage",
              stacking: "additive",
              effect: "discount",
              percentageBasisPoints: 5_000,
              requiresApproval: false,
              active: true,
              sortOrder: 0,
            },
          ],
        },
        afterJson: {
          academicYearLabel: "2026–2027",
          serviceOptions: [],
          adjustmentDefinitions: [
            {
              key: "full_scholarship",
              label: "Full scholarship",
              basis: "tuition",
              calculation: "percentage",
              stacking: "additive",
              effect: "discount",
              percentageBasisPoints: 10_000,
              requiresApproval: false,
              active: true,
              sortOrder: 0,
            },
          ],
        },
      },
      { subject: "2026–2027 billing catalog" },
    );

    expect(presentation.changes).toEqual([
      expect.objectContaining({
        label: "Full scholarship",
        type: "update",
        previous: expect.stringContaining("50% of Tuition"),
        proposed: expect.stringContaining("100% of Tuition"),
      }),
    ]);
    expect(JSON.stringify(presentation)).not.toContain("percentageBasisPoints");
  });

  it("merges a partial payment-plan update by id and shows component reallocations", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "payment_plan",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          totalAmount: 1_000,
          plan: {
            installments: [
              {
                id: "first",
                sequence: 1,
                label: "First",
                dueDate: "2026-09-01",
                amountDue: 500,
                components: [
                  { invoiceComponentId: "tuition", amountDue: 400 },
                  { invoiceComponentId: "housing", amountDue: 100 },
                ],
              },
              {
                id: "second",
                sequence: 2,
                label: "Second",
                dueDate: "2027-01-01",
                amountDue: 500,
                components: [
                  { invoiceComponentId: "tuition", amountDue: 400 },
                  { invoiceComponentId: "housing", amountDue: 100 },
                ],
              },
            ],
          },
        },
        afterJson: {
          mode: "update",
          installments: [
            {
              id: "second",
              dueDate: "2027-01-01",
              amountDue: 500,
              label: "Final payment",
              components: [
                { invoiceComponentId: "tuition", amountXof: 350 },
                { invoiceComponentId: "housing", amountXof: 150 },
              ],
            },
          ],
        },
      },
      {
        subject: "Student annual fees",
        componentLabels: { tuition: "Tuition", housing: "Housing" },
      },
    );

    expect(presentation.canApprove).toBe(true);
    expect(presentation.changes).toHaveLength(1);
    expect(presentation.changes[0]).toEqual(
      expect.objectContaining({
        label: "Final payment",
        previous: expect.stringContaining("Tuition 400"),
        proposed: expect.stringContaining("Tuition 350"),
      }),
    );
    expect(JSON.stringify(presentation)).not.toContain("second");
  });

  it("derives create-mode payment amounts from percentages", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "payment_plan",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { totalAmount: 1_000, plan: null },
        afterJson: {
          mode: "create",
          installments: [
            { sequence: 1, dueDate: "2026-09-01", percent: 60 },
            { sequence: 2, dueDate: "2027-01-01", percent: 40 },
          ],
        },
      },
      { subject: "Student annual fees" },
    );

    expect(presentation.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Installments",
          proposed: expect.stringContaining("1 000"),
        }),
        expect.objectContaining({ proposed: expect.stringContaining("600") }),
        expect.objectContaining({ proposed: expect.stringContaining("400") }),
      ]),
    );
  });

  it.each([
    { sequence: 1, dueDate: "2026-09-01" },
    { sequence: 1, dueDate: "2026-09-01", percent: "50" },
    { sequence: 1, dueDate: "2026-09-01", amount: "500" },
    { sequence: 1, dueDate: "2026-09-01", amount: 500, percent: 50 },
  ])("blocks a create plan with an invalid amount/percent shape", (row) => {
    const presentation = buildApprovalPresentation(
      {
        kind: "payment_plan",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { totalAmount: 1_000, plan: null },
        afterJson: { mode: "create", installments: [row] },
      },
      { subject: "Student annual fees" },
    );
    expect(presentation.canApprove).toBe(false);
  });

  it("blocks a replacement installment missing its required amount", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "payment_plan",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { totalAmount: 1_000, plan: null },
        afterJson: {
          mode: "replace",
          installments: [
            { sequence: 1, dueDate: "2026-09-01", label: "First" },
          ],
        },
      },
      { subject: "Student annual fees" },
    );
    expect(presentation.canApprove).toBe(false);
  });

  it.each([
    ["label", "Premium room", "Label Premium room"],
    ["description", "A newly described room", "newly described"],
    ["costCenterCode", "9999", "Cost center 9999"],
    ["refundable", true, "Refundable Yes"],
    ["defaultSelected", true, "Default selection Yes"],
    ["active", false, "Inactive"],
    ["sortOrder", 99, "Display order 99"],
  ] as const)(
    "shows an isolated billing service %s change",
    (field, value, expected) => {
      const service = {
        kind: "housing",
        code: "double",
        label: "Double room",
        description: "Shared room",
        calculation: "fixed",
        amountXof: 680_000,
        percentageBasisPoints: null,
        basisServiceKind: null,
        costCenterCode: "3700",
        refundable: false,
        defaultSelected: false,
        active: true,
        sortOrder: 10,
      };
      const presentation = buildApprovalPresentation(
        {
          kind: "billing_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: { serviceOptions: [service], adjustmentDefinitions: [] },
          afterJson: {
            serviceOptions: [{ ...service, [field]: value }],
            adjustmentDefinitions: [],
          },
        },
        { subject: "Billing catalog" },
      );

      expect(presentation.canApprove).toBe(true);
      expect(presentation.changes).toHaveLength(1);
      expect(presentation.changes[0]?.proposed).toContain(expected);
    },
  );

  it.each(["unknown", "percentage"])(
    "blocks an invalid billing service calculation %s",
    (calculation) => {
      const presentation = buildApprovalPresentation(
        {
          kind: "billing_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
          afterJson: {
            serviceOptions: [
              {
                kind: "housing",
                code: "double",
                label: "Double room",
                calculation,
                amountXof: 680_000,
                costCenterCode: "3700",
                refundable: false,
                defaultSelected: false,
                active: true,
                sortOrder: 1,
              },
            ],
            adjustmentDefinitions: [],
          },
        },
        { subject: "Billing catalog" },
      );
      expect(presentation.canApprove).toBe(false);
    },
  );

  it("blocks a percentage service missing its required percentage", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "billing_catalog",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
        afterJson: {
          serviceOptions: [
            {
              kind: "housing_caution",
              code: "caution",
              label: "Housing caution",
              calculation: "percentage_of_service",
              basisServiceKind: "housing",
              costCenterCode: "3700",
              refundable: true,
              defaultSelected: false,
              active: true,
              sortOrder: 1,
            },
          ],
          adjustmentDefinitions: [],
        },
      },
      { subject: "Billing catalog" },
    );
    expect(presentation.canApprove).toBe(false);
  });

  it.each([
    "kind",
    "calculation",
    "amountXof",
    "refundable",
    "defaultSelected",
    "sortOrder",
  ] as const)("blocks a billing service missing required %s", (field) => {
    const service: Record<string, unknown> = {
      kind: "housing",
      code: "double",
      label: "Double room",
      description: "Shared room",
      calculation: "fixed",
      amountXof: 680_000,
      percentageBasisPoints: null,
      basisServiceKind: null,
      costCenterCode: "3700",
      refundable: false,
      defaultSelected: false,
      active: true,
      sortOrder: 10,
    };
    delete service[field];
    const presentation = buildApprovalPresentation(
      {
        kind: "billing_catalog",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
        afterJson: {
          serviceOptions: [service],
          adjustmentDefinitions: [],
        },
      },
      { subject: "Billing catalog" },
    );
    expect(presentation.canApprove).toBe(false);
  });

  it.each([
    "effect",
    "basis",
    "calculation",
    "stacking",
    "requiresApproval",
    "sortOrder",
  ] as const)("blocks a billing adjustment missing required %s", (field) => {
    const adjustment: Record<string, unknown> = {
      key: "full_scholarship",
      label: "Full scholarship",
      description: "Scholarship",
      basis: "tuition",
      calculation: "percentage",
      stacking: "additive",
      effect: "discount",
      percentageBasisPoints: 10_000,
      fixedAmountXof: null,
      requiresApproval: false,
      active: true,
      sortOrder: 1,
    };
    delete adjustment[field];
    const presentation = buildApprovalPresentation(
      {
        kind: "billing_catalog",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
        afterJson: {
          serviceOptions: [],
          adjustmentDefinitions: [adjustment],
        },
      },
      { subject: "Billing catalog" },
    );
    expect(presentation.canApprove).toBe(false);
  });

  it.each([
    ["label", "Complete scholarship", "Label Complete scholarship"],
    ["description", "Covers all tuition", "Covers all tuition"],
    ["stacking", "exclusive", "Stacking Exclusive"],
    ["requiresApproval", true, "approval required Yes"],
    ["active", false, "Inactive"],
    ["sortOrder", 7, "Display order 7"],
  ] as const)(
    "shows an isolated billing adjustment %s change",
    (field, value, expected) => {
      const adjustment = {
        key: "full_scholarship",
        label: "Full scholarship",
        description: "Scholarship",
        basis: "tuition",
        calculation: "percentage",
        stacking: "additive",
        effect: "discount",
        percentageBasisPoints: 10_000,
        fixedAmountXof: null,
        requiresApproval: false,
        active: true,
        sortOrder: 1,
      };
      const presentation = buildApprovalPresentation(
        {
          kind: "billing_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: {
            serviceOptions: [],
            adjustmentDefinitions: [adjustment],
          },
          afterJson: {
            serviceOptions: [],
            adjustmentDefinitions: [{ ...adjustment, [field]: value }],
          },
        },
        { subject: "Billing catalog" },
      );

      expect(presentation.canApprove).toBe(true);
      expect(presentation.changes).toHaveLength(1);
      expect(presentation.changes[0]?.proposed).toContain(expected);
    },
  );

  it.each(["percentage_of_service", "unknown"])(
    "blocks an invalid billing adjustment calculation %s",
    (calculation) => {
      const presentation = buildApprovalPresentation(
        {
          kind: "billing_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
          afterJson: {
            serviceOptions: [],
            adjustmentDefinitions: [
              {
                key: "manual_reconciliation",
                label: "Manual reconciliation",
                basis: "manual",
                calculation,
                stacking: "additive",
                effect: "discount",
                requiresApproval: true,
                active: true,
                sortOrder: 0,
              },
            ],
          },
        },
        { subject: "Billing catalog" },
      );
      expect(presentation.canApprove).toBe(false);
    },
  );

  it("blocks fixed and percentage adjustments missing their required amount", () => {
    for (const adjustment of [
      {
        key: "fixed_award",
        label: "Fixed award",
        basis: "tuition",
        calculation: "fixed",
        stacking: "additive",
        effect: "discount",
        requiresApproval: true,
        active: true,
        sortOrder: 0,
      },
      {
        key: "percent_award",
        label: "Percent award",
        basis: "tuition",
        calculation: "percentage",
        stacking: "additive",
        effect: "discount",
        requiresApproval: true,
        active: true,
        sortOrder: 0,
      },
    ]) {
      const presentation = buildApprovalPresentation(
        {
          kind: "billing_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: { serviceOptions: [], adjustmentDefinitions: [] },
          afterJson: {
            serviceOptions: [],
            adjustmentDefinitions: [adjustment],
          },
        },
        { subject: "Billing catalog" },
      );
      expect(presentation.canApprove).toBe(false);
    }
  });

  it.each(["position", "yearIndex"] as const)(
    "blocks an academic curriculum entry missing required %s",
    (field) => {
      const curriculum: Record<string, unknown> = {
        courseCode: "MTH 101",
        yearIndex: 1,
        semester: "Fall",
        position: 0,
      };
      delete curriculum[field];
      const presentation = buildApprovalPresentation(
        {
          kind: "academic_catalog",
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson: {},
          afterJson: {
            yearLabel: "2026–2027",
            startsOn: null,
            endsOn: null,
            activateYear: true,
            defaultLevels: [{ code: "L1", name: "Level 1", creditCeiling: 60 }],
            defaultStandingRules: [
              {
                code: "good",
                label: "Good standing",
                minimumGpa: 2,
                tone: "success",
                order: 1,
              },
            ],
            notYetGradedStanding: {
              label: "Not yet graded",
              tone: "neutral",
            },
            programs: [
              {
                programCode: "BSE",
                programName: "Engineering",
                progressionMode: "default",
                customLevels: [],
                requirements: [{ category: "Core", requiredCredits: 3 }],
                curriculum: [curriculum],
                standingMode: "default",
                customStandingRules: [],
              },
            ],
          },
        },
        { subject: "Academic catalog" },
      );
      expect(presentation.canApprove).toBe(false);
    },
  );

  it("shows an operating-budget reallocation even when totals are unchanged", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "operating_budget",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          id: "approved",
          openingBalanceXof: 0,
          lines: [
            { categoryKey: "utilities", monthIndex: 0, amountXof: 100 },
            { categoryKey: "utilities", monthIndex: 1, amountXof: 200 },
          ],
        },
        afterJson: {
          draft: {
            openingBalanceXof: 0,
            lines: [
              { categoryKey: "utilities", monthIndex: 0, amountXof: 150 },
              { categoryKey: "utilities", monthIndex: 1, amountXof: 150 },
            ],
          },
        },
      },
      { subject: "Operating budget" },
    );

    expect(presentation.changes.map((row) => row.label)).toEqual([
      "Utilities — August 2026",
      "Utilities — September 2026",
    ]);
  });

  it("presents a management adjustment as approved actual before and proposed total", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "management_actual",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: null,
        afterJson: {
          mode: "adjustment",
          academicYear: "2026–2027",
          kind: "expense",
          categoryKey: "utilities",
          categoryLabel: "Utilities",
          costCenterCode: "9100",
          month: "2026-09",
          occurredOn: "2026-09-30",
          amountXof: 20_000,
          baseActualXof: 100_000,
          targetActualXof: 120_000,
          description: "September reconciliation",
        },
      },
      { subject: "Utilities · 2026–2027" },
    );

    expect(presentation.canApprove).toBe(true);
    expect(presentation.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Amount",
          previous: expect.stringContaining("100 000"),
          proposed: expect.stringContaining("120 000"),
        }),
        expect.objectContaining({
          label: "Adjustment amount",
          proposed: expect.stringContaining("20 000"),
        }),
      ]),
    );
  });

  it("shows every supplied enrollment failure fact", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "student_enrollment_override",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {},
        afterJson: {
          requestedWaivers: ["prerequisite", "capacity"],
          failures: [
            {
              gate: "prerequisite",
              courses: [{ code: "MTH 101", minGrade: "C" }],
            },
            { gate: "capacity", taken: 30, capacity: 30 },
            {
              gate: "credit_cap",
              currentCredits: 27,
              afterAdd: 33,
              ceiling: 30,
            },
          ],
        },
      },
      { subject: "Student · Course" },
    );

    const shown = JSON.stringify(presentation);
    expect(shown).toContain("MTH 101");
    expect(shown).toContain("30 enrolled of 30 seats");
    expect(shown).toContain("27 current, 33 after enrollment, 30 allowed");
  });

  it("blocks an enrollment approval whose required capacity facts are missing", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "student_enrollment_override",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {},
        afterJson: {
          requestedWaivers: ["capacity"],
          failures: [{ gate: "capacity" }],
        },
      },
      { subject: "Student · Course" },
    );
    expect(presentation.canApprove).toBe(false);
    expect(presentation.changes).toEqual([]);
  });

  it("explains that paid charge removal creates account credit", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "charge_removal",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {
          number: "INV-100",
          description: "Lab fee",
          status: "partial",
          totalAmount: 100_000,
          amountPaid: 40_000,
          academicYearLabel: "2026–2027",
          costCenterCode: "9100",
        },
        afterJson: { invoiceId: "invoice-1" },
      },
      { subject: "Student · Lab fee", invoiceLabel: "Lab fee" },
    );
    expect(presentation.canApprove).toBe(true);
    expect(presentation.changes[0]?.detail).toContain(
      "40 000 XOF already paid becomes an account credit",
    );
  });

  it("does not confuse ordinary wording containing 'not set' with missing data", () => {
    const presentation = buildApprovalPresentation(
      {
        kind: "custom_charge",
        status: "pending",
        academicYearLabel: "2026–2027",
        beforeJson: {},
        afterJson: {
          description: "Equipment not set up",
          amountXof: 25_000,
          costCenterCode: "9100",
          studentIds: ["student-1"],
          dueDate: "2026-09-03",
          billingContext: reviewedBillingContext,
        },
      },
      {
        subject: "Student Name · F2026001",
        studentNames: ["Student Name · F2026001"],
      },
    );
    expect(presentation.canApprove).toBe(true);
  });

  it.each([
    [
      "academic_catalog",
      {},
      {
        yearLabel: "2026–2027",
        startsOn: null,
        endsOn: null,
        activateYear: true,
        defaultLevels: [{ code: "L1", name: "Level 1", creditCeiling: 60 }],
        defaultStandingRules: [
          {
            code: "good",
            label: "Good standing",
            minimumGpa: 2,
            tone: "success",
            order: 1,
          },
        ],
        notYetGradedStanding: { label: "Not yet graded", tone: "neutral" },
        programs: [],
      },
    ],
    [
      "global_fee_schedule",
      {},
      {
        rows: [
          {
            id: "row",
            label: "First payment",
            dueOn: "2026-09-05",
            amountFullXof: 10_000,
            amountTuitionXof: 10_000,
            amountHousingXof: 0,
            amountCafeteriaXof: 0,
          },
        ],
      },
    ],
    [
      "custom_charge",
      {},
      {
        description: "Lab fee",
        amountXof: 10_000,
        studentIds: ["student"],
        dueDate: "2026-09-03",
        billingContext: reviewedBillingContext,
      },
    ],
    [
      "charge_removal",
      {
        number: "INV-100",
        description: "Lab fee",
        academicYearLabel: "2026–2027",
        status: "open",
        totalAmount: 10_000,
        amountPaid: 0,
        costCenterCode: "9100",
      },
      { invoiceId: "invoice" },
    ],
    ["payment_plan", {}, { mode: "restore_standard" }],
    [
      "discount",
      {},
      {
        label: "Reviewed discount",
        amountXof: 10_000,
        billingContext: reviewedBillingContext,
      },
    ],
    [
      "scholarship",
      {},
      {
        label: "Merit award",
        amountXof: 10_000,
        billingContext: reviewedBillingContext,
      },
    ],
    [
      "billing_profile",
      {},
      {
        housingOptionCode: "none",
        cafeteriaOptionCode: "full",
        preparedGrossChargesXof: 3_605_000,
        preparedNetBilledXof: 630_000,
        preparedSelections: [
          {
            kind: "housing",
            optionCode: "none",
            label: "No housing",
            amountXof: 0,
            refundable: false,
          },
          {
            kind: "cafeteria",
            optionCode: "full",
            label: "Full",
            amountXof: 630_000,
            refundable: false,
          },
          {
            kind: "insurance",
            optionCode: "none",
            label: "None",
            amountXof: 0,
            refundable: false,
          },
          {
            kind: "housing_caution",
            optionCode: "none",
            label: "None",
            amountXof: 0,
            refundable: true,
          },
        ],
        preparedAdjustments: [],
      },
    ],
    [
      "billing_catalog",
      {},
      {
        serviceOptions: [],
        adjustmentDefinitions: [
          {
            key: "manual_reconciliation",
            label: "Manual reconciliation",
            basis: "full_package",
            calculation: "manual",
            stacking: "additive",
            effect: "discount",
            requiresApproval: true,
            active: true,
            sortOrder: 0,
          },
        ],
      },
    ],
    ["operating_budget", {}, { draft: { openingBalanceXof: 0, lines: [] } }],
    [
      "management_actual",
      {},
      {
        mode: "create_expense",
        academicYear: "2026–2027",
        categoryLabel: "Utilities",
        costCenterCode: "9100",
        amountXof: 20_000,
        occurredOn: "2026-09-03",
        description: "September electricity",
        payee: "Electric company",
        isEstimate: false,
      },
    ],
    [
      "student_enrollment_override",
      {},
      {
        requestedWaivers: ["capacity"],
        failures: [{ gate: "capacity", taken: 30, capacity: 30 }],
      },
    ],
  ] as const)(
    "builds a human presentation for %s",
    (kind, beforeJson, afterJson) => {
      const presentation = buildApprovalPresentation(
        {
          kind,
          status: "pending",
          academicYearLabel: "2026–2027",
          beforeJson,
          afterJson,
        },
        { subject: "Human subject" },
      );

      expect(presentation.subject).toBe("Human subject");
      expect(presentation.summary.length).toBeGreaterThan(0);
      expect(presentation.changes.length).toBeGreaterThan(0);
      expect(presentation.canApprove).toBe(true);
    },
  );
});
