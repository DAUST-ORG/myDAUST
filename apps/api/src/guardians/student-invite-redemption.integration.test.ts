import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
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
const DIRECT_DOB = "2002-04-19";
const TEST_SESSION_SECRET = "student-redemption-integration-secret";
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;

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

interface SeededIssuedInvite extends SeededInvite {
  activationRequestId: string;
  batchId: string;
  cardId: string;
}

interface SeededDirectInvite extends SeededInvite {
  activationRequestId: string;
  studentId: string;
  studentNo: string;
}

function directAccountHash(studentNo: string, dob = DIRECT_DOB): string {
  return createHmac("sha256", TEST_SESSION_SECRET)
    .update("mydaust:student-activation-account:v3\0")
    .update(studentNo.normalize("NFKC").trim().toUpperCase())
    .update("\0")
    .update(dob)
    .digest("hex");
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
      dateOfBirth: new Date(`${DIRECT_DOB}T00:00:00.000Z`),
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

async function seedDirectInvite(label: string): Promise<SeededDirectInvite> {
  const seeded = await seedInvite(label);
  const student = await prisma.student.findUniqueOrThrow({
    where: { personId: seeded.personId },
  });
  const request = await prisma.studentActivationRequest.create({
    data: {
      studentPersonId: seeded.personId,
      accountKeyHash: directAccountHash(student.studentNo),
      requestTokenHash: sha256(seeded.token),
      approvalCodeHash: null,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      approvedAt: new Date(),
      verificationMethod: "student_id_dob",
      studentInviteId: seeded.inviteId,
    },
  });
  return {
    ...seeded,
    activationRequestId: request.id,
    studentId: student.id,
    studentNo: student.studentNo,
  };
}

async function seedIssuedInvite(label: string): Promise<SeededIssuedInvite> {
  const seeded = await seedInvite(label);
  const issuer = await prisma.person.create({
    data: {
      email: `issued-card-${label}-${randomUUID()}@test.local`,
      firstName: "Card",
      lastName: "Issuer",
      kind: "staff",
      roles: ["registrar"],
      status: "active",
    },
  });
  const batch = await prisma.studentActivationCardBatch.create({
    data: {
      confirmationPlanSha256: sha256(`plan-${randomUUID()}`),
      eligibilitySnapshotSha256: sha256(`snapshot-${randomUUID()}`),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      eligibleCount: 1,
      generatedCount: 1,
      outputSha256: sha256(`output-${randomUUID()}`),
      createdById: issuer.id,
    },
  });
  const card = await prisma.studentActivationCard.create({
    data: {
      batchId: batch.id,
      studentPersonId: seeded.personId,
      codeHmacSha256: sha256(`code-hmac-${randomUUID()}`),
      boundEmailSha256: sha256(seeded.email),
      expiresAt: batch.expiresAt,
      claimedAt: new Date(),
    },
  });
  const request = await prisma.studentActivationRequest.create({
    data: {
      studentPersonId: seeded.personId,
      accountKeyHash: sha256(`account-${randomUUID()}`),
      requestTokenHash: sha256(seeded.token),
      approvalCodeHash: sha256(`legacy-required-${randomUUID()}`),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      approvedAt: new Date(),
      verificationMethod: "issued_code",
      studentActivationCardId: card.id,
      studentInviteId: seeded.inviteId,
    },
  });
  return {
    ...seeded,
    activationRequestId: request.id,
    batchId: batch.id,
    cardId: card.id,
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
    process.env.DATABASE_URL = DB_URL!;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
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
    if (prisma) {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`,
      );
      await prisma.$disconnect();
    }
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_SESSION_SECRET === undefined)
      delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL_SESSION_SECRET;
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

  it("consumes every linked issued-card credential on successful redemption", async () => {
    const seeded = await seedIssuedInvite("issued-success");

    await expect(
      guardians.redeemInvite(seeded.token, seeded.password),
    ).resolves.toEqual({ ok: true, email: seeded.email });

    const [invite, card, request] = await Promise.all([
      prisma.studentInvite.findUniqueOrThrow({
        where: { id: seeded.inviteId },
      }),
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: seeded.cardId },
      }),
      prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: seeded.activationRequestId },
      }),
    ]);
    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(card.usedAt).toBeInstanceOf(Date);
    expect(request.consumedAt).toBeInstanceOf(Date);
    expect(request.invalidatedAt).toBeNull();
  });

  it("revalidates and consumes a direct ID-and-DOB activation request", async () => {
    const seeded = await seedDirectInvite("direct-success");

    await expect(
      guardians.redeemInvite(seeded.token, seeded.password),
    ).resolves.toEqual({ ok: true, email: seeded.email });

    const [person, invite, request] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
      prisma.studentInvite.findUniqueOrThrow({
        where: { id: seeded.inviteId },
      }),
      prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: seeded.activationRequestId },
      }),
    ]);
    expect(person.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(request).toMatchObject({
      verificationMethod: "student_id_dob",
      consumedAt: expect.any(Date),
      invalidatedAt: null,
    });
  });

  it("burns a direct invite if the bound ID or birth date drifts", async () => {
    const seeded = await seedDirectInvite("direct-dob-drift");
    await prisma.student.update({
      where: { id: seeded.studentId },
      data: { dateOfBirth: new Date("2002-04-18T00:00:00.000Z") },
    });

    const error = await redemptionError(seeded.token, seeded.password);
    expect(error).toMatchObject({ message: GENERIC_INVITE_ERROR });

    const [person, invite, request, audit] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
      prisma.studentInvite.findUniqueOrThrow({
        where: { id: seeded.inviteId },
      }),
      prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: seeded.activationRequestId },
      }),
      prisma.auditLog.findFirstOrThrow({
        where: {
          entity: "Person",
          entityId: seeded.personId,
          action: "student-setup-link-invalidated",
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    expect(person.passwordHash).toBeNull();
    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(request).toMatchObject({
      consumedAt: null,
      invalidatedAt: expect.any(Date),
    });
    expect(audit).toMatchObject({
      actorId: null,
      data: { reason: "direct_activation_state_drift" },
    });
  });

  it("honors the 30-minute invite after a timely claim crosses card expiry", async () => {
    const seeded = await seedIssuedInvite("claimed-before-expiry");
    const [card, batch] = await Promise.all([
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: seeded.cardId },
      }),
      prisma.studentActivationCardBatch.findUniqueOrThrow({
        where: { id: seeded.batchId },
      }),
    ]);
    await prisma.studentActivationCard.update({
      where: { id: card.id },
      data: { expiresAt: new Date(card.createdAt.getTime() + 1) },
    });
    await prisma.studentActivationCardBatch.update({
      where: { id: batch.id },
      data: { expiresAt: new Date(batch.createdAt.getTime() + 1) },
    });

    await expect(
      guardians.redeemInvite(seeded.token, seeded.password),
    ).resolves.toEqual({ ok: true, email: seeded.email });
    expect(
      await prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: seeded.activationRequestId },
      }),
    ).toMatchObject({ invalidatedAt: null });
  });

  it.each(["card", "batch"] as const)(
    "burns an issued invite when its linked %s is revoked before password setup",
    async (target) => {
      const seeded = await seedIssuedInvite(`revoked-${target}`);
      const revokedAt = new Date();
      if (target === "card") {
        await prisma.studentActivationCard.update({
          where: { id: seeded.cardId },
          data: { revokedAt },
        });
      } else {
        await prisma.studentActivationCardBatch.update({
          where: { id: seeded.batchId },
          data: {
            status: "revoked",
            revokedAt,
            revokedById: (
              await prisma.studentActivationCardBatch.findUniqueOrThrow({
                where: { id: seeded.batchId },
                select: { createdById: true },
              })
            ).createdById,
            revokeReason: "security_response",
          },
        });
      }

      const error = await redemptionError(seeded.token, seeded.password);
      expect(error).toMatchObject({ message: GENERIC_INVITE_ERROR });

      const [person, invite, request, audit] = await Promise.all([
        prisma.person.findUniqueOrThrow({ where: { id: seeded.personId } }),
        prisma.studentInvite.findUniqueOrThrow({
          where: { id: seeded.inviteId },
        }),
        prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: seeded.activationRequestId },
        }),
        prisma.auditLog.findFirstOrThrow({
          where: {
            entity: "Person",
            entityId: seeded.personId,
            action: "student-setup-link-invalidated",
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      expect(person.passwordHash).toBeNull();
      expect(invite.usedAt).toBeInstanceOf(Date);
      expect(request.invalidatedAt).toBeInstanceOf(Date);
      expect(request.consumedAt).toBeNull();
      expect(audit).toMatchObject({
        actorId: null,
        data: { reason: "activation_card_revoked" },
      });
    },
  );

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
