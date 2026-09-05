import { describe, expect, it } from "vitest";
import { SEED_SCHOLARSHIPS } from "./scholarship-catalog.js";
import {
  resolveStudentCredit,
  type AwardableInvoice,
} from "./scholarship-credit.js";

const TUITION_XOF = 2_975_000;
const HOUSING_XOF = 1_360_000;

function invoice(overrides: Partial<AwardableInvoice> = {}): AwardableInvoice {
  return {
    totalAmount: TUITION_XOF + HOUSING_XOF,
    components: [
      { kind: "tuition", amountXof: TUITION_XOF },
      { kind: "housing", amountXof: HOUSING_XOF },
    ],
    scholarships: SEED_SCHOLARSHIPS,
    ...overrides,
  };
}

describe("resolveStudentCredit", () => {
  it("prices a fixed award off the student's own tuition line", () => {
    const credit = resolveStudentCredit({ key: "merit_bien" }, invoice());
    expect(credit.basisXof).toBe(TUITION_XOF);
    expect(credit.amountXof).toBe(Math.round(TUITION_XOF * 0.15));
    expect(credit.label).toBe(
      SEED_SCHOLARSHIPS.find((row) => row.key === "merit_bien")!.label,
    );
  });

  it("prices a package-basis award off the whole bill", () => {
    const credit = resolveStudentCredit(
      { key: "fpt_subsidy", pctBps: 4_000 },
      invoice(),
    );
    expect(credit.basisXof).toBe(TUITION_XOF + HOUSING_XOF);
    expect(credit.amountXof).toBe(
      Math.round((TUITION_XOF + HOUSING_XOF) * 0.4),
    );
  });

  it("follows the student's housing tier rather than a reference package", () => {
    const cheaper = resolveStudentCredit(
      { key: "fpt_subsidy", pctBps: 4_000 },
      invoice({
        totalAmount: TUITION_XOF + 680_000,
        components: [
          { kind: "tuition", amountXof: TUITION_XOF },
          { kind: "housing", amountXof: 680_000 },
        ],
      }),
    );
    expect(cheaper.amountXof).toBe(Math.round((TUITION_XOF + 680_000) * 0.4));
  });

  it("takes a flat per-student award at face value", () => {
    const credit = resolveStudentCredit(
      { key: "social_help", flatXof: 300_000 },
      invoice(),
    );
    expect(credit.amountXof).toBe(300_000);
  });

  it("takes a fixed flat award from the catalog", () => {
    const credit = resolveStudentCredit(
      { key: "january_enrollment" },
      invoice(),
    );
    expect(credit.amountXof).toBe(250_000);
  });

  it("uses the award's own cost center, never the caller's", () => {
    const definition = SEED_SCHOLARSHIPS.find(
      (row) => row.key === "merit_bien",
    )!;
    expect(
      resolveStudentCredit({ key: "merit_bien" }, invoice()),
    ).toMatchObject({ costCenterCode: definition.costCenterCode });
  });

  it("rejects an unknown award", () => {
    expect(() =>
      resolveStudentCredit({ key: "not_a_thing" }, invoice()),
    ).toThrow(/Unknown scholarship/);
  });

  it("rejects an award that is no longer offered", () => {
    expect(() =>
      resolveStudentCredit(
        { key: "merit_bien" },
        invoice({
          scholarships: SEED_SCHOLARSHIPS.map((row) =>
            row.key === "merit_bien" ? { ...row, active: false } : row,
          ),
        }),
      ),
    ).toThrow(/no longer offered/);
  });

  it("rejects a rate supplied for a fixed award", () => {
    expect(() =>
      resolveStudentCredit({ key: "merit_bien", pctBps: 9_000 }, invoice()),
    ).toThrow(/catalog rate/);
  });

  it("rejects a per-student award with no rate", () => {
    expect(() =>
      resolveStudentCredit({ key: "social_help" }, invoice()),
    ).toThrow(/exactly one of pctBps or flatXof/);
  });

  it("rejects a per-student award with both rate kinds", () => {
    expect(() =>
      resolveStudentCredit(
        { key: "social_help", pctBps: 1_000, flatXof: 5_000 },
        invoice(),
      ),
    ).toThrow(/exactly one of pctBps or flatXof/);
  });

  it("rejects an award larger than the basis it applies to", () => {
    expect(() =>
      resolveStudentCredit(
        { key: "social_help", flatXof: TUITION_XOF + 1 },
        invoice(),
      ),
    ).toThrow(/exceeds the student's tuition/);
  });

  it("rejects a tuition award when the bill carries no tuition line", () => {
    expect(() =>
      resolveStudentCredit(
        { key: "merit_bien" },
        invoice({
          components: [{ kind: "housing", amountXof: HOUSING_XOF }],
        }),
      ),
    ).toThrow(/no tuition amount/);
  });

  it("allows a full tuition waiver but nothing beyond it", () => {
    const credit = resolveStudentCredit({ key: "full_scholarship" }, invoice());
    expect(credit.amountXof).toBe(TUITION_XOF);
  });
});
