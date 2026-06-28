/** Canonical app RBAC roles (a person can hold several). Source of truth for all apps. */
export const APP_ROLES = [
  "student",
  "faculty",
  "registrar",
  "bursar",
  "hr",
  "student_affairs",
  "dining",
  "innovation",
  "it_admin",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}
