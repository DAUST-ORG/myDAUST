import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@mydaust/db";
import { encodeStudentActivationCode } from "@mydaust/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StudentActivationService } from "./student-activation.service.js";

/**
 * Physical activation cards and browser completion tokens are credentials. This
 * suite accepts TEST_DATABASE_URL only, migrates a random schema, and never
 * falls back to a developer or production database.
 */
const SCHEMA = `student_activation_card_${randomUUID()
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

const EXACT_DOB = "2002-04-19";
const CODE_KEY = randomBytes(32).toString("base64url");
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CODE_KEY = process.env.STUDENT_ACTIVATION_CODE_KEY_V1;

let prisma: PrismaClient;
let activation: StudentActivationService;
let issuerId: string;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codeHmac(code: string): string {
  return createHmac("sha256", Buffer.from(CODE_KEY, "base64url"))
    .update("mydaust:student-activation-card-code:v1\0")
    .update(code)
    .digest("hex");
}

function requestToken() {
  return randomBytes(32).toString("base64url");
}

async function createStudent(
  label: string,
  options: {
    dob?: string;
    personStatus?: "active" | "suspended";
    recordStatus?: string;
    roles?: string[];
    passwordHash?: string | null;
    mustChangePassword?: boolean;
    email?: string;
  } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const email =
    options.email ??
    `${label.replace(/[^a-z0-9]/gi, "-")}-${suffix}@test.local`;
  const personStatus = options.personStatus ?? "active";
  const person = await prisma.person.create({
    data: {
      email,
      firstName: label,
      lastName: "Student",
      kind: "student",
      roles: options.roles ?? ["student"],
      status: personStatus,
      suspendedAt: personStatus === "suspended" ? new Date() : null,
      passwordHash: options.passwordHash ?? null,
      mustChangePassword: options.mustChangePassword ?? false,
      sessionVersion: 3,
    },
  });
  const student = await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `ACT-${label.slice(0, 8).toUpperCase()}-${suffix}`,
      recordStatus: options.recordStatus ?? "active",
      dateOfBirth: new Date(`${options.dob ?? EXACT_DOB}T00:00:00.000Z`),
    },
  });
  return { person, student, email };
}

async function issueCard(
  studentPersonId: string,
  email: string,
  options: {
    code?: string;
    expiresAt?: Date;
    batchExpiresAt?: Date;
    revokedAt?: Date | null;
    batchRevokedAt?: Date | null;
    failedAttempts?: number;
    boundEmail?: string;
  } = {},
) {
  const code = options.code ?? encodeStudentActivationCode(randomBytes(10));
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 60 * 60_000);
  const batch = await prisma.studentActivationCardBatch.create({
    data: {
      confirmationPlanSha256: sha256(`plan-${randomUUID()}`),
      eligibilitySnapshotSha256: sha256(`snapshot-${randomUUID()}`),
      expiresAt: options.batchExpiresAt ?? expiresAt,
      status: options.batchRevokedAt ? "revoked" : "active",
      revokedAt: options.batchRevokedAt ?? null,
      revokedById: options.batchRevokedAt ? issuerId : null,
      revokeReason: options.batchRevokedAt ? "security_response" : null,
      eligibleCount: 1,
      generatedCount: 1,
      outputSha256: sha256(`output-${randomUUID()}`),
      createdById: issuerId,
    },
  });
  const card = await prisma.studentActivationCard.create({
    data: {
      batchId: batch.id,
      studentPersonId,
      codeHmacSha256: codeHmac(code),
      boundEmailSha256: sha256(options.boundEmail ?? email),
      expiresAt,
      revokedAt: options.revokedAt ?? null,
      failedAttempts: options.failedAttempts ?? 0,
    },
  });
  return { batch, card, code };
}

function activationInput(
  studentNo: string,
  code: string,
  overrides: Partial<{
    dob: string;
    requestToken: string;
  }> = {},
) {
  return {
    studentNo,
    dob: overrides.dob ?? EXACT_DOB,
    activationCode: code,
    requestToken: overrides.requestToken ?? requestToken(),
  };
}

describe.skipIf(!DB_URL)("self-service student activation cards", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!;
    process.env.NODE_ENV = "test";
    process.env.STUDENT_ACTIVATION_CODE_KEY_V1 = CODE_KEY;
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    activation = new StudentActivationService(prisma as never);
    const issuer = await prisma.person.create({
      data: {
        email: `activation-card-issuer-${randomUUID()}@test.local`,
        firstName: "Activation",
        lastName: "Issuer",
        kind: "staff",
        roles: ["registrar"],
        status: "active",
      },
    });
    issuerId = issuer.id;
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
    if (ORIGINAL_CODE_KEY === undefined) {
      delete process.env.STUDENT_ACTIVATION_CODE_KEY_V1;
    } else {
      process.env.STUDENT_ACTIVATION_CODE_KEY_V1 = ORIGINAL_CODE_KEY;
    }
  });

  it("atomically claims an exact card and creates a secret-free approved invite", async () => {
    const { student, person, email } = await createStudent("success");
    const { card, code } = await issueCard(person.id, email);
    const input = activationInput(student.studentNo.toLowerCase(), code);

    await expect(
      activation.start({
        ...input,
        activationCode: code.toLowerCase().replace(/(.{4})(?=.)/g, "$1-"),
      }),
    ).resolves.toEqual({ accepted: true });

    const [storedCard, request, invite, audit] = await Promise.all([
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: card.id },
      }),
      prisma.studentActivationRequest.findUniqueOrThrow({
        where: { requestTokenHash: sha256(input.requestToken) },
      }),
      prisma.studentInvite.findUniqueOrThrow({
        where: { tokenHash: sha256(input.requestToken) },
      }),
      prisma.auditLog.findFirstOrThrow({
        where: {
          entity: "StudentActivationRequest",
          action: "student-activation-self-service-issued",
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    expect(storedCard.claimedAt).toBeInstanceOf(Date);
    expect(storedCard.usedAt).toBeNull();
    expect(storedCard.failedAttempts).toBe(0);
    expect(request).toMatchObject({
      studentPersonId: person.id,
      approvedById: null,
      verificationMethod: "issued_code",
      studentActivationCardId: card.id,
      studentInviteId: invite.id,
      consumedAt: null,
      invalidatedAt: null,
    });
    expect(request.approvedAt).toBeInstanceOf(Date);
    expect(invite).toMatchObject({
      studentPersonId: person.id,
      tokenHash: sha256(input.requestToken),
      boundEmailSha256: sha256(email),
      usedAt: null,
    });
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 30 * 60_000,
    );
    expect(audit.actorId).toBeNull();
    expect(audit.entityId).toBe(request.id);
    const persisted = JSON.stringify({ request, invite, audit });
    expect(persisted).not.toContain(code);
    expect(persisted).not.toContain(input.requestToken);
    expect(persisted).not.toContain(email);
  });

  it("returns one generic response for unknown and mismatched proofs", async () => {
    const { student, person, email } = await createStudent("generic");
    const { card, code } = await issueCard(person.id, email);
    const cases = [
      activationInput(student.studentNo, "0000000000000000"),
      activationInput(`UNKNOWN-${randomUUID()}`, code),
      activationInput(student.studentNo, code, { dob: "2002-04-18" }),
      {
        ...activationInput(student.studentNo, code),
        activationCode: "contains-u-invalid",
      },
    ];

    for (const input of cases) {
      await expect(activation.start(input)).resolves.toEqual({
        accepted: true,
      });
    }
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      }),
    ).toBe(0);
    const storedCard = await prisma.studentActivationCard.findUniqueOrThrow({
      where: { id: card.id },
    });
    // Only the two syntactically valid attempts that found this live code count.
    expect(storedCard.failedAttempts).toBe(2);
    expect(storedCard.revokedAt).toBeNull();
  });

  it("revokes a live card on its fifth failed identity attempt", async () => {
    const { student, person, email } = await createStudent("fail-limit");
    const { card, code } = await issueCard(person.id, email);

    const wrongDobs = [
      "2002-04-14",
      "2002-04-15",
      "2002-04-16",
      "2002-04-17",
      "2002-04-18",
    ];
    for (const [index, wrongDob] of wrongDobs.entries()) {
      const attempt = index + 1;
      await expect(
        activation.start(
          activationInput(student.studentNo, code, { dob: wrongDob }),
        ),
      ).resolves.toEqual({ accepted: true });
      const current = await prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: card.id },
      });
      expect(current.failedAttempts).toBe(attempt);
      expect(current.revokedAt instanceof Date).toBe(attempt === 5);
    }

    await expect(
      activation.start(activationInput(student.studentNo, code)),
    ).resolves.toEqual({ accepted: true });
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      }),
    ).toBe(0);
    const revocationAudit = await prisma.auditLog.findMany({
      where: {
        entity: "StudentActivationCard",
        entityId: card.id,
        action: "student-activation-card-revoked",
      },
    });
    expect(revocationAudit).toHaveLength(1);
    expect(revocationAudit[0]!.actorId).toBeNull();
    expect(JSON.stringify(revocationAudit[0])).not.toContain(code);
  });

  it("fails closed for lifecycle, email binding, expiry, revocation, and live invites", async () => {
    const now = Date.now();
    const cases: Array<{
      label: string;
      studentOptions?: Parameters<typeof createStudent>[1];
      cardOptions?: Parameters<typeof issueCard>[2];
      liveInvite?: boolean;
    }> = [
      { label: "suspended", studentOptions: { personStatus: "suspended" } },
      { label: "pending", studentOptions: { recordStatus: "pending_payment" } },
      {
        label: "passworded",
        studentOptions: {
          passwordHash: bcrypt.hashSync("Existing-password-2026", 10),
        },
      },
      {
        label: "multi-role",
        studentOptions: { roles: ["student", "faculty"] },
      },
      {
        label: "email-drift",
        cardOptions: { boundEmail: "prior-email@test.local" },
      },
      {
        label: "card-revoked",
        cardOptions: { revokedAt: new Date(now - 60_000) },
      },
      {
        label: "batch-revoked",
        cardOptions: { batchRevokedAt: new Date(now - 60_000) },
      },
      { label: "live-invite", liveInvite: true },
    ];

    for (const testCase of cases) {
      const { student, person, email } = await createStudent(
        testCase.label,
        testCase.studentOptions,
      );
      if (testCase.liveInvite) {
        await prisma.studentInvite.create({
          data: {
            studentPersonId: person.id,
            tokenHash: sha256(`old-invite-${randomUUID()}`),
            boundEmailSha256: sha256(email),
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        });
      }
      const beforeInvites = await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      });
      const { code } = await issueCard(person.id, email, testCase.cardOptions);
      await expect(
        activation.start(activationInput(student.studentNo, code)),
      ).resolves.toEqual({ accepted: true });
      expect(
        await prisma.studentInvite.count({
          where: { studentPersonId: person.id },
        }),
      ).toBe(beforeInvites);
    }
  });

  it("rejects cards and batches once their 24-hour validity window has elapsed", async () => {
    const cardExpired = await createStudent("card-expiry");
    const cardExpiry = await issueCard(
      cardExpired.person.id,
      cardExpired.email,
      {
        expiresAt: new Date(Date.now() + 150),
        batchExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    );
    const batchExpired = await createStudent("batch-expiry");
    const batchExpiry = await issueCard(
      batchExpired.person.id,
      batchExpired.email,
      {
        expiresAt: new Date(Date.now() + 60 * 60_000),
        batchExpiresAt: new Date(Date.now() + 150),
      },
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    await expect(
      activation.start(
        activationInput(cardExpired.student.studentNo, cardExpiry.code),
      ),
    ).resolves.toEqual({ accepted: true });
    await expect(
      activation.start(
        activationInput(batchExpired.student.studentNo, batchExpiry.code),
      ),
    ).resolves.toEqual({ accepted: true });
    expect(
      await prisma.studentInvite.count({
        where: {
          studentPersonId: {
            in: [cardExpired.person.id, batchExpired.person.id],
          },
        },
      }),
    ).toBe(0);
  });

  it("settles concurrent claims with exactly one approved invite", async () => {
    const { student, person, email } = await createStudent("concurrent");
    const { card, code } = await issueCard(person.id, email);
    const inputs = [
      activationInput(student.studentNo, code),
      activationInput(student.studentNo, code),
    ];

    const outcomes = await Promise.all(
      inputs.map((input) => activation.start(input)),
    );
    expect(outcomes).toEqual([{ accepted: true }, { accepted: true }]);

    const [storedCard, invites, requests] = await Promise.all([
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: card.id },
      }),
      prisma.studentInvite.findMany({
        where: { studentPersonId: person.id },
      }),
      prisma.studentActivationRequest.findMany({
        where: {
          studentPersonId: person.id,
          verificationMethod: "issued_code",
        },
      }),
    ]);
    expect(storedCard.claimedAt).toBeInstanceOf(Date);
    expect(storedCard.usedAt).toBeNull();
    expect(invites).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(inputs.map((input) => sha256(input.requestToken))).toContain(
      invites[0]!.tokenHash,
    );
  });

  it("treats a same-card same-token transport retry as a generic idempotent replay", async () => {
    const { student, person, email } = await createStudent("same-token-retry");
    const { card, code } = await issueCard(person.id, email);
    const input = activationInput(student.studentNo, code);

    await expect(activation.start(input)).resolves.toEqual({ accepted: true });
    await expect(activation.start(input)).resolves.toEqual({ accepted: true });

    const [storedCard, invites, requests] = await Promise.all([
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: card.id },
      }),
      prisma.studentInvite.findMany({
        where: { studentPersonId: person.id, usedAt: null },
      }),
      prisma.studentActivationRequest.findMany({
        where: {
          studentPersonId: person.id,
          verificationMethod: "issued_code",
          invalidatedAt: null,
        },
      }),
    ]);
    expect(storedCard).toMatchObject({
      failedAttempts: 0,
      usedAt: null,
      revokedAt: null,
    });
    expect(storedCard.claimedAt).toBeInstanceOf(Date);
    expect(invites).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(invites[0]!.tokenHash).toBe(sha256(input.requestToken));
    expect(requests[0]!.requestTokenHash).toBe(sha256(input.requestToken));
  });

  it("serializes a claim against batch revocation without deadlock or a usable invite", async () => {
    const { student, person, email } = await createStudent("revoke-race");
    const { batch, card, code } = await issueCard(person.id, email);
    const input = activationInput(student.studentNo, code);

    const revoke = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "StudentActivationCardBatch"
        WHERE "id" = ${batch.id}
        FOR UPDATE
      `);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "StudentActivationCard"
        WHERE "batchId" = ${batch.id} AND "usedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `);
      const revokedAt = new Date();
      await tx.studentActivationCardBatch.update({
        where: { id: batch.id },
        data: {
          status: "revoked",
          revokedAt,
          revokedById: issuerId,
          revokeReason: "security_response",
        },
      });
      await tx.studentActivationCard.updateMany({
        where: { batchId: batch.id, usedAt: null },
        data: { revokedAt },
      });
      const requests = await tx.studentActivationRequest.findMany({
        where: {
          studentActivationCard: { is: { batchId: batch.id } },
          consumedAt: null,
          invalidatedAt: null,
        },
        select: { id: true, studentInviteId: true },
      });
      const inviteIds = requests.flatMap((request) =>
        request.studentInviteId ? [request.studentInviteId] : [],
      );
      if (inviteIds.length > 0) {
        await tx.studentInvite.updateMany({
          where: { id: { in: inviteIds }, usedAt: null },
          data: { usedAt: revokedAt },
        });
      }
      await tx.studentActivationRequest.updateMany({
        where: { id: { in: requests.map((request) => request.id) } },
        data: { invalidatedAt: revokedAt },
      });
    });

    await expect(
      Promise.all([activation.start(input), revoke]),
    ).resolves.toEqual([{ accepted: true }, undefined]);

    const [storedBatch, storedCard, invites, requests] = await Promise.all([
      prisma.studentActivationCardBatch.findUniqueOrThrow({
        where: { id: batch.id },
      }),
      prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: card.id },
      }),
      prisma.studentInvite.findMany({
        where: { studentPersonId: person.id },
      }),
      prisma.studentActivationRequest.findMany({
        where: { studentPersonId: person.id },
      }),
    ]);
    expect(storedBatch.status).toBe("revoked");
    expect(storedCard.revokedAt).toBeInstanceOf(Date);
    expect(invites.every((invite) => invite.usedAt !== null)).toBe(true);
    expect(requests.every((request) => request.invalidatedAt !== null)).toBe(
      true,
    );
  });

  it("preserves an already-approved paired invite and rejects browser-token reuse generically", async () => {
    const first = await createStudent("token-first");
    const firstCard = await issueCard(first.person.id, first.email);
    const sharedToken = requestToken();
    await activation.start(
      activationInput(first.student.studentNo, firstCard.code, {
        requestToken: sharedToken,
      }),
    );

    const second = await createStudent("token-second");
    const secondCard = await issueCard(second.person.id, second.email);
    await expect(
      activation.start(
        activationInput(second.student.studentNo, secondCard.code, {
          requestToken: sharedToken,
        }),
      ),
    ).resolves.toEqual({ accepted: true });
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: second.person.id },
      }),
    ).toBe(0);
    expect(
      await prisma.studentActivationCard.findUniqueOrThrow({
        where: { id: secondCard.card.id },
      }),
    ).toMatchObject({ usedAt: null });

    const legacy = await createStudent("legacy-approved");
    const legacyToken = requestToken();
    const legacyInvite = await prisma.studentInvite.create({
      data: {
        studentPersonId: legacy.person.id,
        tokenHash: sha256(legacyToken),
        boundEmailSha256: sha256(legacy.email),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const legacyRequest = await prisma.studentActivationRequest.create({
      data: {
        studentPersonId: legacy.person.id,
        accountKeyHash: sha256(`legacy-account-${randomUUID()}`),
        requestTokenHash: sha256(legacyToken),
        approvalCodeHash: sha256(`legacy-code-${randomUUID()}`),
        expiresAt: legacyInvite.expiresAt,
        approvedAt: new Date(),
        approvedById: issuerId,
        studentInviteId: legacyInvite.id,
      },
    });
    const freshCard = await issueCard(legacy.person.id, legacy.email);
    await expect(
      activation.start(
        activationInput(legacy.student.studentNo, freshCard.code),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(
      await prisma.studentInvite.findUniqueOrThrow({
        where: { id: legacyInvite.id },
      }),
    ).toMatchObject({ usedAt: null });
    expect(
      await prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: legacyRequest.id },
      }),
    ).toMatchObject({ invalidatedAt: null, consumedAt: null });
  });
});
