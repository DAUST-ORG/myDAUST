import type { Prisma } from "@mydaust/db";
import { z } from "zod";

/**
 * Presence is meaningful: no row preserves the legacy term selection, while a
 * present row with termId=null deliberately closes student self-registration.
 */
export const REGISTRATION_CONFIGURATION_KEY = "academics.registration";

export const RegistrationConfigurationValue = z
  .object({
    termId: z.string().uuid().nullable(),
    recommendationsEnabled: z.boolean(),
  })
  .strict()
  .refine((value) => value.termId !== null || !value.recommendationsEnabled, {
    message:
      "Recommendations cannot be enabled while registration is explicitly closed",
    path: ["recommendationsEnabled"],
  });

export type RegistrationConfigurationValue = z.infer<
  typeof RegistrationConfigurationValue
>;

export type RegistrationConfigurationRead =
  | {
      state: "absent";
      mode: "legacy";
      termId: null;
      recommendationsEnabled: false;
    }
  | {
      state: "valid";
      mode: "configured";
      termId: string | null;
      recommendationsEnabled: boolean;
    }
  | {
      state: "invalid";
      mode: "configured";
      termId: null;
      recommendationsEnabled: false;
    };

interface AppSettingReader {
  appSetting: {
    findUnique(args: {
      where: { key: string };
      select: { valueJson: true };
    }): Promise<{ valueJson: Prisma.JsonValue } | null>;
  };
}

type RegistrationConfigurationLockClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw"
>;

// Two-int advisory-lock namespace: "DAUS" + "REG". A shared lock keeps
// ordinary enrollments concurrent; the exclusive writer lock linearizes a
// registrar close/switch even while the AppSetting row is still absent.
const REGISTRATION_LOCK_NAMESPACE = 0x44415553;
const REGISTRATION_LOCK_KEY = 0x00524547;

export async function acquireRegistrationConfigurationReadLock(
  client: RegistrationConfigurationLockClient,
) {
  await client.$queryRaw`
    SELECT pg_advisory_xact_lock_shared(
      ${REGISTRATION_LOCK_NAMESPACE}::int,
      ${REGISTRATION_LOCK_KEY}::int
    )::text AS acquired
  `;
}

export async function acquireRegistrationConfigurationWriteLock(
  client: RegistrationConfigurationLockClient,
) {
  await client.$queryRaw`
    SELECT pg_advisory_xact_lock(
      ${REGISTRATION_LOCK_NAMESPACE}::int,
      ${REGISTRATION_LOCK_KEY}::int
    )::text AS acquired
  `;
}

export async function readRegistrationConfiguration(
  client: AppSettingReader,
): Promise<RegistrationConfigurationRead> {
  const row = await client.appSetting.findUnique({
    where: { key: REGISTRATION_CONFIGURATION_KEY },
    select: { valueJson: true },
  });
  if (!row) {
    return {
      state: "absent",
      mode: "legacy",
      termId: null,
      recommendationsEnabled: false,
    };
  }
  const parsed = RegistrationConfigurationValue.safeParse(row.valueJson);
  if (!parsed.success) {
    return {
      state: "invalid",
      mode: "configured",
      termId: null,
      recommendationsEnabled: false,
    };
  }
  return { state: "valid", mode: "configured", ...parsed.data };
}

export type RegistrationClosedReason =
  | "closed_by_registrar"
  | "configuration_invalid"
  | "no_term_available"
  | "term_ended"
  | "add_deadline_passed"
  | null;

export function registrationClosedReason(
  term: { endDate: Date; addDeadline: Date | null } | null,
  now = new Date(),
): RegistrationClosedReason {
  if (!term) return "no_term_available";
  if (term.endDate.getTime() < now.getTime()) return "term_ended";
  if (term.addDeadline && term.addDeadline.getTime() < now.getTime()) {
    return "add_deadline_passed";
  }
  return null;
}

export const REGISTRATION_SEMESTERS = ["Fall", "Spring", "Summer"] as const;
export type RegistrationSemester = (typeof REGISTRATION_SEMESTERS)[number];

export function normalizeRegistrationSemester(
  value: string | null | undefined,
): RegistrationSemester | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "fall") return "Fall";
  if (normalized === "spring") return "Spring";
  if (normalized === "summer") return "Summer";
  return null;
}

export function academicYearStart(
  year: { label: string; startsOn: Date | null } | null | undefined,
): number | null {
  if (!year) return null;
  if (year.startsOn) return year.startsOn.getUTCFullYear();
  const match = /(?:^|\D)(\d{4})(?:\D|$)/.exec(year.label);
  return match ? Number(match[1]) : null;
}

/**
 * Resolve the academic-year start represented by a free-text admission term.
 * Explicit ranges win; Spring/Summer belong to the academic year that began in
 * the previous calendar year.
 */
export function admissionAcademicYearStart(
  admitTerm: string | null | undefined,
): number | null {
  if (!admitTerm) return null;
  const range = /(?:^|\D)(\d{4})\s*[-–—/]\s*(?:\d{2}|\d{4})(?:\D|$)/.exec(
    admitTerm,
  );
  if (range) return Number(range[1]);
  const year = /(?:^|\D)(\d{4})(?:\D|$)/.exec(admitTerm);
  if (!year) return null;
  const calendarYear = Number(year[1]);
  const season = normalizeRegistrationSemester(admitTerm.split(/\s+/)[0]);
  return season === "Spring" || season === "Summer"
    ? calendarYear - 1
    : calendarYear;
}
