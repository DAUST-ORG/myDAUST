import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@mydaust/db";
import { HEADERS_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IS_PUBLIC_KEY, ROLES_KEY } from "../auth/decorators.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { GuardiansService } from "../guardians/guardians.service.js";
import {
  StudentActivationPublicController,
  StudentActivationStaffController,
} from "./student-activation.controller.js";
import { StudentActivationService } from "./student-activation.service.js";

/**
 * The activation token and approval code are credentials. This suite accepts
 * TEST_DATABASE_URL only, migrates a random schema, and never falls back to a
 * developer or production database.
 */
const SCHEMA = `student_activation_${randomUUID()
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

const TEN_MINUTES_MS = 10 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;
const EXACT_DOB = "2002-04-19";
const GENERIC_STAFF_MISS =
  "No pending activation request matches those details";
const GENERIC_INVITE_ERROR = "That invitation link is invalid or has expired";
const CODE_KEY = randomBytes(32).toString("base64url");
const IDENTITY_VERIFICATION = {
  identityVerification: "official_photo_credential_checked_in_person",
} as const;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CODE_KEY = process.env.STUDENT_ACTIVATION_CODE_KEY_V1;

let prisma: PrismaClient;
let activation: StudentActivationService;
let guardians: GuardiansService;
let registrarId: string;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitMilliseconds(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function expectPublicResponseShape(result: {
  requestToken: string;
  approvalCode: string;
  requestExpiresAt: Date;
}) {
  expect(Object.keys(result).sort()).toEqual([
    "approvalCode",
    "requestExpiresAt",
    "requestToken",
  ]);
  expect(result.requestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.approvalCode).toMatch(/^\d{6}$/);
  expect(new Date(result.requestExpiresAt).getTime()).toBeGreaterThan(
    Date.now(),
  );
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
    liveInvite?: boolean;
    sessionVersion?: number;
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
      sessionVersion: options.sessionVersion ?? 3,
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
  if (options.liveInvite) {
    await prisma.studentInvite.create({
      data: {
        studentPersonId: person.id,
        tokenHash: sha256(`preexisting-${suffix}`),
        boundEmailSha256: sha256(email),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
  }
  return { person, student, email };
}

function executionContext(
  controller: object,
  handler: (...args: never[]) => unknown,
  roles?: string[],
) {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () =>
        roles
          ? { user: { personId: "role-test-person", roles } }
          : { user: undefined },
    }),
  } as never;
}

async function activationRow(requestToken: string) {
  return prisma.studentActivationRequest.findUniqueOrThrow({
    where: { requestTokenHash: sha256(requestToken) },
  });
}

describe.skipIf(!DB_URL)("paired student activation security", () => {
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
    guardians = new GuardiansService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const registrar = await prisma.person.create({
      data: {
        email: `activation-registrar-${randomUUID()}@test.local`,
        firstName: "Activation",
        lastName: "Registrar",
        kind: "staff",
        roles: ["registrar"],
        status: "active",
      },
    });
    registrarId = registrar.id;
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

  it("makes only request and status public and limits staff actions to admin or registrar", async () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const publicStart = StudentActivationPublicController.prototype.start;
    const publicStatus = StudentActivationPublicController.prototype.status;
    const staffResolve = StudentActivationStaffController.prototype.resolve;
    const staffApprove = StudentActivationStaffController.prototype.approve;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, publicStart)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, publicStatus)).toBe(true);
    expect(
      Reflect.getMetadata(ROLES_KEY, StudentActivationStaffController),
    ).toEqual(["admin", "registrar"]);
    expect(Reflect.getMetadata(ROLES_KEY, staffResolve)).toEqual([
      "admin",
      "registrar",
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, staffApprove)).toEqual([
      "admin",
      "registrar",
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, publicStart)).toBe(202);

    expect(
      guard.canActivate(
        executionContext(StudentActivationPublicController, publicStart),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        executionContext(StudentActivationStaffController, staffResolve, [
          "registrar",
        ]),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        executionContext(StudentActivationStaffController, staffApprove, [
          "admin",
        ]),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        executionContext(StudentActivationStaffController, staffApprove, [
          "student",
        ]),
      ),
    ).toThrow("Insufficient role");

    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      publicStart,
    ) as Array<{ name: string; value: string }>;
    expect(
      Object.fromEntries(headers.map((header) => [header.name, header.value])),
    ).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });

    const approve = vi.fn().mockResolvedValue({ kind: "approved" });
    const staffController = new StudentActivationStaffController({
      approve,
    } as never);
    expect(() =>
      staffController.approve(
        { personId: "registrar-1", roles: ["registrar"] } as never,
        "2b966215-a9d4-475f-8587-d3854cdb7c2f",
        { approvalCode: "123456", identityVerified: false },
      ),
    ).toThrow();
    await expect(
      staffController.approve(
        { personId: "registrar-1", roles: ["registrar"] } as never,
        "2b966215-a9d4-475f-8587-d3854cdb7c2f",
        { approvalCode: "123456", identityVerified: true },
      ),
    ).resolves.toEqual({ kind: "approved" });
    expect(approve).toHaveBeenCalledWith(
      "registrar-1",
      "2b966215-a9d4-475f-8587-d3854cdb7c2f",
      "123456",
      IDENTITY_VERIFICATION,
    );
  });

  it("returns the same opaque shape for wrong identity, strict-DOB failure, and ineligible accounts", async () => {
    const wrongDob = await createStudent("wrong-dob");
    const invalidDate = await createStudent("invalid-date");
    const suspended = await createStudent("suspended", {
      personStatus: "suspended",
    });
    const pending = await createStudent("pending", {
      recordStatus: "pending_payment",
    });
    const existingPassword = await createStudent("has-password", {
      passwordHash: bcrypt.hashSync("Existing-student-password", 10),
    });
    const mustChange = await createStudent("must-change", {
      mustChangePassword: true,
    });
    const multiRole = await createStudent("multi-role", {
      roles: ["student", "faculty"],
    });
    const liveInvite = await createStudent("live-invite", {
      liveInvite: true,
    });
    const valid = await createStudent("exact-date");

    const cases = [
      {
        studentNo: `UNKNOWN-${randomUUID()}`,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: wrongDob.student.studentNo,
        dob: "2002-04-18",
        expectedPersonId: null,
      },
      {
        studentNo: invalidDate.student.studentNo,
        dob: "2002-02-30",
        expectedPersonId: null,
      },
      {
        studentNo: suspended.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: pending.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: existingPassword.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: mustChange.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: multiRole.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: liveInvite.student.studentNo,
        dob: EXACT_DOB,
        expectedPersonId: null,
      },
      {
        studentNo: valid.student.studentNo.toLowerCase(),
        dob: EXACT_DOB,
        expectedPersonId: valid.person.id,
      },
    ];

    for (const testCase of cases) {
      const beforeMs = Date.now();
      const result = await activation.start(testCase.studentNo, testCase.dob);
      const afterMs = Date.now();
      expectPublicResponseShape(result);
      const row = await activationRow(result.requestToken);
      expect(row.studentPersonId).toBe(testCase.expectedPersonId);
      expect(row.expiresAt).toEqual(new Date(result.requestExpiresAt));
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        beforeMs + TEN_MINUTES_MS,
      );
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
        afterMs + TEN_MINUTES_MS,
      );
      expect(row.requestTokenHash).toBe(sha256(result.requestToken));
      expect(row.approvalCodeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.approvalCodeHash).not.toBe(result.approvalCode);
      const stored = JSON.stringify(row);
      expect(stored).not.toContain(result.requestToken);
      expect(stored).not.toContain(result.approvalCode);
      expect(stored).not.toContain(testCase.dob);
      expect(stored).not.toContain(testCase.studentNo);
    }

    const validIdentity = await prisma.person.findUniqueOrThrow({
      where: { id: valid.person.id },
    });
    expect(validIdentity).toMatchObject({
      email: valid.email,
      passwordHash: null,
      mustChangePassword: false,
      sessionVersion: valid.person.sessionVersion,
    });
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: valid.person.id },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entity: "StudentActivationRequest" },
      }),
    ).toBe(0);
  });

  it("settles concurrent starts with one durable real request and only one usable pairing", async () => {
    const { student, person } = await createStudent("start-race");
    const results = await Promise.all([
      activation.start(student.studentNo, EXACT_DOB),
      activation.start(student.studentNo, EXACT_DOB),
    ]);
    results.forEach(expectPublicResponseShape);

    const rows = await prisma.studentActivationRequest.findMany({
      where: {
        studentPersonId: person.id,
        approvedAt: null,
        consumedAt: null,
        invalidatedAt: null,
      },
    });
    expect(rows).toHaveLength(1);
    const winnerRows = results.filter(
      (result) => sha256(result.requestToken) === rows[0]!.requestTokenHash,
    );
    expect(winnerRows).toHaveLength(1);

    const resolves = await Promise.allSettled(
      results.map((result) =>
        activation.resolveForStaff(student.studentNo, result.approvalCode),
      ),
    );
    expect(
      resolves.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      resolves.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      (
        resolves.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({ message: GENERIC_STAFF_MISS });
    expect(rows[0]!.accountKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.accountKeyHash).not.toBe(sha256(student.studentNo));

    // A corrected DOB must neither disclose nor rotate a still-live request for
    // the same real person. Once the old request expires, the new exact pair can
    // replace it without violating the database's per-person uniqueness guard.
    const correctedDob = "2002-04-20";
    await prisma.student.update({
      where: { id: student.id },
      data: { dateOfBirth: new Date(`${correctedDob}T00:00:00.000Z`) },
    });
    const liveRetry = await activation.start(student.studentNo, correctedDob);
    expectPublicResponseShape(liveRetry);
    expect(
      await prisma.studentActivationRequest.findUnique({
        where: { requestTokenHash: sha256(liveRetry.requestToken) },
      }),
    ).toBeNull();
    expect(
      await prisma.studentActivationRequest.count({
        where: {
          studentPersonId: person.id,
          approvedAt: null,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).toBe(1);

    await prisma.studentActivationRequest.update({
      where: { id: rows[0]!.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const afterExpiry = await activation.start(student.studentNo, correctedDob);
    const replacement = await activationRow(afterExpiry.requestToken);
    expect(replacement.studentPersonId).toBe(person.id);
    expect(
      (
        await prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: rows[0]!.id },
        })
      ).invalidatedAt,
    ).toBeInstanceOf(Date);
    await expect(
      activation.status(winnerRows[0]!.requestToken),
    ).resolves.toEqual({ status: "expired" });
    expect(
      await prisma.studentActivationRequest.count({
        where: {
          studentPersonId: person.id,
          approvedAt: null,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).toBe(1);

    const staleDecoy = await activation.start(
      `UNKNOWN-CLEANUP-${randomUUID()}`,
      EXACT_DOB,
    );
    const staleDecoyRow = await activationRow(staleDecoy.requestToken);
    expect(staleDecoyRow.studentPersonId).toBeNull();
    await prisma.studentActivationRequest.update({
      where: { id: staleDecoyRow.id },
      data: {
        expiresAt: new Date(Date.now() - 61 * 60_000),
        invalidatedAt: new Date(Date.now() - 60 * 60_000),
      },
    });
    await activation.start(`UNKNOWN-TRIGGER-${randomUUID()}`, EXACT_DOB);
    expect(
      await prisma.studentActivationRequest.findUnique({
        where: { id: staleDecoyRow.id },
      }),
    ).toBeNull();
  });

  it("approves once, links the same token for 30 minutes, then consumes it through bcrypt redemption", async () => {
    const { student, person, email } = await createStudent("full-flow", {
      sessionVersion: 8,
    });
    const started = await activation.start(student.studentNo, EXACT_DOB);
    const request = await activationRow(started.requestToken);

    await expect(
      activation.status(randomBytes(32).toString("base64url")),
    ).resolves.toEqual({ status: "pending" });
    await expect(activation.status(started.requestToken)).resolves.toEqual({
      status: "pending",
    });

    const wrongIdError = await activation
      .resolveForStaff(`WRONG-${student.studentNo}`, started.approvalCode)
      .catch((error: unknown) => error);
    const wrongCodeError = await activation
      .resolveForStaff(student.studentNo, "999999")
      .catch((error: unknown) => error);
    expect(wrongIdError).toMatchObject({ message: GENERIC_STAFF_MISS });
    expect(wrongCodeError).toMatchObject({ message: GENERIC_STAFF_MISS });

    const resolved = await activation.resolveForStaff(
      student.studentNo,
      started.approvalCode,
    );
    expect(resolved).toMatchObject({
      requestId: request.id,
      studentId: student.id,
      studentNo: student.studentNo,
    });
    expect(resolved).not.toHaveProperty("requestToken");
    expect(resolved).not.toHaveProperty("approvalCode");

    const beforeApprove = Date.now();
    const approved = await activation.approve(
      registrarId,
      request.id,
      started.approvalCode,
      IDENTITY_VERIFICATION,
    );
    const afterApprove = Date.now();
    expect(approved).toMatchObject({
      kind: "approved",
      studentId: student.id,
      studentNo: student.studentNo,
    });
    expect(approved).not.toHaveProperty("requestToken");
    expect(approved).not.toHaveProperty("approvalCode");
    expect(approved.inviteExpiresAt.getTime()).toBeGreaterThanOrEqual(
      beforeApprove + THIRTY_MINUTES_MS,
    );
    expect(approved.inviteExpiresAt.getTime()).toBeLessThanOrEqual(
      afterApprove + THIRTY_MINUTES_MS,
    );

    const [approvedRequest, invite, identityBeforeRedemption, approvalAudits] =
      await Promise.all([
        prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
        prisma.studentInvite.findFirstOrThrow({
          where: { studentPersonId: person.id },
        }),
        prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
        prisma.auditLog.findMany({
          where: {
            entity: "StudentActivationRequest",
            entityId: request.id,
            action: "student-activation-approved",
          },
        }),
      ]);
    expect(approvedRequest).toMatchObject({
      approvedById: registrarId,
      studentInviteId: invite.id,
      consumedAt: null,
      invalidatedAt: null,
    });
    expect(invite).toMatchObject({
      tokenHash: sha256(started.requestToken),
      boundEmailSha256: sha256(email),
      usedAt: null,
    });
    expect(invite.expiresAt).toEqual(approved.inviteExpiresAt);
    expect(identityBeforeRedemption).toMatchObject({
      email,
      passwordHash: null,
      mustChangePassword: false,
      sessionVersion: person.sessionVersion,
    });
    expect(approvalAudits).toHaveLength(1);
    expect(approvalAudits[0]!.data).toMatchObject(IDENTITY_VERIFICATION);
    const approvalAuditJson = JSON.stringify(approvalAudits);
    for (const forbidden of [
      started.requestToken,
      started.approvalCode,
      request.requestTokenHash,
      request.approvalCodeHash,
      student.studentNo,
      EXACT_DOB,
      email,
    ]) {
      expect(approvalAuditJson).not.toContain(forbidden);
    }
    await expect(activation.status(started.requestToken)).resolves.toEqual({
      status: "approved",
    });
    await expect(
      activation.approve(
        registrarId,
        request.id,
        started.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id },
      }),
    ).toBe(1);

    const password = "Student-selected-password-2026";
    await expect(
      guardians.redeemInvite(started.requestToken, password),
    ).resolves.toEqual({ ok: true, email });
    const [redeemedPerson, redeemedInvite, consumedRequest, passwordAudits] =
      await Promise.all([
        prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
        prisma.studentInvite.findUniqueOrThrow({ where: { id: invite.id } }),
        prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
        prisma.auditLog.findMany({
          where: {
            entity: "Person",
            entityId: person.id,
            action: "student-password-set",
          },
        }),
      ]);
    expect(redeemedPerson.sessionVersion).toBe(person.sessionVersion + 1);
    expect(redeemedPerson.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(password, redeemedPerson.passwordHash!)).toBe(
      true,
    );
    expect(redeemedInvite.usedAt).toBeInstanceOf(Date);
    expect(consumedRequest.consumedAt).toEqual(redeemedInvite.usedAt);
    expect(passwordAudits).toHaveLength(1);
    expect(JSON.stringify(passwordAudits)).not.toContain(password);
    await expect(activation.status(started.requestToken)).resolves.toEqual({
      status: "expired",
    });
    await expect(
      guardians.redeemInvite(
        started.requestToken,
        "Replay-password-must-never-win",
      ),
    ).rejects.toMatchObject({ message: GENERIC_INVITE_ERROR });
  });

  it("settles approval races without discarding an approved near-expiry bearer", async () => {
    const { student, person, email } = await createStudent("approve-race");
    const started = await activation.start(student.studentNo, EXACT_DOB);
    const request = await activationRow(started.requestToken);

    const results = await Promise.allSettled([
      activation.approve(
        registrarId,
        request.id,
        started.approvalCode,
        IDENTITY_VERIFICATION,
      ),
      activation.approve(
        registrarId,
        request.id,
        started.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      (
        results.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({ message: GENERIC_STAFF_MISS });

    const [identity, invites, auditRows] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
      prisma.studentInvite.findMany({
        where: { studentPersonId: person.id },
      }),
      prisma.auditLog.findMany({
        where: {
          entity: "StudentActivationRequest",
          entityId: request.id,
          action: "student-activation-approved",
        },
      }),
    ]);
    expect(identity).toMatchObject({
      email,
      passwordHash: null,
      mustChangePassword: false,
      sessionVersion: person.sessionVersion,
    });
    expect(invites).toHaveLength(1);
    expect(invites[0]!.tokenHash).toBe(sha256(started.requestToken));
    expect(auditRows).toHaveLength(1);

    const nearExpiry = await createStudent("status-approval-race");
    const nearExpiryStart = await activation.start(
      nearExpiry.student.studentNo,
      EXACT_DOB,
    );
    const nearExpiryRequest = await activationRow(nearExpiryStart.requestToken);
    const requestExpiresAt = new Date(Date.now() + 1_500);
    await prisma.studentActivationRequest.update({
      where: { id: nearExpiryRequest.id },
      data: { expiresAt: requestExpiresAt },
    });

    // Pause approval after it owns the activation-request row lock and captured
    // a pre-expiry clock, but before it locks the Student row. Status then reads
    // the old committed request after expiry and blocks its invalidation CAS on
    // the approval lock. Once released, the CAS must lose and re-read approved.
    const approvalOwnsRequest = signal();
    const releaseApproval = signal();
    const barrierPrisma = {
      async $transaction<T>(
        work: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: {
          isolationLevel?: Prisma.TransactionIsolationLevel;
          maxWait?: number;
          timeout?: number;
        },
      ) {
        return prisma.$transaction(async (tx) => {
          const proxied = new Proxy(tx, {
            get(target, property, receiver) {
              if (property === "$queryRaw") {
                return async (...args: unknown[]) => {
                  const query = args[0] as
                    { sql?: string; text?: string } | undefined;
                  const rendered = query?.sql ?? query?.text ?? "";
                  if (
                    rendered.includes('FROM "Student"') &&
                    rendered.includes('WHERE "personId"')
                  ) {
                    approvalOwnsRequest.resolve();
                    await releaseApproval.promise;
                  }
                  return Reflect.apply(target.$queryRaw, target, args);
                };
              }
              const value = Reflect.get(target, property, receiver) as unknown;
              return typeof value === "function" ? value.bind(target) : value;
            },
          }) as Prisma.TransactionClient;
          return work(proxied);
        }, options);
      },
    };
    const barrierActivation = new StudentActivationService(
      barrierPrisma as never,
    );
    const statusReachedCas = signal();
    const statusPrisma = {
      studentActivationRequest: {
        findUnique: (args: never) =>
          prisma.studentActivationRequest.findUnique(args),
        updateMany: (args: never) => {
          statusReachedCas.resolve();
          return prisma.studentActivationRequest.updateMany(args);
        },
      },
      studentInvite: {
        findUnique: (args: never) => prisma.studentInvite.findUnique(args),
      },
    };
    const statusActivation = new StudentActivationService(
      statusPrisma as never,
    );
    const approvalPromise = barrierActivation.approve(
      registrarId,
      nearExpiryRequest.id,
      nearExpiryStart.approvalCode,
      IDENTITY_VERIFICATION,
    );
    try {
      await Promise.race([
        approvalOwnsRequest.promise,
        waitMilliseconds(3_000).then(() => {
          throw new Error("Approval did not reach the Student lock barrier");
        }),
      ]);
      await waitMilliseconds(requestExpiresAt.getTime() - Date.now() + 50);
      const statusPromise = statusActivation.status(
        nearExpiryStart.requestToken,
      );
      await Promise.race([
        statusReachedCas.promise,
        waitMilliseconds(3_000).then(() => {
          throw new Error("Status did not reach the expiry CAS barrier");
        }),
      ]);
      releaseApproval.resolve();
      await expect(approvalPromise).resolves.toMatchObject({
        kind: "approved",
        studentId: nearExpiry.student.id,
      });
      await expect(statusPromise).resolves.toEqual({ status: "approved" });
    } finally {
      releaseApproval.resolve();
    }
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: nearExpiry.person.id },
      }),
    ).toBe(1);
  });

  it("expires requests at ten minutes and burns approval when identity state drifts", async () => {
    const expiredStudent = await createStudent("expired-request");
    const expiredStart = await activation.start(
      expiredStudent.student.studentNo,
      EXACT_DOB,
    );
    const expiredRequest = await activationRow(expiredStart.requestToken);
    await prisma.studentActivationRequest.update({
      where: { id: expiredRequest.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(activation.status(expiredStart.requestToken)).resolves.toEqual(
      {
        status: "expired",
      },
    );
    await expect(
      activation.resolveForStaff(
        expiredStudent.student.studentNo,
        expiredStart.approvalCode,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    await expect(
      activation.approve(
        registrarId,
        expiredRequest.id,
        expiredStart.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    expect(
      (
        await prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: expiredRequest.id },
        })
      ).invalidatedAt,
    ).toBeInstanceOf(Date);
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: expiredStudent.person.id },
      }),
    ).toBe(0);

    const driftedStudent = await createStudent("approval-drift");
    const driftedStart = await activation.start(
      driftedStudent.student.studentNo,
      EXACT_DOB,
    );
    const driftedRequest = await activationRow(driftedStart.requestToken);
    await prisma.person.update({
      where: { id: driftedStudent.person.id },
      data: { roles: ["student", "faculty"] },
    });
    await expect(
      activation.approve(
        registrarId,
        driftedRequest.id,
        driftedStart.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });

    const [driftedIdentity, invalidatedRequest, driftInvites, driftAudits] =
      await Promise.all([
        prisma.person.findUniqueOrThrow({
          where: { id: driftedStudent.person.id },
        }),
        prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: driftedRequest.id },
        }),
        prisma.studentInvite.findMany({
          where: { studentPersonId: driftedStudent.person.id },
        }),
        prisma.auditLog.findMany({
          where: {
            entity: "StudentActivationRequest",
            entityId: driftedRequest.id,
            action: "student-activation-invalidated",
          },
        }),
      ]);
    expect(driftedIdentity.passwordHash).toBeNull();
    expect(driftedIdentity.email).toBe(driftedStudent.email);
    expect(driftedIdentity.sessionVersion).toBe(
      driftedStudent.person.sessionVersion,
    );
    expect(invalidatedRequest.invalidatedAt).toBeInstanceOf(Date);
    expect(driftInvites).toHaveLength(0);
    expect(driftAudits).toHaveLength(1);
    const auditJson = JSON.stringify(driftAudits);
    for (const forbidden of [
      driftedStart.requestToken,
      driftedStart.approvalCode,
      driftedRequest.requestTokenHash,
      driftedRequest.approvalCodeHash,
      driftedStudent.student.studentNo,
      EXACT_DOB,
      driftedStudent.email,
    ]) {
      expect(auditJson).not.toContain(forbidden);
    }

    const numberDrift = await createStudent("number-hmac-drift");
    const originalStudentNo = numberDrift.student.studentNo;
    const numberDriftStart = await activation.start(
      originalStudentNo,
      EXACT_DOB,
    );
    const numberDriftRequest = await activationRow(
      numberDriftStart.requestToken,
    );
    const changedStudentNo = `${originalStudentNo}-NEW`;
    await prisma.student.update({
      where: { id: numberDrift.student.id },
      data: { studentNo: changedStudentNo },
    });
    await expect(
      activation.resolveForStaff(
        changedStudentNo,
        numberDriftStart.approvalCode,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    await expect(
      activation.resolveForStaff(
        originalStudentNo,
        numberDriftStart.approvalCode,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    await expect(
      activation.approve(
        registrarId,
        numberDriftRequest.id,
        numberDriftStart.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    expect(
      (
        await prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: numberDriftRequest.id },
        })
      ).invalidatedAt,
    ).toBeInstanceOf(Date);
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: numberDrift.person.id },
      }),
    ).toBe(0);

    const dobDrift = await createStudent("dob-hmac-drift");
    const dobDriftStart = await activation.start(
      dobDrift.student.studentNo,
      EXACT_DOB,
    );
    const dobDriftRequest = await activationRow(dobDriftStart.requestToken);
    await expect(
      activation.resolveForStaff(
        dobDrift.student.studentNo,
        dobDriftStart.approvalCode,
      ),
    ).resolves.toMatchObject({ requestId: dobDriftRequest.id });
    const changedDob = "2002-04-20";
    await prisma.student.update({
      where: { id: dobDrift.student.id },
      data: { dateOfBirth: new Date(`${changedDob}T00:00:00.000Z`) },
    });
    await expect(
      activation.resolveForStaff(
        dobDrift.student.studentNo,
        dobDriftStart.approvalCode,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    await expect(
      activation.approve(
        registrarId,
        dobDriftRequest.id,
        dobDriftStart.approvalCode,
        IDENTITY_VERIFICATION,
      ),
    ).rejects.toMatchObject({ message: GENERIC_STAFF_MISS });
    const [invalidDobRequest, dobInvites, identityDriftAudits] =
      await Promise.all([
        prisma.studentActivationRequest.findUniqueOrThrow({
          where: { id: dobDriftRequest.id },
        }),
        prisma.studentInvite.findMany({
          where: { studentPersonId: dobDrift.person.id },
        }),
        prisma.auditLog.findMany({
          where: {
            entity: "StudentActivationRequest",
            entityId: {
              in: [numberDriftRequest.id, dobDriftRequest.id],
            },
            action: "student-activation-invalidated",
          },
        }),
      ]);
    expect(invalidDobRequest.invalidatedAt).toBeInstanceOf(Date);
    expect(dobInvites).toHaveLength(0);
    expect(identityDriftAudits).toHaveLength(2);
    const identityDriftAuditJson = JSON.stringify(identityDriftAudits);
    for (const forbidden of [
      originalStudentNo,
      changedStudentNo,
      EXACT_DOB,
      changedDob,
      numberDriftStart.requestToken,
      numberDriftStart.approvalCode,
      dobDriftStart.requestToken,
      dobDriftStart.approvalCode,
    ]) {
      expect(identityDriftAuditJson).not.toContain(forbidden);
    }
  });
});
