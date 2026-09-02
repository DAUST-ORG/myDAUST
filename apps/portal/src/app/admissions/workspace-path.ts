/**
 * Registrar/admin users share the Admissions workflow, but they must remain in
 * the Registrar shell while moving between the queue, applicant, and notes.
 */
export function admissionsWorkspacePath(pathname: string): string {
  return pathname.startsWith("/admin/admissions")
    ? "/admin/admissions"
    : "/admissions";
}
