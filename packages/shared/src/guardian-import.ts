export interface GuardianImportRow {
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  studentName: string;
}

export interface GuardianImportStudentCandidate {
  id: string;
  studentNo: string;
  name: string;
}

export interface PlannedGuardianImport {
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  rowNumbers: number[];
  students: GuardianImportStudentCandidate[];
}

export interface GuardianImportIssue {
  code:
    | "invalid_email"
    | "conflicting_guardian_name"
    | "conflicting_phone"
    | "conflicting_address"
    | "missing_student_name"
    | "student_not_found"
    | "ambiguous_student";
  severity: "blocker" | "warning";
  rowNumbers: number[];
  email: string;
  message: string;
  studentName?: string;
  candidateStudentNos?: string[];
}

export interface GuardianImportPlan {
  guardians: PlannedGuardianImport[];
  issues: GuardianImportIssue[];
  sourceRows: number;
  distinctEmails: number;
  plannedLinks: number;
  skippedGuardians: number;
}

export function normalizeGuardianImportName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeGuardianImportEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function displayValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function distinct(values: string[], normalizer = displayValue): string[] {
  const byNormalized = new Map<string, string>();
  for (const raw of values) {
    const value = displayValue(raw);
    if (!value) continue;
    const key = normalizer(value);
    if (!byNormalized.has(key)) byNormalized.set(key, value);
  }
  return [...byNormalized.values()];
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Build a deterministic, exact-name import plan. It deliberately avoids fuzzy
 * matching: an incorrect guardian relationship is an authorization defect, not
 * merely a data-quality problem.
 */
export function planGuardianImport(
  rows: GuardianImportRow[],
  studentCandidates: GuardianImportStudentCandidate[],
): GuardianImportPlan {
  const issues: GuardianImportIssue[] = [];
  const rowsByEmail = new Map<string, GuardianImportRow[]>();

  for (const row of rows) {
    const email = normalizeGuardianImportEmail(row.email);
    if (!validEmail(email)) {
      issues.push({
        code: "invalid_email",
        severity: "blocker",
        rowNumbers: [row.rowNumber],
        email,
        message: `Row ${row.rowNumber} has an invalid guardian email`,
      });
      continue;
    }
    rowsByEmail.set(email, [...(rowsByEmail.get(email) ?? []), row]);
  }

  const studentsByName = new Map<string, GuardianImportStudentCandidate[]>();
  for (const student of studentCandidates) {
    const key = normalizeGuardianImportName(student.name);
    studentsByName.set(key, [...(studentsByName.get(key) ?? []), student]);
  }

  const guardians: PlannedGuardianImport[] = [];
  let skippedGuardians = 0;
  for (const [email, groupRows] of [...rowsByEmail.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const names = distinct(
      groupRows.map((row) => row.name),
      normalizeGuardianImportName,
    );
    if (names.length !== 1) {
      issues.push({
        code: "conflicting_guardian_name",
        severity: "blocker",
        rowNumbers: groupRows.map((row) => row.rowNumber),
        email,
        message: `Rows for ${email} contain different guardian names`,
      });
      skippedGuardians += 1;
      continue;
    }

    const phones = distinct(groupRows.map((row) => row.phone));
    const addresses = distinct(groupRows.map((row) => row.address));
    if (phones.length > 1) {
      issues.push({
        code: "conflicting_phone",
        severity: "warning",
        rowNumbers: groupRows.map((row) => row.rowNumber),
        email,
        message: `Rows for ${email} contain different phone numbers; the first is used`,
      });
    }
    if (addresses.length > 1) {
      issues.push({
        code: "conflicting_address",
        severity: "warning",
        rowNumbers: groupRows.map((row) => row.rowNumber),
        email,
        message: `Rows for ${email} contain different addresses; the first is used`,
      });
    }

    const matchedStudents = new Map<string, GuardianImportStudentCandidate>();
    const nonBlankStudentRows = groupRows.filter((row) =>
      row.studentName.trim(),
    );
    if (nonBlankStudentRows.length === 0) {
      issues.push({
        code: "missing_student_name",
        severity: "blocker",
        rowNumbers: groupRows.map((row) => row.rowNumber),
        email,
        message: `No student is supplied for ${email}`,
      });
    }
    for (const row of nonBlankStudentRows) {
      const matches =
        studentsByName.get(normalizeGuardianImportName(row.studentName)) ?? [];
      if (matches.length === 0) {
        issues.push({
          code: "student_not_found",
          severity: "blocker",
          rowNumbers: [row.rowNumber],
          email,
          studentName: displayValue(row.studentName),
          message: `No active student exactly matches ${displayValue(row.studentName)}`,
        });
      } else if (matches.length > 1) {
        issues.push({
          code: "ambiguous_student",
          severity: "blocker",
          rowNumbers: [row.rowNumber],
          email,
          studentName: displayValue(row.studentName),
          candidateStudentNos: matches.map((match) => match.studentNo).sort(),
          message: `Several active students exactly match ${displayValue(row.studentName)}`,
        });
      } else {
        matchedStudents.set(matches[0]!.id, matches[0]!);
      }
    }

    if (matchedStudents.size === 0) {
      skippedGuardians += 1;
      continue;
    }
    guardians.push({
      email,
      name: names[0]!,
      phone: phones[0] ?? null,
      address: addresses[0] ?? null,
      rowNumbers: groupRows.map((row) => row.rowNumber),
      students: [...matchedStudents.values()].sort((a, b) =>
        a.studentNo.localeCompare(b.studentNo),
      ),
    });
  }

  return {
    guardians,
    issues,
    sourceRows: rows.length,
    distinctEmails: rowsByEmail.size,
    plannedLinks: guardians.reduce(
      (sum, guardian) => sum + guardian.students.length,
      0,
    ),
    skippedGuardians,
  };
}
