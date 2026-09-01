import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuardiansService } from "./guardians.service.js";

/**
 * Student setup links are credentials. Exercise their claim and identity guards
 * against PostgreSQL rather than a mock so concurrent transactions, relation
 * filters, and rollback/commit behavior are covered.
 *
 * This suite intentionally accepts TEST_DATABASE_URL only. It creates and drops
 * its own schema, but must never fall back to a developer or production URL.
 */
const SCHEMA = `student_invite_redemption_${randomUUID()
  .replaceAll("-", "")
  .slice(0, 12)}`;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const DB_URL = TEST_DATABASE_URL
  ? (() => {
      const url = new URL(TEST_DATABASE_URL);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

const GENERIC_INVITE_ERROR = "That invitation link is invalid or has expired";

let prisma: PrismaClient;
let guardians: GuardiansService;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface SeededInvite {
  token: string;
  password: string;
  email: string;
  personId: string;
  inviteId: string;
}

async function seedInvite(
  label: string,
  options: {
    expiresAt?: Date;
    usedAt?: Date | null;
    status?: "active" | "suspended";
    passwordHash?: string | null;
    sessionVersion?: number;
    boundEmail?: string;
  } = {},
): Promise<SeededInvite> {
  const suffix = randomUUID();
  const email = `${label}-${suffix}@test.local`;
  const token = `student-setup-${label}-${suffix}`;
  const password = `Secure-${label}-password-2026`;
  const tokenHash = sha256(token);
  const passwordHash = options.passwordHash ?? null;
  const status = options.status ?? "active";

  const person = await prisma.person.create({
    data: {
      email,
      firstName: label,
      lastName: "Student",
      kind: "student",
      roles: ["student"],
      passwordHash,
      mustChangePassword: false,
      status,
      suspendedAt: status === "suspended" ? new Date() : null,
      sessionVersion: options.sessionVersion ?? 0,
    },
  });
  await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `INT-${suffix}`,
      recordStatus: "active",
    },
  });
  const invite = await prisma.studentInvite.create({
    data: {
      studentPersonId: person.id,
      tokenHash,
      boundEmailSha256: sha256(options.boundEmail ?? email),
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60_000),
      usedAt: options.usedAt ?? null,
    },
  });

  return {
    token,
    password,
    email,
    personId: person.id,
    inviteId: invite.id,
  };
}

async function redemptionError(token: string, password: string) {
  try {
    await guardians.redeemInvite(token, password);
    throw new Error("Expected student invite redemption to fail");
  } catch (error) {
    return error;
  }
}

describe.skipIf(!DB_URL)("student invite redemption security", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    guardians = new GuardiansService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("atomically installs a bcrypt password and records the redemption", async () => {
    const seeded = await seedInvite("success", { sessionVersion: 7 });

    await expect(
      guardians.redeemInvite(seeded.token, seeded.password),
    ).resolves.toEqual({ ok: true, email: seeded.email });

    const [person, invite, audit] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
      prisma.studentInvite.findUniqueOrThrow({
        where: { id: seeded.inviteId },
      }),
      prisma.auditLog.findMany({
        where: {
          entity: "Person",
          entityId: seeded.personId,
          action: "student-password-set",
        },
      }),
    ]);

    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(person).toMatchObject({
      sessionVersion: 8,
      mustChangePassword: false,
    });
    expect(person.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(seeded.password, person.passwordHash!)).toBe(
      true,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: seeded.personId });
  });

  it("allows exactly one of two concurrent redemptions", async () => {
    const seeded = await seedInvite("concurrent");
    const passwords = [
      "Concurrent-student-password-one",
      "Concurrent-student-password-two",
    ];

    const results = await Promise.allSettled(
      passwords.map((password) =>
        guardians.redeemInvite(seeded.token, password),
      ),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: GENERIC_INVITE_ERROR,
    });

    const [person, invite, auditCount] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
      prisma.studentInvite.findUniqueOrThrow({
        where: { id: seeded.inviteId },
      }),
      prisma.auditLog.count({
        where: {
          entity: "Person",
          entityId: seeded.personId,
          action: "student-password-set",
        },
      }),
    ]);
    const matchingPasswords = await Promise.all(
      passwords.map((password) =>
        bcrypt.compare(password, person.passwordHash!),
      ),
    );

    expect(matchingPasswords.filter(Boolean)).toHaveLength(1);
    expect(person.sessionVersion).toBe(1);
    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(auditCount).toBe(1);
  });

  it.each([
    {
      label: "expired",
      options: { expiresAt: new Date(Date.now() - 60_000) },
    },
    { label: "used", options: { usedAt: new Date(Date.now() - 60_000) } },
    { label: "inactive", options: { status: "suspended" as const } },
    {
      label: "email-drift",
      options: { boundEmail: "prior-student-email@test.local" },
    },
    {
      label: "password-existing",
      options: { passwordHash: bcrypt.hashSync("Existing-password-2026", 10) },
    },
  ])(
    "rejects a $label invite generically without changing the password",
    async ({ label, options }) => {
      const seeded = await seedInvite(label, options);
      const before = await prisma.person.findUniqueOrThrow({
        where: { id: seeded.personId },
      });

      const error = await redemptionError(seeded.token, seeded.password);
      expect(error).toMatchObject({ message: GENERIC_INVITE_ERROR });

      const [after, auditCount] = await Promise.all([
        prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
        prisma.auditLog.count({
          where: {
            entity: "Person",
            entityId: seeded.personId,
            action: "student-password-set",
          },
        }),
      ]);

      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.sessionVersion).toBe(before.sessionVersion);
      expect(auditCount).toBe(0);
    },
  );
});
