import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { TrustedPaymentBalanceRow } from "./payment-balance-import.extraction.js";
import { workbookCutoverReviewSignature } from "./workbook-cutover.manifest.js";
import {
  APPLICANT_DECISION_HEADERS,
  PRODUCTION_STUDENT_DECISION_HEADERS,
  WORKBOOK_DECISION_HEADERS,
  deriveWorkbookCutoverFinancialSnapshot,
  readWorkbookCutoverReviewWorkbook,
} from "./workbook-cutover.review-import.js";

const REVIEWER = {
  reason: "Reviewed against the official workbook and identity evidence.",
  reviewer: "finance-reviewer@daust.org",
  reviewDate: "2026-09-01",
};
const CONTEXT = {
  reviewWorkbookSha256: "a".repeat(64),
  sourceWorkbookSha256: "b".repeat(64),
  extractionSha256: "c".repeat(64),
  productionSnapshotSha256: "d".repeat(64),
};

function source(
  overrides: Partial<TrustedPaymentBalanceRow> = {},
): TrustedPaymentBalanceRow {
  return {
    sourceSheet: "Comparison",
    sourceRowNumber: 68,
    sourceStudentName: "Reviewed Student",
    normalizedStudentName: "reviewed student",
    category: "O",
    fullTuitionAndBoardXof: 4_295_000,
    amountBilledXof: 1_185_000,
    installmentDueXof: [296_250, 296_250, 296_250, 296_250],
    installmentPaidXof: [0, 0, 0, 0],
    amountPaidXof: 0,
    note: "3FPT (72.4%)",
    cafeteria: true,
    housing: true,
    caution: false,
    insurance: true,
    scholarshipOnTuition: 0,
    reconciles: "Yes",
    ...overrides,
  };
}

