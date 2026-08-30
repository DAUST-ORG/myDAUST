import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  INFIRMARY_EMERGENCY_RECIPIENTS_KEY,
  readAppSettingPersonIds,
  resolveRecipients,
} from "./recipient-resolver.js";

describe("resolveRecipients", () => {
  it("returns one entry per id for personIds with in_app only", async () => {
    const prisma = { person: {}, appSetting: {} } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "personIds",
      personIds: ["p1", "p2", "p1"],
    });
    expect(result).toEqual([
      { personId: "p1", channels: ["in_app"] },
      { personId: "p2", channels: ["in_app"] },
    ]);
  });

  it("returns [] when personIds is empty", async () => {
    const prisma = { person: {}, appSetting: {} } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "personIds",
      personIds: [],
    });
    expect(result).toEqual([]);
  });

  it("queries Person by role and yields in_app", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    const prisma = {
      person: { findMany },
      appSetting: {},
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "role",
      role: "admin",
    });
    expect(findMany).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { personId: "a1", channels: ["in_app"] },
      { personId: "a2", channels: ["in_app"] },
    ]);
  });

  it("returns [] when role matches nobody", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      person: { findMany },
      appSetting: {},
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "role",
      role: "nobody",
    });
    expect(result).toEqual([]);
  });

  it("reads personIds from AppSetting and yields in_app+email", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ valueJson: ["p1", "p2", 42, null, ""] });
    const prisma = {
      person: {},
      appSetting: { findUnique },
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "appSetting",
      key: "notifications.testRecipients",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: "notifications.testRecipients" },
    });
    expect(result).toEqual([
      { personId: "p1", channels: ["in_app", "email"] },
      { personId: "p2", channels: ["in_app", "email"] },
    ]);
  });

  it("returns [] when AppSetting is missing or malformed", async () => {
    const missing = {
      person: {},
      appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    expect(
      await resolveRecipients(missing, { kind: "appSetting", key: "missing" }),
    ).toEqual([]);

    const malformed = {
      person: {},
      appSetting: {
        findUnique: vi.fn().mockResolvedValue({ valueJson: "not-an-array" }),
      },
    } as unknown as PrismaService;
    expect(
      await resolveRecipients(malformed, { kind: "appSetting", key: "bad" }),
    ).toEqual([]);
  });

  it("reads guardians for a student", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ guardianId: "g1" }, { guardianId: "g2" }]);
    const prisma = {
      person: {},
      guardianStudent: { findMany },
      appSetting: {},
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "studentGuardians",
      studentId: "s1",
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { studentId: "s1" },
      select: { guardianId: true },
    });
    expect(result).toEqual([
      { personId: "g1", channels: ["in_app"] },
      { personId: "g2", channels: ["in_app"] },
    ]);
  });

  it("reads the infirmary emergency list with in_app+email", async () => {
    const findUnique = vi.fn().mockResolvedValue({ valueJson: ["p1"] });
    const prisma = {
      person: {},
      appSetting: { findUnique },
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "infirmaryEmergencyList",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: INFIRMARY_EMERGENCY_RECIPIENTS_KEY },
    });
    expect(result).toEqual([
      { personId: "p1", channels: ["in_app", "email"] },
    ]);
  });

  it("returns [] when the emergency list is missing", async () => {
    const prisma = {
      person: {},
      appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const result = await resolveRecipients(prisma, {
      kind: "infirmaryEmergencyList",
    });
    expect(result).toEqual([]);
  });
});

describe("readAppSettingPersonIds", () => {
  it("filters non-string entries", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ valueJson: ["a", 1, null, "b", "", "c"] });
    const result = await readAppSettingPersonIds(
      { appSetting: { findUnique } } as unknown as PrismaService,
      "k",
    );
    expect(result).toEqual(["a", "b", "c"]);
  });
});
