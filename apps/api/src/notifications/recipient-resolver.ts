import type { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service.js";

export type NotificationChannel = "in_app" | "email";

export interface NotificationRecipient {
  readonly personId: string;
  readonly channels: ReadonlyArray<NotificationChannel>;
}

export type NotificationAudience =
  | { kind: "personIds"; personIds: string[] }
  | { kind: "role"; role: string }
  | { kind: "appSetting"; key: string }
  | { kind: "studentGuardians"; studentId: string }
  | { kind: "infirmaryEmergencyList" };

export const NOTIFICATIONS_EMAIL_ENABLED_KEY =
  "notifications.emailEnabled" as const;
export const INFIRMARY_EMERGENCY_RECIPIENTS_KEY =
  "infirmary.emergencyRecipients" as const;

const EMPTY: NotificationRecipient[] = [];

function clientOf(prisma: PrismaService): PrismaClient {
  return prisma as unknown as PrismaClient;
}

/**
 * Resolve a `NotificationAudience` to a concrete list of recipients. Each audience variant
 * is read with safe fallbacks — a missing role, a malformed AppSetting, or an unknown
 * student never throws, it returns `[]`. The caller can then no-op without ceremony.
 *
 * Channels are decided here once per call: `personIds` and `role` get `in_app` only; the
 * `appSetting`-driven lists are treated as opt-in to mail because the operator chose to
 * put the recipient on a paging list, which implies email as a backup channel.
 */
export async function resolveRecipients(
  prisma: PrismaService,
  audience: NotificationAudience,
): Promise<NotificationRecipient[]> {
  const prismaClient = clientOf(prisma);

  switch (audience.kind) {
    case "personIds": {
      const ids = Array.from(new Set(audience.personIds.filter(Boolean)));
      if (ids.length === 0) return EMPTY;
      return ids.map((personId) => ({
        personId,
        channels: ["in_app"] as const,
      }));
    }

    case "role": {
      const people = await prismaClient.person.findMany({
        where: { roles: { has: audience.role } },
        select: { id: true },
      });
      return people.map((p) => ({
        personId: p.id,
        channels: ["in_app"] as const,
      }));
    }

    case "appSetting": {
      const ids = await readAppSettingPersonIds(prismaClient, audience.key);
      if (ids.length === 0) return EMPTY;
      return ids.map((personId) => ({
        personId,
        channels: ["in_app", "email"] as const,
      }));
    }

    case "studentGuardians": {
      const links = await prismaClient.guardianStudent.findMany({
        where: { studentId: audience.studentId },
        select: { guardianId: true },
      });
      const ids = Array.from(
        new Set(links.map((l) => l.guardianId).filter(Boolean)),
      );
      return ids.map((personId) => ({
        personId,
        channels: ["in_app"] as const,
      }));
    }

    case "infirmaryEmergencyList": {
      const ids = await readAppSettingPersonIds(
        prismaClient,
        INFIRMARY_EMERGENCY_RECIPIENTS_KEY,
      );
      if (ids.length === 0) return EMPTY;
      return ids.map((personId) => ({
        personId,
        channels: ["in_app", "email"] as const,
      }));
    }
  }
}

/**
 * Read an AppSetting that is expected to hold a JSON array of personIds. Returns `[]`
 * for missing keys, malformed values, or arrays that contain non-string entries. Never
 * throws — a paging list that fails to parse must not page.
 */
export async function readAppSettingPersonIds(
  prisma: PrismaClient,
  key: string,
): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return [];
  const value = row.valueJson;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}
