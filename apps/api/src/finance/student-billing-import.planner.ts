import {
  DEPOSIT_KEYS,
  HOUSING_KEYS,
  type HousingTier,
} from "./student-billing-import.catalog.js";
import type {
  StudentBillingManifest,
  StudentBillingManifestRow,
} from "./student-billing-import.manifest.js";
import {
  PricingError,
  resolveStudentPackage,
} from "./student-billing-import.pricing.js";
import {
  SEED_SCHOLARSHIPS,
  type ScholarshipDefinition,
  resolveAwards,
} from "./scholarship-catalog.js";

export type BillingBlockerCode =
  | "identity_missing"
  | "identity_ambiguous"
  | "student_not_found"
  | "student_archived"
  | "student_already_exists"
  | "no_live_invoice"
  | "recomputation_mismatch"
  | "pricing_rejected"
  | "unknown_scholarship"
  | "housing_selection_conflict"
  | "total_below_amount_paid"
  | "installment_below_amount_paid"
  | "component_has_collected_cash"
  | "residual_would_be_a_charge"
  | "student_without_manifest_row";

export interface BillingBlocker {
  code: BillingBlockerCode;
  rowNumber: number | null;
  subject: string;
  detail: string;
}

export interface InstallmentSnapshot {
  sequence: number;
  amountDue: number;
  amountPaid: number;
}

export interface InvoiceSnapshot {
  id: string;
  totalAmount: number;
  amountPaid: number;
  revision: number;
  installments: readonly InstallmentSnapshot[];
  /** Absent means the catalog defaults are in force, which is prod's current state. */
  selectedKeys?: readonly string[];
  /** Net cash booked against each component key, so a removal that would strand it blocks. */
  collectedByComponentKey?: Readonly<Record<string, number>>;
}

export interface StudentSnapshot {
  studentId: string;
  studentNo: string;
  recordStatus: "active" | "pending_payment" | "archived";
  invoice: InvoiceSnapshot | null;
}

const DEFAULT_SELECTION = ["tuition", "housing", "cafeteria"] as const;

export interface BillingRepriceAction {
  kind: "reprice";
  rowNumber: number;
  studentNo: string;
  studentId: string;
  invoiceId: string;
  baseRevision: number;
  currentTotalXof: number;
  /** What the invoice becomes: the sum of the selected catalog components. */
  catalogTotalXof: number;
  /** What the workbook says the student owes in total. */
  workbookTotalXof: number;
  selectedKeys: readonly string[];
  keysToAdd: readonly string[];
  keysToRemove: readonly string[];
  /** workbook − catalog. Negative becomes a credit, positive a custom charge. */
  residualXof: number;
  installmentsXof: readonly number[];
}

export interface BillingCreateAction {
  kind: "create_student";
  rowNumber: number;
  studentNo: string;
  sheetName: string;
  reason: string;
  catalogTotalXof: number;
  workbookTotalXof: number;
  selectedKeys: readonly string[];
  residualXof: number;
}

export type BillingAction = BillingRepriceAction | BillingCreateAction;

export interface BillingPlan {
  academicYearLabel: string;
  rowCount: number;
  actions: readonly BillingAction[];
  blockers: readonly BillingBlocker[];
  warnings: readonly string[];
  totals: {
    workbookBilledXof: number;
    currentBilledXof: number;
    newInvoiceBilledXof: number;
    creditsXof: number;
    chargesXof: number;
    repricedStudents: number;
    studentsToCreate: number;
    untouchedStudents: number;
  };
}

