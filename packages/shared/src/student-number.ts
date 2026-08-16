/** Canonical persisted form for every Student.studentNo identity. */
export function normalizeStudentNumber(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}
