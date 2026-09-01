import { createHash } from "node:crypto";
import { z } from "zod";
import {
  TrustedPaymentBalanceExtractionSchema,
  parseTrustedPaymentBalanceExtraction,
  paymentBalanceExtractionRowDigest,
  type TrustedPaymentBalanceExtraction,
} from "./payment-balance-import.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WorkbookCutoverAcademicFingerprintSchema,
  WorkbookCutoverSha256Schema,
  canonicalWorkbookCutoverJson,
  workbookCutoverApplicantKey,
  workbookCutoverAcademicFingerprintDigest,
  workbookCutoverProductionStudentKey,
  workbookCutoverWorkbookRowKey,
  type WorkbookCutoverManifest,
  type WorkbookCutoverHousingOption,
} from "./workbook-cutover.manifest.js";

export const WorkbookCutoverTrustedExtractionSchema =
  TrustedPaymentBalanceExtractionSchema;

export type WorkbookCutoverTrustedExtraction = TrustedPaymentBalanceExtraction;

const IdSchema = z.string().trim().min(1).max(240);

const ProductionStudentSnapshotSchema = z
  .object({
    sourceKey: z.string().trim().min(3).max(240),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    studentId: IdSchema,
    personId: IdSchema,
    studentNo: z.string().trim().min(2).max(64),
    firstName: z.string().trim().min(1).max(160),
    lastName: z.string().trim().min(1).max(160),
    loginEmail: z.string().trim().email().max(320).nullable(),
    recordStatus: z.enum(["active", "pending_payment", "archived"]),
    personStatus: z.enum(["active", "suspended", "inactive"]),
    roles: z.array(z.string().trim().min(1).max(80)).max(50),
    academicFingerprint: WorkbookCutoverAcademicFingerprintSchema,
    academicFingerprintSha256: WorkbookCutoverSha256Schema,
  })
  .strict();

const ApplicantSnapshotSchema = z
  .object({
    sourceKey: z.string().trim().min(3).max(240),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    applicantId: IdSchema,
    firstName: z.string().trim().min(1).max(160),
    lastName: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(320),
    stage: z.string().trim().min(1).max(80),
  })
  .strict();

export const WorkbookCutoverProductionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime({ offset: true }),
    academicYearLabel: z.string().trim().min(4).max(64),
    sourceAsOfDate: z.literal(WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate),
    controls: z
      .object({
        productionStudents: z.number().int().nonnegative().max(50_000),
        productionActiveStudents: z.number().int().nonnegative().max(50_000),
        productionPendingPaymentStudents: z
          .number()
          .int()
          .nonnegative()
          .max(50_000),
        productionArchivedStudents: z.number().int().nonnegative().max(50_000),
        currentApplicants: z.number().int().nonnegative().max(50_000),
      })
      .strict(),
    students: z.array(ProductionStudentSnapshotSchema).max(50_000),
    applicants: z.array(ApplicantSnapshotSchema).max(50_000),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const sourceKeys = new Set<string>();
    const studentIds = new Set<string>();
    const personIds = new Set<string>();
    const studentNos = new Set<string>();
    let active = 0;
    let pending = 0;
    let archived = 0;
    for (const [index, student] of snapshot.students.entries()) {
      const expectedKey = workbookCutoverProductionStudentKey(
        student.studentId,
      );
      if (student.sourceKey !== expectedKey) {
        ctx.addIssue({
          code: "custom",
          path: ["students", index, "sourceKey"],
          message: `Student source key must be ${expectedKey}`,
        });
      }
      const canonicalNo = student.studentNo
        .normalize("NFKC")
        .trim()
        .toUpperCase();
      if (student.studentNo !== canonicalNo) {
        ctx.addIssue({
          code: "custom",
          path: ["students", index, "studentNo"],
          message:
            "Production student numbers must be canonical uppercase values",
        });
      }
      for (const [set, value, label] of [
        [sourceKeys, student.sourceKey, "source key"],
        [studentIds, student.studentId, "Student ID"],
        [personIds, student.personId, "Person ID"],
        [studentNos, canonicalNo, "student number"],
      ] as const) {
        if (set.has(value)) {
          ctx.addIssue({
            code: "custom",
            path: ["students", index],
            message: `Production ${label} ${value} appears more than once`,
          });
        }
        set.add(value);
      }
      if (student.recordStatus === "active") active += 1;
      if (student.recordStatus === "pending_payment") pending += 1;
      if (student.recordStatus === "archived") archived += 1;
      if (
        student.academicFingerprintSha256 !==
        workbookCutoverAcademicFingerprintDigest(student.academicFingerprint)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["students", index, "academicFingerprintSha256"],
          message:
            "Academic fingerprint SHA must be derived from the canonical academic controls",
        });
      }
    }
    if (
      snapshot.students.length !== snapshot.controls.productionStudents ||
      active !== snapshot.controls.productionActiveStudents ||
      pending !== snapshot.controls.productionPendingPaymentStudents ||
      archived !== snapshot.controls.productionArchivedStudents
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["controls"],
        message: `Production controls are ${snapshot.students.length} total, ${active} active, ${pending} payment-pending, and ${archived} archived`,
      });
    }
    const applicantKeys = new Set<string>();
    const applicantIds = new Set<string>();
    if (snapshot.applicants.length !== snapshot.controls.currentApplicants) {
      ctx.addIssue({
        code: "custom",
        path: ["controls", "currentApplicants"],
        message: `Snapshot has ${snapshot.applicants.length} Applicants, not declared ${snapshot.controls.currentApplicants}`,
      });
    }
    for (const [index, applicant] of snapshot.applicants.entries()) {
      const expectedKey = workbookCutoverApplicantKey(applicant.applicantId);
      if (applicant.sourceKey !== expectedKey) {
        ctx.addIssue({
          code: "custom",
          path: ["applicants", index, "sourceKey"],
          message: `Applicant source key must be ${expectedKey}`,
        });
      }
      if (
        applicantKeys.has(applicant.sourceKey) ||
        applicantIds.has(applicant.applicantId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["applicants", index],
          message: `Applicant ${applicant.applicantId} appears more than once`,
        });
      }
      applicantKeys.add(applicant.sourceKey);
      applicantIds.add(applicant.applicantId);
    }
  });