describe("workbook cutover signed review import", () => {
  it("derives a cross-component 3FPT award and exact non-negative component snapshots", () => {
    const financial = deriveWorkbookCutoverFinancialSnapshot(
      source(),
      REVIEWER,
      CONTEXT,
    );
    const threeFpt = financial.adjustments.find(
      (adjustment) => adjustment.definitionKey === "three_fpt",
    );
    expect(threeFpt).toMatchObject({
      targetComponentKey: null,
      calculation: "percentage",
      basis: "gross_package",
      percentageBps: 7_240,
      amountXof: 3_109_580,
    });
    expect(
      financial.components.every((component) => component.netAmountXof >= 0),
    ).toBe(true);
    expect(
      financial.components.reduce(
        (sum, component) => sum + component.netAmountXof,
        0,
      ),
    ).toBe(1_185_000);
    expect(
      financial.adjustments.reduce(
        (sum, adjustment) =>
          sum +
          (adjustment.direction === "reduction"
            ? -adjustment.amountXof
            : adjustment.amountXof),
        0,
      ),
    ).toBe(
      1_185_000 -
        financial.components.reduce(
          (sum, component) => sum + component.grossAmountXof,
          0,
        ),
    );
  });

  it("retains the reviewed row-159 paid-over-detail variance as account credit", () => {
    const financial = deriveWorkbookCutoverFinancialSnapshot(
      source({
        sourceRowNumber: 159,
        amountBilledXof: 1_000_000,
        installmentDueXof: [250_000, 250_000, 250_000, 250_000],
        installmentPaidXof: [250_000, 250_000, 250_000, 250_000],
        amountPaidXof: 1_001_433,
        note: null,
        cafeteria: false,
        housing: false,
        insurance: false,
      }),
      REVIEWER,
      CONTEXT,
    );
    expect(financial.accountCreditXof).toBe(1_433);
    expect(
      financial.installments.reduce(
        (sum, installment) => sum + installment.paidDetailXof,
        0,
      ),
    ).toBe(1_000_000);
  });

  it("preserves the row-306 caution without silently adding housing", () => {
    const financial = deriveWorkbookCutoverFinancialSnapshot(
      source({
        sourceRowNumber: 306,
        amountBilledXof: 3_683_000,
        installmentDueXof: [920_750, 920_750, 920_750, 920_750],
        note: "(billed corrected +68,000)",
        housing: false,
        caution: true,
      }),
      REVIEWER,
      CONTEXT,
    );
    expect(financial.services.housing).toMatchObject({
      option: "none",
      annualAmountXof: 0,
    });
    expect(financial.services.caution).toMatchObject({
      selected: true,
      basisHousingOption: "double",
      amountXof: 68_000,
      refundable: true,
    });
    expect(
      financial.components.find(
        (component) => component.key === "housing_caution",
      ),
    ).toMatchObject({ optionCode: "double", grossAmountXof: 68_000 });
  });

  it("derives a positive workbook reconciliation as an untargeted manual charge", () => {
    const financial = deriveWorkbookCutoverFinancialSnapshot(
      source({
        sourceRowNumber: 210,
        amountBilledXof: 4_400_000,
        installmentDueXof: [1_100_000, 1_100_000, 1_100_000, 1_100_000],
        note: "(billed corrected +105,000)",
      }),
      REVIEWER,
      CONTEXT,
    );
    expect(
      financial.adjustments.find(
        (adjustment) =>
          adjustment.definitionKey === "reviewed_manual_adjustment",
      ),
    ).toMatchObject({
      targetComponentKey: null,
      direction: "charge",
      calculation: "manual",
      amountXof: 105_000,
    });
  });

  it("snapshots social help as an approved manual tuition-basis award", () => {
    const financial = deriveWorkbookCutoverFinancialSnapshot(
      source({
        sourceRowNumber: 250,
        amountBilledXof: 3_402_500,
        installmentDueXof: [850_625, 850_625, 850_625, 850_625],
        note: "Family Discount (10%); Social help (manual %)",
        scholarshipOnTuition: 0.3,
      }),
      REVIEWER,
      CONTEXT,
    );
    expect(
      financial.adjustments.find(
        (adjustment) => adjustment.definitionKey === "social_help",
      ),
    ).toMatchObject({
      calculation: "manual",
      basis: "tuition",
      basisAmountXof: 2_975_000,
      amountXof: 595_000,
      stacking: "additive",
      approvalRequired: true,
    });
  });

  it("binds review signatures to the decision and every frozen source digest", () => {
    const base = {
      scope: "workbook_identity",
      sourceKey: "workbook:Comparison!20",
      payload: { decision: "create_new" },
      reviewedBy: "finance-reviewer@daust.org",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reason: REVIEWER.reason,
      context: CONTEXT,
    };
    const first = workbookCutoverReviewSignature(base);
    expect(workbookCutoverReviewSignature(base)).toBe(first);
    expect(
      workbookCutoverReviewSignature({
        ...base,
        context: { ...CONTEXT, productionSnapshotSha256: "e".repeat(64) },
      }),
    ).not.toBe(first);
  });

  it("fails closed when a decision-table header drifts", async () => {
    const workbook = new ExcelJS.Workbook();
    addSupportingSheets(workbook);
    addHeaders(workbook, "Workbook Decisions", [
      ...WORKBOOK_DECISION_HEADERS.slice(0, 1),
      "Changed Excel Row",
      ...WORKBOOK_DECISION_HEADERS.slice(2),
    ]);
    addHeaders(
      workbook,
      "Production Students",
      PRODUCTION_STUDENT_DECISION_HEADERS,
    );
    addHeaders(workbook, "Pending Applications", APPLICANT_DECISION_HEADERS);
    const prefixed = await prefixSpreadsheetMl(
      Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    );
    await expect(readWorkbookCutoverReviewWorkbook(prefixed)).rejects.toThrow(
      "headers do not match",
    );
  });

  it("rejects formulas in signed decision cells instead of evaluating them", async () => {
    const workbook = new ExcelJS.Workbook();
    addSupportingSheets(workbook);
    const sheet = addHeaders(
      workbook,
      "Workbook Decisions",
      WORKBOOK_DECISION_HEADERS,
    );
    addHeaders(
      workbook,
      "Production Students",
      PRODUCTION_STUDENT_DECISION_HEADERS,
    );
    addHeaders(workbook, "Pending Applications", APPLICANT_DECISION_HEADERS);
    sheet.getCell(6, 1).value = "Comparison!20";
    sheet.getCell(6, 2).value = 20;
    sheet.getCell(6, 3).value = "O";
    sheet.getCell(6, 4).value = "Reviewed Student";
    for (let column = 5; column <= 10; column += 1) {
      sheet.getCell(6, column).value = 0;
    }
    sheet.getCell(6, 11).value = "No";
    sheet.getCell(6, 12).value = "None";
    sheet.getCell(6, 13).value = "No";
    sheet.getCell(6, 14).value = "No";
    sheet.getCell(6, 18).value = {
      formula: '="Create new"',
      result: "Create new",
    };
    await expect(
      readWorkbookCutoverReviewWorkbook(
        Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
      ),
    ).rejects.toThrow("must be a literal review/source value");
  });
});

function addHeaders(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: readonly string[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  return sheet;
}

function addSupportingSheets(workbook: ExcelJS.Workbook): void {
  for (const name of [
    "Summary & Controls",
    "Master List",
    "Source Crosswalk",
    "Decision Lists",
  ]) {
    workbook.addWorksheet(name);
  }
}

async function prefixSpreadsheetMl(bytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.endsWith(".xml")) continue;
    const xml = await entry.async("string");
    if (
      !xml.includes(
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
      )
    ) {
      continue;
    }
    zip.file(
      entry.name,
      xml
        .replace(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(/<(\/?)((?!x:)[A-Za-z][A-Za-z0-9._-]*)(?=[\s>])/g, "<$1x:$2"),
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
