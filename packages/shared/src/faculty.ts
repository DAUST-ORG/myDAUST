// Faculty public-website profiles. Source of truth is the DB (Person + FacultyProfile);
// the comms "Faculty" manager edits these and toggles site visibility per professor.

import { z } from "zod";

/** Editable faculty identity + public-profile fields. */
export const FacultyProfileInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160).optional(),
  title: z.string().trim().max(160).nullable().optional(),
  dept: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  interests: z.array(z.string().trim().max(120)).max(50).default([]),
  scholar: z.string().trim().max(300).nullable().optional(),
  photoUrl: z.string().trim().max(300).nullable().optional(),
});
export type FacultyProfileInput = z.infer<typeof FacultyProfileInput>;

/** Registrar creates a faculty member: a Person with the faculty role, optionally with a login. */
export const FacultyCreateInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  provisionLogin: z.boolean().optional(),
});
export type FacultyCreateInput = z.infer<typeof FacultyCreateInput>;

/** The public shape the vitrine renders (profile merged with the Person name). */
export interface PublicFacultyMember {
  id: string; // person id — stable across profile edits
  name: string;
  initials: string;
  title: string | null;
  dept: string | null;
  bio: string | null;
  interests: string[];
  scholar: string | null;
  photo: string | null; // /uploads/... path, resolved by the vitrine
}

/** One row in the comms Faculty manager (every platform faculty, public or not). */
export interface AdminFacultyItem {
  id: string; // person id
  email: string;
  firstName: string;
  lastName: string;
  publicProfile: boolean;
  assignedSectionCount: number;
  profile: {
    title: string | null;
    dept: string | null;
    bio: string | null;
    interests: string[];
    scholar: string | null;
    photoUrl: string | null;
  } | null;
}
