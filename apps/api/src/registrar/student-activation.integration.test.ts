import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StudentActivationService } from "./student-activation.service.js";

/**
 * Browser completion tokens are credentials. This suite accepts
 * TEST_DATABASE_URL only, migrates a random schema, and never falls back to a
 * developer or production database.
 */
const SCHEMA = `student_activation_direct_${randomUUID()
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
const TEST_SESSION_SECRET = "student-activation-integration-secret";
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_CODE_KEY = process.env.STUDENT_ACTIVATION_CODE_KEY_V1;

let prisma: PrismaClient;
let activation: StudentActivationService;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function accountHash(studentNo: string, dob: string): string {
  return createHmac("sha256", TEST_SESSION_SECRET)
    .update("mydaust:student-activation-account:v3\0")
    .update(studentNo.normalize("NFKC").trim().toUpperCase())
    .update("\0")
    .update(dob)
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

function activationInput(
  studentNo: string,
  overrides: Partial<{ dob: string; requestToken: string }> = {},
) {
  return {
    studentNo,
    dob: overrides.dob ?? EXACT_DOB,
    requestToken: overrides.requestToken ?? requestToken(),
  };
}

describe.skipIf(!DB_URL)("student ID and DOB activation", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    delete process.env.STUDENT_ACTIVATION_CODE_KEY_V1;
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    activation = new StudentActivationService(prisma as never);
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
    if (ORIGINAL_CODE_KEY === undefined) {
      delete process.env.STUDENT_ACTIVATION_CODE_KEY_V1;
    } else {
      process.env.STUDENT_ACTIVATION_CODE_KEY_V1 = ORIGINAL_CODE_KEY;
    }
  });

  it("atomically issues a 30-minute browser-bound invite without an activation code", async () => {
    const { student, person, email } = await createStudent("success");
    const input = activationInput(student.studentNo.toLowerCase());

    await expect(activation.start(input)).resolves.toEqual({ accepted: true });

    const [request, invite, audit] = await Promise.all([
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

    expect(request).toMatchObject({
      studentPersonId: person.id,
      accountKeyHash: accountHash(student.studentNo, EXACT_DOB),
      approvalCodeHash: null,
      approvedById: null,
      verificationMethod: "student_id_dob",
      studentActivationCardId: null,
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
    expect(audit).toMatchObject({ actorId: null, entityId: request.id });
    expect(audit.data).toMatchObject({
      verificationMethod: "student_id_dob",
    });
    const persisted = JSON.stringify({ request, invite, audit });
    expect(persisted).not.toContain(input.requestToken);
    expect(persisted).not.toContain(email);
    expect(persisted).not.toContain(EXACT_DOB);
  });

  it("returns one generic response for unknown, mismatched, and malformed identity proofs", async () => {
    const { student, person } = await createStudent("generic");
    const cases = [
      activationInput(`UNKNOWN-${randomUUID()}`),
      activationInput(student.studentNo, { dob: "2002-04-18" }),
      activationInput(student.studentNo, { dob: "2002-02-30" }),
      activationInput(""),
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
  });

  it("fails closed for lifecycle, role, password, and live-invite state", async () => {
    const cases: Array<{
      label: string;
      options?: Parameters<typeof createStudent>[1];
      liveInvite?: boolean;
    }> = [
      { label: "suspended", options: { personStatus: "suspended" } },
      { label: "pending", options: { recordStatus: "pending_payment" } },
      {
        label: "passworded",
        options: {
          passwordHash: bcrypt.hashSync("Existing-password-2026", 10),
        },
      },
      { label: "multi-role", options: { roles: ["student", "faculty"] } },
      { label: "must-change", options: { mustChangePassword: true } },
      { label: "live-invite", liveInvite: true },
    ];

    for (const testCase of cases) {
      const { student, person, email } = await createStudent(
        testCase.label,
        testCase.options,
      );
      if (testCase.liveInvite) {
        await prisma.studentInvite.create({
          data: {
            studentPersonId: person.id,
            tokenHash: sha256(`live-${randomUUID()}`),
            boundEmailSha256: sha256(email),
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        });
      }
      const before = await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      });
      await expect(
        activation.start(activationInput(student.studentNo)),
      ).resolves.toEqual({ accepted: true });
      expect(
        await prisma.studentInvite.count({
          where: { studentPersonId: person.id },
        }),
      ).toBe(before);
    }
  });

  it("rejects a case-insensitive duplicate current login email", async () => {
    const { student, person, email } = await createStudent("email-duplicate");
    await prisma.person.create({
      data: {
        email: email.toUpperCase(),
        firstName: "Duplicate",
        lastName: "Email",
        kind: "staff",
        roles: ["registrar"],
        status: "active",
      },
    });

    await expect(
      activation.start(activationInput(student.studentNo)),
    ).resolves.toEqual({ accepted: true });
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      }),
    ).toBe(0);
  });

  it("burns expired setup state before issuing one replacement", async () => {
    const { student, person, email } = await createStudent("expired-retry");
    const oldToken = requestToken();
    const oldInvite = await prisma.studentInvite.create({
      data: {
        studentPersonId: person.id,
        tokenHash: sha256(oldToken),
        boundEmailSha256: sha256(email),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const oldRequest = await prisma.studentActivationRequest.create({
      data: {
        studentPersonId: person.id,
        accountKeyHash: sha256(`old-account-${randomUUID()}`),
        requestTokenHash: sha256(oldToken),
        approvalCodeHash: sha256(`old-code-${randomUUID()}`),
        expiresAt: oldInvite.expiresAt,
        approvedAt: new Date(Date.now() - 120_000),
        studentInviteId: oldInvite.id,
      },
    });

    await activation.start(activationInput(student.studentNo));

    expect(
      await prisma.studentInvite.findUniqueOrThrow({
        where: { id: oldInvite.id },
      }),
    ).toMatchObject({ usedAt: expect.any(Date) });
    expect(
      await prisma.studentActivationRequest.findUniqueOrThrow({
        where: { id: oldRequest.id },
      }),
    ).toMatchObject({ invalidatedAt: expect.any(Date) });
    expect(
      await prisma.studentInvite.count({
        where: {
          studentPersonId: person.id,
          usedAt: null,
          expiresAt: { gte: new Date() },
        },
      }),
    ).toBe(1);
  });

  it("settles concurrent starts with exactly one live invite", async () => {
    const { student, person } = await createStudent("concurrent");
    const inputs = [
      activationInput(student.studentNo),
      activationInput(student.studentNo),
    ];

    await expect(
      Promise.all(inputs.map((input) => activation.start(input))),
    ).resolves.toEqual([{ accepted: true }, { accepted: true }]);

    const [invites, requests] = await Promise.all([
      prisma.studentInvite.findMany({
        where: { studentPersonId: person.id, usedAt: null },
      }),
      prisma.studentActivationRequest.findMany({
        where: {
          studentPersonId: person.id,
          verificationMethod: "student_id_dob",
          invalidatedAt: null,
        },
      }),
    ]);
    expect(invites).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(inputs.map((input) => sha256(input.requestToken))).toContain(
      invites[0]!.tokenHash,
    );
  });

  it("treats an exact browser-token retry as a generic idempotent replay", async () => {
    const { student, person } = await createStudent("same-token-retry");
    const input = activationInput(student.studentNo);

    await expect(activation.start(input)).resolves.toEqual({ accepted: true });
    await expect(activation.start(input)).resolves.toEqual({ accepted: true });

    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id, usedAt: null },
      }),
    ).toBe(1);
    expect(
      await prisma.studentActivationRequest.count({
        where: {
          studentPersonId: person.id,
          verificationMethod: "student_id_dob",
        },
      }),
    ).toBe(1);
  });

  it("rolls back a browser-token collision against a different account", async () => {
    const first = await createStudent("token-first");
    const second = await createStudent("token-second");
    const sharedToken = requestToken();

    await activation.start(
      activationInput(first.student.studentNo, { requestToken: sharedToken }),
    );
    await expect(
      activation.start(
        activationInput(second.student.studentNo, {
          requestToken: sharedToken,
        }),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: first.person.id },
      }),
    ).toBe(1);
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: second.person.id },
      }),
    ).toBe(0);
  });
});
