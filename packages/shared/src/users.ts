// Director-managed user administration. One screen over every population, so the contracts
// live here rather than next to any one domain module.

import { z } from "zod";
import { APP_ROLES } from "./roles.js";

/**
 * Domains a login address may use. These are sign-in identifiers, NOT mailboxes — nothing in
 * this system provisions a real inbox, so mail sent to one of these addresses does not arrive.
 * Keep student logins on mydaust.com; that is where the existing cohort already lives.
 */
export const LOGIN_DOMAINS = ["daust.org", "mydaust.com"] as const;
export type LoginDomain = (typeof LOGIN_DOMAINS)[number];

/**
 * Populations this screen creates. Guardians are deliberately absent: a guardian is created
 * against the student they belong to, so they keep their own flow.
 */
export const CREATABLE_KINDS = ["staff", "faculty", "student"] as const;
export type CreatableKind = (typeof CREATABLE_KINDS)[number];

export const PERSON_KINDS = ["student", "faculty", "staff", "parent"] as const;
export const PERSON_STATUSES = ["active", "suspended"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

const emailLocal = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "Use letters and numbers, separated by dots, hyphens or underscores",
  );

/** The minimum a Student row needs. The registrar screen remains the place for the full file. */
export const NewStudentRecord = z.object({
  studentNo: z.string().trim().min(1).max(40),
  programCode: z.string().trim().max(40).nullish(),
  cohort: z.string().trim().max(160).nullish(),
  catalogYear: z.string().trim().max(160).nullish(),
  yearLevel: z.number().int().min(1).max(8).nullish(),
  dateOfBirth: z.string().min(8).nullish(),
  phone: z.string().trim().max(160).nullish(),
});
export type NewStudentRecord = z.infer<typeof NewStudentRecord>;

export const CreateUserInput = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    emailLocal,
    emailDomain: z.enum(LOGIN_DOMAINS),
    kind: z.enum(CREATABLE_KINDS),
    roles: z.array(z.enum(APP_ROLES)).max(APP_ROLES.length).default([]),
    /** Issue a temp password now. Returned once, never stored in plaintext or audited. */
    provisionLogin: z.boolean().default(false),
    student: NewStudentRecord.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "student") {
      if (!v.student) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["student"],
          message:
            "A student needs a student record; creating a bare login would break every student screen",
        });
      }
      if (v.roles.some((r) => r !== "student")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roles"],
          message: "A student account holds the student role and nothing else",
        });
      }
    } else if (v.student) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["student"],
        message: "Only a student account carries a student record",
      });
    }
  });
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    emailLocal: emailLocal.optional(),
    emailDomain: z.enum(LOGIN_DOMAINS).optional(),
  })
  .refine(
    (v) => (v.emailLocal === undefined) === (v.emailDomain === undefined),
    {
      path: ["emailDomain"],
      message: "Changing the login address needs both the name and the domain",
    },
  );
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const SuspendUserInput = z.object({
  reason: z.string().trim().max(300).optional(),
});
export type SuspendUserInput = z.infer<typeof SuspendUserInput>;

export const UserListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(APP_ROLES).optional(),
  kind: z.enum(PERSON_KINDS).optional(),
  status: z.enum(PERSON_STATUSES).optional(),
  /** "none" finds accounts that hold no role at all — they can sign in and see nothing. */
  roleless: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type UserListQuery = z.infer<typeof UserListQuery>;

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  kind: (typeof PERSON_KINDS)[number];
  roles: string[];
  status: PersonStatus;
  suspendedAt: string | null;
  hasLogin: boolean;
  mustChangePassword: boolean;
  studentId: string | null;
  studentNo: string | null;
  createdAt: string;
}

export interface ManagedUserPage {
  rows: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}
