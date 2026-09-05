import { describe, expect, it } from "vitest";
import { StudentBillingManifestSchema } from "./student-billing-import.manifest.js";
import {
  planStudentBillingImport,
  splitIntoInstallments,
  type StudentSnapshot,
} from "./student-billing-import.planner.js";
import {
  PricingError,
  REFERENCE_PACKAGE_XOF,
  resolveSelection,
  resolveStudentPackage,
} from "./student-billing-import.pricing.js";
import { TARGET_CATALOG } from "./student-billing-import.catalog.js";
import {
  SEED_SCHOLARSHIPS,
  resolveAwards,
  validateScholarships,
} from "./scholarship-catalog.js";

const award = (key: string, rate?: { pctBps?: number; flatXof?: number }) =>
  resolveAwards([{ key, ...rate }], SEED_SCHOLARSHIPS);

const baseInput = {
  housingTier: "double" as const,
  cafeteria: true,
  insurance: true,
  caution: false,
  awards: [],
};

function manifestRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 1,
    sheetName: "Abdou Aziz Bèye",
    identity: { status: "authoritative", studentNo: "F202601AAB" },
    housing: { tier: "double" },
    cafeteria: true,
    insurance: true,
    caution: false,
    awards: [],
    totalBilledXof: REFERENCE_PACKAGE_XOF,
    ...overrides,
  };
}

function manifest(rows: Record<string, unknown>[]) {
  return StudentBillingManifestSchema.parse({
    version: 1,
    academicYearLabel: "2026–2027",
    sourceWorkbookSha256: "a".repeat(64),
    preparedBy: "bursar@daust.edu.sn",
    preparedOn: "2026-08-29",
    declaredRowCount: rows.length,
    declaredBilledTotalXof: rows.reduce(
      (sum, row) => sum + (row.totalBilledXof as number),
      0,
    ),
    rows,
  });
}

function snapshot(overrides: Partial<StudentSnapshot> = {}): StudentSnapshot {
  return {
    studentId: "student-1",
    studentNo: "F202601AAB",
    recordStatus: "active",
    invoice: {
      id: "invoice-1",
      totalAmount: 4_285_000,
      amountPaid: 0,
      revision: 3,
      installments: [1, 2, 3, 4].map((sequence) => ({
        sequence,
        amountDue: 1_071_250,
        amountPaid: 0,
      })),
    },
    ...overrides,
  };
}

