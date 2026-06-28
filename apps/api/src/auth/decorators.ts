import { SetMetadata } from "@nestjs/common";
import type { Role } from "./current-user.js";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks a route as not requiring authentication (e.g. the PayTech IPN webhook). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
