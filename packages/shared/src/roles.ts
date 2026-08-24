/** Canonical app RBAC roles (a person can hold several). Source of truth for all apps. */
export const APP_ROLES = [
  "student",
  "parent",
  "faculty",
  "registrar",
  // Applicant pipeline only: intake, edits and stage moves up to "offer". Accepting an
  // applicant creates a Person, a Student, an invoice and a payment link, so it stays with
  // admin. No student records, no money, no other portal.
  "admissions",
  "bursar",
  "hr",
  "it_admin",
  // Manages the public marketing site content (the site CMS). No SIS data access.
  "communications",
  "infirmary",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Display names for every role. Typed as Record<AppRole, string> deliberately: adding a role
 * to APP_ROLES without labelling it here fails typecheck, which is what stops a new role from
 * shipping invisible to the admin screens the way hr and it_admin once did.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  student: "Student",
  parent: "Parent",
  faculty: "Faculty",
  registrar: "Registrar",
  admissions: "Admissions",
  bursar: "Bursar",
  hr: "HR",
  it_admin: "IT Admin",
  communications: "Communications",
  infirmary: "Infirmary",
  admin: "Admin",
};

/**
 * Roles that mean nothing without a backing record. Granting one without it produces an
 * account that authenticates and then breaks: Prisma drops undefined filter keys, so a
 * `student` with no Student row reaches queries that silently widen to every enrollment in
 * the system rather than erroring. Lives here so the API guard and the role picker that hides
 * these checkboxes are derived from one list.
 */
export const ROLES_NEEDING_A_RECORD: Record<string, string> = {
  student: "an active student record — create them from the Registrar screens",
  parent: "a linked student — add them from the Parents screen",
};

import { z } from "zod";

/** it_admin/admin: replace a person's role set. Role changes are always audit-logged. */
export const UpdateRolesInput = z.object({
  roles: z.array(z.enum(APP_ROLES)).max(APP_ROLES.length),
});
export type UpdateRolesInput = z.infer<typeof UpdateRolesInput>;