/** Four installments, remainder to the earliest sequences. Mirrors splitEvenlyXof. */
export function splitIntoInstallments(
  totalXof: number,
  count: number,
): number[] {
  if (count <= 0) throw new Error("Installment count must be positive");
  const base = Math.floor(totalXof / count);
  const remainder = totalXof - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

function priceRow(
  row: StudentBillingManifestRow,
  scholarships: readonly ScholarshipDefinition[],
):
  | { ok: true; value: ReturnType<typeof resolveStudentPackage> }
  | {
      ok: false;
      code: "pricing_rejected" | "unknown_scholarship";
      detail: string;
    } {
  let awards;
  try {
    awards = resolveAwards(row.awards, scholarships);
  } catch (error) {
    return {
      ok: false,
      code: "unknown_scholarship",
      detail: (error as Error).message,
    };
  }
  try {
    return {
      ok: true,
      value: resolveStudentPackage({
        housingTier: row.housing.tier as HousingTier,
        housingAnnualOverrideXof: row.housing.annualOverrideXof,
        cafeteria: row.cafeteria,
        insurance: row.insurance,
        caution: row.caution,
        awards,
      }),
    };
  } catch (error) {
    if (error instanceof PricingError) {
      return { ok: false, code: "pricing_rejected", detail: error.message };
    }
    throw error;
  }
}

/** Nothing in validateFeeComponents forbids two housing tiers at once, so this does. */
function housingConflict(selectedKeys: readonly string[]): string | null {
  const housing = selectedKeys.filter((key) => HOUSING_KEYS.includes(key));
  const deposits = selectedKeys.filter((key) => DEPOSIT_KEYS.includes(key));
  if (housing.length > 1)
    return `Selects ${housing.length} housing tiers: ${housing.join(", ")}`;
  if (deposits.length > 1) return `Selects ${deposits.length} housing deposits`;
  if (deposits.length === 1 && housing.length === 0) {
    return "Selects a housing deposit without a housing tier";
  }
  return null;
}

function installmentBlockers(
  row: StudentBillingManifestRow,
  invoice: InvoiceSnapshot,
  installmentsXof: readonly number[],
): BillingBlocker[] {
  const blockers: BillingBlocker[] = [];
  for (const existing of invoice.installments) {
    const proposed = installmentsXof[existing.sequence - 1];
    if (proposed === undefined || proposed >= existing.amountPaid) continue;
    blockers.push({
      code: "installment_below_amount_paid",
      rowNumber: row.rowNumber,
      subject: row.sheetName,
      detail: `Installment ${existing.sequence} would fall to ${proposed} XOF, below the ${existing.amountPaid} XOF already collected`,
    });
  }
  return blockers;
}

function planRow(
  row: StudentBillingManifestRow,
  byStudentNo: ReadonlyMap<string, StudentSnapshot>,
  scholarships: readonly ScholarshipDefinition[],
): { action: BillingAction | null; blockers: BillingBlocker[] } {
  const blockers: BillingBlocker[] = [];
  const add = (code: BillingBlockerCode, detail: string) => {
    blockers.push({
      code,
      rowNumber: row.rowNumber,
      subject: row.sheetName,
      detail,
    });
  };
  const halt = (code: BillingBlockerCode, detail: string) => {
    add(code, detail);
    return { action: null, blockers };
  };

  if (row.identity.status === "missing") {
    return halt(
      "identity_missing",
      "No student identity was recorded for this row",
    );
  }
  if (row.identity.status === "ambiguous") {
    return halt(
      "identity_ambiguous",
      `Unresolved between ${row.identity.candidateStudentNos.join(", ")}`,
    );
  }

  const priced = priceRow(row, scholarships);
  if (!priced.ok) return halt(priced.code, priced.detail);
  const { selectedKeys, catalogTotalXof, expectedTotalXof } = priced.value;

  const conflict = housingConflict(selectedKeys);
  if (conflict) add("housing_selection_conflict", conflict);
  if (
    expectedTotalXof !== row.totalBilledXof &&
    row.manualTotalReason === undefined
  ) {
    add(
      "recomputation_mismatch",
      `Rules give ${expectedTotalXof} XOF; the workbook states ${row.totalBilledXof} XOF. Supply manualTotalReason to accept the workbook figure.`,
    );
  }
  const residualXof = row.totalBilledXof - catalogTotalXof;

  if (row.identity.status === "create") {
    if (byStudentNo.has(row.identity.studentNo)) {
      return halt(
        "student_already_exists",
        `${row.identity.studentNo} is already in the SIS and must not be created`,
      );
    }
    if (blockers.length > 0) return { action: null, blockers };
    return {
      action: {
        kind: "create_student",
        rowNumber: row.rowNumber,
        studentNo: row.identity.studentNo,
        sheetName: row.sheetName,
        reason: row.identity.reason,
        catalogTotalXof,
        workbookTotalXof: row.totalBilledXof,
        selectedKeys,
        residualXof,
      },
      blockers,
    };
  }

  const student = byStudentNo.get(row.identity.studentNo);
  if (!student) {
    return halt(
      "student_not_found",
      `${row.identity.studentNo} is not in the SIS`,
    );
  }
  if (student.recordStatus === "archived") {
    return halt("student_archived", `${student.studentNo} is archived`);
  }
  if (!student.invoice) {
    return halt(
      "no_live_invoice",
      `${student.studentNo} has no live annual package`,
    );
  }
  if (catalogTotalXof < student.invoice.amountPaid) {
    add(
      "total_below_amount_paid",
      `The package would fall to ${catalogTotalXof} XOF, below the ${student.invoice.amountPaid} XOF already collected`,
    );
  }

  if (residualXof > 0) {
    add(
      "residual_would_be_a_charge",
      `The workbook bills ${residualXof} XOF above the catalog for this selection; this tool only writes credits`,
    );
  }

  const current = new Set(student.invoice.selectedKeys ?? DEFAULT_SELECTION);
  const wanted = new Set(selectedKeys);
  const collected = student.invoice.collectedByComponentKey ?? {};
  for (const key of [...current].filter(
    (componentKey) => !wanted.has(componentKey),
  )) {
    const cash = collected[key] ?? 0;
    if (cash > 0) {
      add(
        "component_has_collected_cash",
        `Removing ${key} would strand ${cash} XOF already collected against it; Finance must resolve or refund that allocation first`,
      );
    }
  }

  const installmentsXof = splitIntoInstallments(
    catalogTotalXof,
    student.invoice.installments.length || 4,
  );
  blockers.push(...installmentBlockers(row, student.invoice, installmentsXof));
  if (blockers.length > 0) return { action: null, blockers };
  return {
    action: {
      kind: "reprice",
      rowNumber: row.rowNumber,
      studentNo: student.studentNo,
      studentId: student.studentId,
      invoiceId: student.invoice.id,
      baseRevision: student.invoice.revision,
      currentTotalXof: student.invoice.totalAmount,
      catalogTotalXof,
      workbookTotalXof: row.totalBilledXof,
      selectedKeys,
      keysToAdd: selectedKeys.filter((key) => !current.has(key)),
      keysToRemove: [...current].filter((key) => !wanted.has(key)),
      residualXof,
      installmentsXof,
    },
    blockers,
  };
}

export function planStudentBillingImport(
  manifest: StudentBillingManifest,
  students: readonly StudentSnapshot[],
  scholarships: readonly ScholarshipDefinition[] = SEED_SCHOLARSHIPS,
): BillingPlan {
  const byStudentNo = new Map(
    students.map((student) => [student.studentNo, student]),
  );
  const actions: BillingAction[] = [];
  const blockers: BillingBlocker[] = [];

  for (const row of manifest.rows) {
    const outcome = planRow(row, byStudentNo, scholarships);
    blockers.push(...outcome.blockers);
    if (outcome.action) actions.push(outcome.action);
  }

  const claimed = new Set(
    manifest.rows
      .map((row) => row.identity)
      .filter(
        (
          identity,
        ): identity is Extract<typeof identity, { studentNo: string }> =>
          identity.status === "authoritative" || identity.status === "create",
      )
      .map((identity) => identity.studentNo),
  );
  const untouched = students.filter(
    (student) => student.invoice !== null && !claimed.has(student.studentNo),
  );
  for (const student of untouched) {
    blockers.push({
      code: "student_without_manifest_row",
      rowNumber: null,
      subject: student.studentNo,
      detail: `Holds a live ${student.invoice?.totalAmount ?? 0} XOF package but appears nowhere in the workbook`,
    });
  }

  const repriced = actions.filter(
    (action): action is BillingRepriceAction => action.kind === "reprice",
  );
  return {
    academicYearLabel: manifest.academicYearLabel,
    rowCount: manifest.rows.length,
    actions,
    blockers,
    warnings: manifest.rows
      .filter((row) => row.manualTotalReason !== undefined)
      .map(
        (row) =>
          `Row ${row.rowNumber} (${row.sheetName}) accepts an underivable total of ${row.totalBilledXof} XOF: ${row.manualTotalReason}`,
      ),
    totals: {
      workbookBilledXof: manifest.rows.reduce(
        (sum, row) => sum + row.totalBilledXof,
        0,
      ),
      currentBilledXof: repriced.reduce(
        (sum, action) => sum + action.currentTotalXof,
        0,
      ),
      newInvoiceBilledXof: repriced.reduce(
        (sum, action) => sum + action.catalogTotalXof,
        0,
      ),
      creditsXof: actions.reduce(
        (sum, action) =>
          sum + (action.residualXof < 0 ? -action.residualXof : 0),
        0,
      ),
      chargesXof: actions.reduce(
        (sum, action) =>
          sum + (action.residualXof > 0 ? action.residualXof : 0),
        0,
      ),
      repricedStudents: repriced.length,
      studentsToCreate: actions.length - repriced.length,
      untouchedStudents: untouched.length,
    },
  };
}
