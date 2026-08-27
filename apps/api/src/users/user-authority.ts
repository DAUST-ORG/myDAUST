import type { AppRole } from "@mydaust/shared";

export type RoleSet = readonly string[];

/**
 * Only an admin hands out or takes away admin. Everything else an it_admin may also grant.
 *
 * Without the admin carve-out an it_admin promotes a colleague to admin, or promotes an
 * account they control, and has full access one step later. Self-promotion is already blocked
 * by the self-edit guard; this closes the route through a second person.
 */
export function canGrantRole(actorRoles: RoleSet, role: string): boolean {
  if (role === "admin") return actorRoles.includes("admin");
  return actorRoles.includes("admin") || actorRoles.includes("it_admin");
}

/**
 * A caller may only administer someone whose every role they could themselves grant.
 *
 * This is the ceiling that makes the password reset safe. A reset returns a working temp
 * password to whoever asked for it, and mustChangePassword is only a client-side redirect
 * (PortalShell), never a server gate -- so a reset IS a full credential for the target
 * account. Without this rule an it_admin resets admin@daust.edu, reads the password off the
 * screen, and signs in as the administrator.
 *
 * It cannot live in a decorator: RolesGuard only ever reads the caller's roles, never the
 * roles of the :id being acted on.
 */
export function canAdminister(
  actorRoles: RoleSet,
  targetRoles: RoleSet,
): boolean {
  return targetRoles.every((role) => canGrantRole(actorRoles, role));
}

/** Roles added and removed by a change, so only the difference has to clear the ceiling. */
export function roleDelta(
  from: RoleSet,
  to: RoleSet,
): { added: string[]; removed: string[] } {
  const before = new Set(from);
  const after = new Set(to);
  return {
    added: [...after].filter((r) => !before.has(r)),
    removed: [...before].filter((r) => !after.has(r)),
  };
}

/** z.enum does not dedupe, and a duplicate would double-count in any later role tally. */
export function normalizeRoles(roles: readonly AppRole[]): AppRole[] {
  return [...new Set(roles)];
}

/**
 * Re-exported so the API guard and the portal role picker read the same list.
 */
export { ROLES_NEEDING_A_RECORD } from "@mydaust/shared";