export type WorkbookCutoverProductionSnapshot = z.infer<
  typeof WorkbookCutoverProductionSnapshotSchema
>;
export type WorkbookCutoverProductionStudentSnapshot =
  WorkbookCutoverProductionSnapshot["students"][number];
export type WorkbookCutoverApplicantSnapshot =
  WorkbookCutoverProductionSnapshot["applicants"][number];

export function parseWorkbookCutoverTrustedExtraction(
  bytes: Buffer,
): WorkbookCutoverTrustedExtraction {
  return parseTrustedPaymentBalanceExtraction(bytes);
}

export function parseWorkbookCutoverProductionSnapshot(
  bytes: Buffer,
): WorkbookCutoverProductionSnapshot {
  return WorkbookCutoverProductionSnapshotSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function workbookCutoverProductionSnapshotDigest(
  snapshot: WorkbookCutoverProductionSnapshot,
): string {
  const normalized = {
    ...snapshot,
    students: [...snapshot.students].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
    applicants: [...snapshot.applicants].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
  };
  return createHash("sha256")
    .update(canonicalWorkbookCutoverJson(normalized))
    .digest("hex");
}

export class WorkbookCutoverExtractionMismatchError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      "Reviewed workbook cutover manifest does not match its source extracts",
    );
    this.name = "WorkbookCutoverExtractionMismatchError";
  }
}