describe("fee catalog", () => {
  it("keeps every added key clear of the reserved list and the key regex", () => {
    for (const component of TARGET_CATALOG) {
      expect(["application_fee", "insurance"]).not.toContain(component.key);
      expect(component.key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      expect(component.annualAmountXof).toBeGreaterThan(0);
    }
  });

  it("adds nothing to anyone by default", () => {
    const added = TARGET_CATALOG.filter(
      (c) => !["tuition", "housing", "cafeteria"].includes(c.key),
    );
    expect(added.length).toBeGreaterThan(0);
    for (const component of added)
      expect(component.defaultSelected).toBe(false);
  });

  it("prices each deposit at a tenth of its housing tier", () => {
    const amount = (key: string) =>
      TARGET_CATALOG.find((c) => c.key === key)!.annualAmountXof;
    for (const [housing, deposit] of [
      ["housing", "housing_deposit"],
      ["housing_double_ac", "housing_deposit_double_ac"],
      ["housing_individual", "housing_deposit_individual"],
      ["housing_individual_ac", "housing_deposit_individual_ac"],
    ]) {
      expect(amount(deposit)).toBe(amount(housing) / 10);
    }
  });
});

describe("billing workbook pricing", () => {
  it("prices the reference package at the double-housing tier", () => {
    expect(resolveStudentPackage(baseInput).expectedTotalXof).toBe(
      REFERENCE_PACKAGE_XOF,
    );
  });

  it("selects one housing key per tier, never two", () => {
    const { selectedKeys } = resolveSelection({
      ...baseInput,
      housingTier: "individual_ac",
      caution: true,
    });
    expect(selectedKeys).toEqual([
      "tuition",
      "housing_individual_ac",
      "cafeteria",
      "student_insurance",
      "housing_deposit_individual_ac",
    ]);
  });

  it("stacks percentage awards additively, not multiplicatively", () => {
    const result = resolveStudentPackage({
      ...baseInput,
      awards: resolveAwards(
        [{ key: "merit_assez_bien" }, { key: "somone_resident" }],
        SEED_SCHOLARSHIPS,
      ),
    });
    expect(result.adjustmentXof).toBe(595_000);
    expect(result.adjustmentXof).not.toBe(565_250);
  });

  it("computes the caution deposit from the actual housing tier", () => {
    const result = resolveStudentPackage({
      ...baseInput,
      housingTier: "individual_ac",
      caution: true,
    });
    expect(result.expectedTotalXof).toBe(5_375_000);
    expect(result.catalogTotalXof).toBe(5_375_000);
  });

  it("folds a negotiated housing rate into the residual, not the catalog", () => {
    const result = resolveStudentPackage({
      ...baseInput,
      housingTier: "individual_ac",
      housingAnnualOverrideXof: 1_000_000,
      caution: true,
      awards: award("merit_assez_bien"),
    });
    expect(result.expectedTotalXof).toBe(4_417_500);
    expect(result.catalogTotalXof).toBe(5_375_000);
  });

  it("applies a 3FPT subsidy against the full package, not tuition", () => {
    const result = resolveStudentPackage({
      ...baseInput,
      awards: award("fpt_subsidy", { pctBps: 7_240 }),
    });
    expect(result.expectedTotalXof).toBe(
      Math.round(REFERENCE_PACKAGE_XOF * 0.276),
    );
  });

  it("lets a full scholarship stand without zeroing a live component", () => {
    const result = resolveStudentPackage({
      ...baseInput,
      awards: award("full_scholarship"),
    });
    expect(result.expectedTotalXof).toBe(1_320_000);
    expect(result.selectedKeys).toContain("tuition");
    expect(result.catalogTotalXof).toBe(REFERENCE_PACKAGE_XOF);
  });

  it("refuses adjustments that exceed the package", () => {
    expect(() =>
      resolveStudentPackage({
        ...baseInput,
        housingTier: "none",
        cafeteria: false,
        insurance: false,
        awards: [
          ...award("full_scholarship"),
          ...award("fpt_subsidy", { flatXof: 1 }),
        ],
      }),
    ).toThrow(PricingError);
  });

  it("refuses a deposit with no housing tier", () => {
    expect(() =>
      resolveSelection({ ...baseInput, housingTier: "none", caution: true }),
    ).toThrow(PricingError);
  });
});

describe("installment split", () => {
  it("gives the remainder to the earliest sequences", () => {
    expect(splitIntoInstallments(3_848_750, 4)).toEqual([
      962_188, 962_188, 962_187, 962_187,
    ]);
    expect(splitIntoInstallments(4_295_000, 4)).toEqual([
      1_073_750, 1_073_750, 1_073_750, 1_073_750,
    ]);
  });

  it("never loses a franc", () => {
    for (const total of [4_295_000, 3_848_750, 1_497_500, 1]) {
      const parts = splitIntoInstallments(total, 4);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("billing import planner", () => {
  it("plans a reprice when the workbook reconciles to its own rules", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          awards: [
            {
              key: "merit_bien",
              reason: "Merit award per the workbook nomenclature",
            },
          ],
          totalBilledXof: 3_848_750,
        }),
      ]),
      [snapshot()],
    );
    expect(plan.blockers).toHaveLength(0);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      kind: "reprice",
      workbookTotalXof: 3_848_750,
    });
  });

  it("blocks a row whose stated total the rules cannot reproduce", () => {
    const plan = planStudentBillingImport(
      manifest([manifestRow({ totalBilledXof: 3_768_000 })]),
      [snapshot()],
    );
    expect(plan.blockers.map((b) => b.code)).toContain(
      "recomputation_mismatch",
    );
    expect(plan.actions).toHaveLength(0);
  });

  it("accepts an underivable total only with a recorded reason, and warns", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          totalBilledXof: 3_768_000,
          manualTotalReason: "Hand-rounded 3FPT figure confirmed by the bursar",
        }),
      ]),
      [snapshot()],
    );
    expect(plan.blockers).toHaveLength(0);
    expect(plan.warnings).toHaveLength(1);
  });

  it("refuses to re-price the package below cash already collected", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          housing: { tier: "none" },
          cafeteria: false,
          insurance: false,
          totalBilledXof: 2_975_000,
        }),
      ]),
      [
        snapshot({
          invoice: { ...snapshot().invoice!, amountPaid: 3_000_000 },
        }),
      ],
    );
    expect(plan.blockers.map((b) => b.code)).toContain(
      "total_below_amount_paid",
    );
  });

  it("carries the discount as a residual credit instead of shrinking a component", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          awards: [
            {
              key: "full_scholarship",
              reason: "Full tuition scholarship recorded in the workbook",
            },
          ],
          totalBilledXof: 1_320_000,
        }),
      ]),
      [snapshot()],
    );
    expect(plan.blockers).toHaveLength(0);
    const action = plan.actions[0] as any;
    expect(action.catalogTotalXof).toBe(4_295_000);
    expect(action.residualXof).toBe(1_320_000 - 4_295_000);
    expect(action.selectedKeys).toContain("tuition");
  });

  it("refuses to shrink an installment below what it has already taken", () => {
    const paidFirst = snapshot();
    paidFirst.invoice!.amountPaid = 1_071_250;
    paidFirst.invoice!.installments = paidFirst.invoice!.installments.map(
      (i) => (i.sequence === 1 ? { ...i, amountPaid: 1_071_250 } : i),
    );
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          totalBilledXof: 2_985_000,
          cafeteria: false,
          housing: { tier: "none" },
        }),
      ]),
      [paidFirst],
    );
    expect(plan.blockers.map((b) => b.code)).toContain(
      "installment_below_amount_paid",
    );
  });

  it("blocks a live student the workbook never mentions", () => {
    const plan = planStudentBillingImport(manifest([manifestRow()]), [
      snapshot(),
      snapshot({ studentId: "s2", studentNo: "F202602ZZZ" }),
    ]);
    const orphan = plan.blockers.find(
      (b) => b.code === "student_without_manifest_row",
    );
    expect(orphan?.subject).toBe("F202602ZZZ");
  });

  it("refuses to create a student number that already exists", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          identity: {
            status: "create",
            studentNo: "F202601AAB",
            reason: "New admit not present in the SIS roster export",
          },
        }),
      ]),
      [snapshot()],
    );
    expect(plan.blockers.map((b) => b.code)).toContain(
      "student_already_exists",
    );
  });

  it("blocks an unresolved identity rather than guessing", () => {
    const plan = planStudentBillingImport(
      manifest([manifestRow({ identity: { status: "missing" } })]),
      [snapshot()],
    );
    expect(plan.blockers[0]?.code).toBe("identity_missing");
  });
});

