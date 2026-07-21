/** Canonical app RBAC roles (a person can hold several). Source of truth for all apps. */
export const APP_ROLES = [
  "student",
  "parent",
  "faculty",
  "registrar",
  "bursar",
  "hr",
  "it_admin",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

import { z } from "zod";

/** it_admin/admin: replace a person's role set. Role changes are always audit-logged. */
export const UpdateRolesInput = z.object({
  roles: z.array(z.enum(APP_ROLES)).max(APP_ROLES.length),
});
export type UpdateRolesInput = z.infer<typeof UpdateRolesInput>;