/** Housing tier encoded by the workbook's housing flag plus reviewed note text. */
export function deriveWorkbookCutoverHousingOption(source: {
  housing: boolean;
  note: string | null;
}): WorkbookCutoverHousingOption {
  if (!source.housing) return "none";
  const note = (source.note ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (note.includes("individual w/ ac housing")) return "individual_ac";
  if (note.includes("individual housing")) return "individual";
  if (note.includes("double w/ ac housing")) return "double_ac";
  return "double";
}

export function deriveWorkbookCutoverAdjustmentKeys(
  sourceNote: string | null,
): string[] {
  const note = (sourceNote ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const keys = new Set<string>();
  if (note.includes("mention assez bien")) keys.add("merit_10");
  if (note.includes("mention tres bien")) keys.add("merit_20");
  if (
    note.includes("mention bien") &&
    !note.includes("mention assez bien") &&
    !note.includes("mention tres bien")
  ) {
    keys.add("merit_15");
  }
  if (note.includes("family discount")) keys.add("family");
  if (note.includes("somone resident")) keys.add("somone_resident");
  if (note.includes("full scholarship")) keys.add("full_scholarship");
  if (/\bs10\b/.test(note)) keys.add("s10");
  if (note.includes("3fpt")) keys.add("three_fpt");
  if (note.includes("social help")) keys.add("social_help");
  if (note.includes("january enrollment")) keys.add("january_enrollment");
  const genericScholarship =
    note.includes("scholarship") &&
    !note.includes("full scholarship") &&
    !note.includes("mention ");
  if (
    genericScholarship ||
    note.includes("billed corrected") ||
    note.includes("paid 5 years") ||
    note.includes("500,000/sem") ||
    note.includes("no 2nd-semester housing") ||
    note.includes("internship / off-campus")
  ) {
    keys.add("reviewed_manual_adjustment");
  }
  return [...keys].sort(compareText);
}

/**
 * Returns stable issue codes instead of guessing through a source mismatch. The
 * planner uses these as confirmation blockers; the CLI may use the throwing
 * wrapper when source validation itself is the requested operation.
 */
export function workbookCutoverManifestExtractionIssues(
  manifest: WorkbookCutoverManifest,
  extraction: WorkbookCutoverTrustedExtraction,
): string[] {
  const issues: string[] = [];
  if (manifest.sourceWorkbook.fileName !== extraction.sourceFileName) {
    issues.push("source_file_name_mismatch");
  }
  if (manifest.sourceWorkbook.sha256 !== extraction.sourceWorkbookSha256) {
    issues.push("source_workbook_sha256_mismatch");
  }
  const controls = extraction.controlTotals;
  const expectedControls: Array<[number, number, string]> = [
    [controls.rowCount, WORKBOOK_CUTOVER_BASELINE.workbookRows, "row_count"],
    [
      controls.positivePaymentRows,
      WORKBOOK_CUTOVER_BASELINE.positivePaymentRows,
      "positive_payment_rows",
    ],
    [
      controls.zeroPaymentRows,
      WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows,
      "zero_payment_rows",
    ],
    [
      controls.amountBilledXof,
      WORKBOOK_CUTOVER_BASELINE.billedXof,
      "amount_billed",
    ],
    [controls.amountPaidXof, WORKBOOK_CUTOVER_BASELINE.paidXof, "amount_paid"],
    [
      controls.installmentPaidXof,
      WORKBOOK_CUTOVER_BASELINE.installmentPaidXof,
      "installment_paid",
    ],
  ];
  for (const [actual, expected, label] of expectedControls) {
    if (actual !== expected) {
      issues.push(`extraction_control_mismatch:${label}:${actual}:${expected}`);
    }
  }
  if (extraction.rows.length !== WORKBOOK_CUTOVER_BASELINE.workbookRows) {
    issues.push("extraction_row_count_mismatch");
  }
  const extractionByKey = new Map<string, (typeof extraction.rows)[number]>();
  for (const row of extraction.rows) {
    const key = workbookCutoverWorkbookRowKey(
      row.sourceSheet,
      row.sourceRowNumber,
    );
    if (extractionByKey.has(key)) {
      issues.push(`duplicate_extraction_coordinate:${key}`);
    }
    extractionByKey.set(key, row);
  }
  const manifestKeys = new Set<string>();
  for (const row of manifest.workbookRows) {
    manifestKeys.add(row.sourceKey);
    const source = extractionByKey.get(row.sourceKey);
    if (!source) {
      issues.push(`missing_extraction_row:${row.sourceKey}`);
      continue;
    }
    const financial = row.financial;
    const dueXof = financial.installments.map(
      (installment) => installment.dueXof,
    );
    const paidXof = financial.installments.map(
      (installment) => installment.paidDetailXof,
    );
    const expectedHousing = financial.services.housing.option !== "none";
    const derivedHousingOption = deriveWorkbookCutoverHousingOption(source);
    const expectedAdjustmentKeys = deriveWorkbookCutoverAdjustmentKeys(
      source.note,
    );
    const recordedAdjustmentKeys = new Set<string>(
      financial.adjustments.map((adjustment) => adjustment.definitionKey),
    );
    const expectedCafeteria = financial.services.cafeteria.plan === "full";
    if (
      row.sourceSheet !== source.sourceSheet ||
      row.sourceRowNumber !== source.sourceRowNumber ||
      row.sourceStudentClaim !== source.sourceStudentName ||
      row.sourceRecordSha256 !== paymentBalanceExtractionRowDigest(source) ||
      financial.sourceCategory !== source.category ||
      financial.amountBilledXof !== source.amountBilledXof ||
      financial.amountPaidXof !== source.amountPaidXof ||
      !equalNumbers(dueXof, source.installmentDueXof) ||
      !equalNumbers(paidXof, source.installmentPaidXof) ||
      expectedHousing !== source.housing ||
      financial.services.housing.option !== derivedHousingOption ||
      expectedCafeteria !== source.cafeteria ||
      financial.services.insurance.selected !== source.insurance ||
      financial.services.caution.selected !== source.caution ||
      financial.sourceScholarshipOnTuition !== source.scholarshipOnTuition ||
      financial.sourceNote !== source.note
    ) {
      issues.push(`extraction_row_mismatch:${row.sourceKey}`);
    }
    for (const expectedKey of expectedAdjustmentKeys) {
      if (!recordedAdjustmentKeys.has(expectedKey)) {
        issues.push(`missing_named_adjustment:${row.sourceKey}:${expectedKey}`);
      }
    }
  }
  for (const key of extractionByKey.keys()) {
    if (!manifestKeys.has(key)) {
      issues.push(`unclaimed_extraction_row:${key}`);
    }
  }
  return issues.slice(0, 2_000);
}

export function verifyWorkbookCutoverManifestExtraction(
  manifest: WorkbookCutoverManifest,
  extraction: WorkbookCutoverTrustedExtraction,
): void {
  const issues = workbookCutoverManifestExtractionIssues(manifest, extraction);
  if (issues.length > 0) {
    throw new WorkbookCutoverExtractionMismatchError(issues);
  }
}

export function workbookCutoverManifestProductionSnapshotIssues(
  manifest: WorkbookCutoverManifest,
  snapshot: WorkbookCutoverProductionSnapshot,
): string[] {
  const issues: string[] = [];
  if (manifest.academicYearLabel !== snapshot.academicYearLabel) {
    issues.push("production_academic_year_mismatch");
  }
  const students = new Map(
    snapshot.students.map((row) => [row.sourceKey, row]),
  );
  if (students.size !== snapshot.students.length) {
    issues.push("duplicate_production_student_source_key");
  }
  const reviewedStudentKeys = new Set<string>();
  for (const decision of manifest.productionStudents) {
    reviewedStudentKeys.add(decision.sourceKey);
    const source = students.get(decision.sourceKey);
    if (!source) {
      issues.push(`missing_production_student:${decision.sourceKey}`);
      continue;
    }
    if (
      decision.sourceRecordSha256 !== source.sourceRecordSha256 ||
      decision.studentId !== source.studentId ||
      decision.personId !== source.personId ||
      decision.studentNo !== source.studentNo ||
      decision.firstName !== source.firstName ||
      decision.lastName !== source.lastName ||
      decision.loginEmail !== source.loginEmail ||
      decision.recordStatus !== source.recordStatus ||
      decision.personStatus !== source.personStatus ||
      canonicalWorkbookCutoverJson([...decision.roles].sort(compareText)) !==
        canonicalWorkbookCutoverJson([...source.roles].sort(compareText)) ||
      decision.academicFingerprintSha256 !== source.academicFingerprintSha256 ||
      canonicalWorkbookCutoverJson(decision.academicFingerprint) !==
        canonicalWorkbookCutoverJson(source.academicFingerprint)
    ) {
      issues.push(`production_student_mismatch:${decision.sourceKey}`);
    }
  }
  for (const key of students.keys()) {
    if (!reviewedStudentKeys.has(key)) {
      issues.push(`unreviewed_production_student:${key}`);
    }
  }

  const applicants = new Map(
    snapshot.applicants.map((row) => [row.sourceKey, row]),
  );
  if (applicants.size !== snapshot.applicants.length) {
    issues.push("duplicate_applicant_source_key");
  }
  const reviewedApplicantKeys = new Set<string>();
  for (const decision of manifest.applicants) {
    reviewedApplicantKeys.add(decision.sourceKey);
    const source = applicants.get(decision.sourceKey);
    if (!source) {
      issues.push(`missing_applicant:${decision.sourceKey}`);
      continue;
    }
    if (
      decision.sourceRecordSha256 !== source.sourceRecordSha256 ||
      decision.applicantId !== source.applicantId ||
      decision.firstName !== source.firstName ||
      decision.lastName !== source.lastName ||
      decision.email !== source.email ||
      decision.stage !== source.stage
    ) {
      issues.push(`applicant_mismatch:${decision.sourceKey}`);
    }
  }
  for (const key of applicants.keys()) {
    if (!reviewedApplicantKeys.has(key)) {
      issues.push(`unreviewed_applicant:${key}`);
    }
  }
  return issues.slice(0, 2_000);
}

export function verifyWorkbookCutoverManifestProductionSnapshot(
  manifest: WorkbookCutoverManifest,
  snapshot: WorkbookCutoverProductionSnapshot,
): void {
  const issues = workbookCutoverManifestProductionSnapshotIssues(
    manifest,
    snapshot,
  );
  if (issues.length > 0) {
    throw new WorkbookCutoverExtractionMismatchError(issues);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function equalNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