describe("billing manifest schema", () => {
  it("rejects a declared total that disagrees with the rows", () => {
    expect(() =>
      StudentBillingManifestSchema.parse({
        version: 1,
        academicYearLabel: "2026–2027",
        sourceWorkbookSha256: "a".repeat(64),
        preparedBy: "bursar@daust.edu.sn",
        preparedOn: "2026-08-29",
        declaredRowCount: 1,
        declaredBilledTotalXof: 1,
        rows: [manifestRow()],
      }),
    ).toThrow(/does not match the row sum/);
  });

  it("rejects the same student appearing on two rows", () => {
    expect(() =>
      manifest([manifestRow(), manifestRow({ rowNumber: 2 })]),
    ).toThrow(/appears on more than one row/);
  });

  it("rejects an award carrying both a percentage and a flat amount", () => {
    expect(() =>
      manifest([
        manifestRow({
          awards: [
            {
              key: "merit_bien",
              pctBps: 1_500,
              flatXof: 1,
              reason: "both at once is ambiguous",
            },
          ],
        }),
      ]),
    ).toThrow();
  });
});

describe("scholarship catalog", () => {
  it("validates the seed catalog", () => {
    expect(validateScholarships(SEED_SCHOLARSHIPS)).toHaveLength(
      SEED_SCHOLARSHIPS.length,
    );
  });

  it("takes a fixed award's rate from the catalog, not the award", () => {
    const [resolved] = resolveAwards(
      [{ key: "merit_bien" }],
      SEED_SCHOLARSHIPS,
    );
    expect(resolved).toMatchObject({
      basis: "tuition",
      pctBps: 1_500,
      flatXof: 0,
    });
  });

  it("refuses a per-student rate on a fixed award", () => {
    expect(() =>
      resolveAwards([{ key: "merit_bien", pctBps: 9_000 }], SEED_SCHOLARSHIPS),
    ).toThrow(/has a catalog rate/);
  });

  it("requires a rate on a per-student award", () => {
    expect(() =>
      resolveAwards([{ key: "fpt_subsidy" }], SEED_SCHOLARSHIPS),
    ).toThrow(/needs exactly one of pctBps or flatXof/);
  });

  it("refuses an unknown or retired award", () => {
    expect(() =>
      resolveAwards([{ key: "nonexistent" }], SEED_SCHOLARSHIPS),
    ).toThrow(/Unknown scholarship/);
    const retired = SEED_SCHOLARSHIPS.map((s) =>
      s.key === "merit_bien" ? { ...s, active: false } : s,
    );
    expect(() => resolveAwards([{ key: "merit_bien" }], retired)).toThrow(
      /no longer offered/,
    );
  });

  it("refuses the same award twice on one student", () => {
    expect(() =>
      resolveAwards(
        [{ key: "merit_bien" }, { key: "merit_bien" }],
        SEED_SCHOLARSHIPS,
      ),
    ).toThrow(/awarded twice/);
  });

  it("rejects a catalog entry whose rate mode and rate disagree", () => {
    expect(() =>
      validateScholarships([
        { ...SEED_SCHOLARSHIPS[0], rateMode: "per_student" },
      ]),
    ).toThrow(/belongs on the award/);
    expect(() =>
      validateScholarships([{ ...SEED_SCHOLARSHIPS[8], rateMode: "fixed" }]),
    ).toThrow(/exactly one of pctBps or flatXof/);
  });

  it("blocks a row naming a scholarship that is not in the catalog", () => {
    const plan = planStudentBillingImport(
      manifest([
        manifestRow({
          awards: [
            {
              key: "made_up_award",
              reason: "not present in the catalog at all",
            },
          ],
        }),
      ]),
      [snapshot()],
    );
    expect(plan.blockers.map((b) => b.code)).toContain("unknown_scholarship");
  });
});
