import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuardiansService } from "../guardians/guardians.service.js";
import { StudentActivationService } from "./student-activation.service.js";
import { StudentAccountService } from "./student-account.service.js";

const SCHEMA = `student_account_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const DB_URL = TEST_DATABASE_URL
  ? (() => {
      const url = new URL(TEST_DATABASE_URL);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_PORTAL_ORIGIN = process.env.PORTAL_ORIGIN;

let prisma: PrismaClient;
let accounts: StudentAccountService;
let guardians: GuardiansService;
let activation: StudentActivationService;
let actorId: string;

async function createStudent(label: string, password?: string) {
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const person = await prisma.person.create({
    data: {
      email: `${label}-${suffix}@mydaust.com`,
      firstName: label,
      lastName: "Student",
      kind: "student",
      roles: ["student"],
      status: "active",
      passwordHash,
      sessionVersion: password ? 4 : 0,
    },
  });
  const student = await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `ACCOUNT-${suffix}`,
      recordStatus: "active",
      dateOfBirth: new Date("2002-04-19T00:00:00.000Z"),
    },
  });
  return { person, student };
}

describe.skipIf(!DB_URL)("registrar student account management", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "student-account-integration-secret";
    process.env.PORTAL_ORIGIN = "https://my.test.local";
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    accounts = new StudentAccountService(prisma as never);
    activation = new StudentActivationService(prisma as never);
    guardians = new GuardiansService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    actorId = (
      await prisma.person.create({
        data: {
          email: `registrar-${randomUUID()}@daust.org`,
          firstName: "Test",
          lastName: "Registrar",
          kind: "staff",
          roles: ["registrar"],
        },
      })
    ).id;
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
    if (ORIGINAL_PORTAL_ORIGIN === undefined) delete process.env.PORTAL_ORIGIN;
    else process.env.PORTAL_ORIGIN = ORIGINAL_PORTAL_ORIGIN;
  });

  it("issues a one-time temporary password and stores only its hash", async () => {
    const { person, student } = await createStudent("temporary");

    const result = await accounts.issueCredentials(
      actorId,
      student.id,
      "temporary_password",
    );
    expect(result).toMatchObject({
      method: "temporary_password",
      loginEmail: person.email,
      temporaryPassword: expect.any(String),
    });
    if (result.method !== "temporary_password") throw new Error("wrong result");

    const [updated, audit] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: {
          entityId: person.id,
          action: "student-temporary-password-issued",
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    expect(updated).toMatchObject({
      mustChangePassword: true,
      sessionVersion: 1,
      passwordChangedAt: expect.any(Date),
    });
    expect(
      await bcrypt.compare(result.temporaryPassword, updated.passwordHash!),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(result.temporaryPassword);
  });

  it("keeps the old password valid until a reset link is redeemed", async () => {
    const oldPassword = "ExistingPassword9!";
    const newPassword = "ReplacementPassword9!";
    const { person, student } = await createStudent("reset-link", oldPassword);

    const result = await accounts.issueCredentials(
      actorId,
      student.id,
      "setup_link",
    );
    expect(result).toMatchObject({
      method: "setup_link",
      loginEmail: person.email,
      expiresAt: expect.any(Date),
    });
    if (result.method !== "setup_link") throw new Error("wrong result");
    const before = await prisma.person.findUniqueOrThrow({
      where: { id: person.id },
    });
    expect(await bcrypt.compare(oldPassword, before.passwordHash!)).toBe(true);
    expect(before.sessionVersion).toBe(4);
    expect(await accounts.getAccount(student.id)).toMatchObject({
      accountState: "active",
      pendingCredential: { purpose: "password_reset" },
    });

    const token = decodeURIComponent(result.setupUrl.split("#token=")[1]!);
    await expect(guardians.redeemInvite(token, newPassword)).resolves.toEqual({
      ok: true,
      email: person.email,
    });
    const after = await prisma.person.findUniqueOrThrow({
      where: { id: person.id },
    });
    expect(await bcrypt.compare(newPassword, after.passwordHash!)).toBe(true);
    expect(await bcrypt.compare(oldPassword, after.passwordHash!)).toBe(false);
    expect(after.sessionVersion).toBe(5);
    expect(after.passwordChangedAt).toBeInstanceOf(Date);
    expect(
      (await accounts.getAccount(student.id)).pendingCredential,
    ).toBeNull();
  });

  it("rotates a prior setup link so only the newest capability can redeem", async () => {
    const { person, student } = await createStudent("rotate-link");
    const first = await accounts.issueCredentials(
      actorId,
      student.id,
      "setup_link",
    );
    const second = await accounts.issueCredentials(
      actorId,
      student.id,
      "setup_link",
    );
    if (first.method !== "setup_link" || second.method !== "setup_link") {
      throw new Error("wrong result");
    }
    const firstToken = decodeURIComponent(first.setupUrl.split("#token=")[1]!);
    const secondToken = decodeURIComponent(
      second.setupUrl.split("#token=")[1]!,
    );

    await expect(
      guardians.redeemInvite(firstToken, "RotatedPassword9!"),
    ).rejects.toThrow("That invitation link is invalid or has expired");
    await expect(
      guardians.redeemInvite(secondToken, "NewestPassword9!"),
    ).resolves.toEqual({ ok: true, email: person.email });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "student-setup-link-rotated-by-registrar",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.data).toMatchObject({
      studentId: student.id,
      invalidatedInviteCount: 1,
    });
  });

  it("serializes public ID+DOB activation against registrar provisioning", async () => {
    const { person, student } = await createStudent("activation-race");
    const publicToken = `public-${randomUUID()}`;
    const [publicResult, registrarResult] = await Promise.all([
      activation.start({
        studentNo: student.studentNo,
        dob: "2002-04-19",
        requestToken: publicToken,
      }),
      accounts.issueCredentials(actorId, student.id, "temporary_password"),
    ]);
    expect(publicResult).toEqual({ accepted: true });
    if (registrarResult.method !== "temporary_password") {
      throw new Error("wrong result");
    }
    const current = await prisma.person.findUniqueOrThrow({
      where: { id: person.id },
    });
    expect(
      await bcrypt.compare(
        registrarResult.temporaryPassword,
        current.passwordHash!,
      ),
    ).toBe(true);
    expect(
      await prisma.studentInvite.count({
        where: { studentPersonId: person.id, usedAt: null },
      }),
    ).toBe(0);
    await expect(
      guardians.redeemInvite(publicToken, "PublicPassword9!"),
    ).rejects.toThrow("That invitation link is invalid or has expired");
  });

  it("sign-out-all invalidates sessions and every pending credential link", async () => {
    const { person, student } = await createStudent(
      "sign-out",
      "ExistingPassword9!",
    );
    await accounts.issueCredentials(actorId, student.id, "setup_link");

    await expect(
      accounts.signOutAll(actorId, student.id),
    ).resolves.toMatchObject({
      ok: true,
      invalidatedAt: expect.any(Date),
    });
    const [summary, updated, invite, request] = await Promise.all([
      accounts.getAccount(student.id),
      prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
      prisma.studentInvite.findFirstOrThrow({
        where: { studentPersonId: person.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.studentActivationRequest.findFirstOrThrow({
        where: { studentPersonId: person.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    expect(updated.sessionVersion).toBe(5);
    expect(summary.pendingCredential).toBeNull();
    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(request.invalidatedAt).toBeInstanceOf(Date);
  });

  it("does not report unbound or identity-drifted legacy links as pending", async () => {
    const { person, student } = await createStudent("dead-legacy-links");
    await prisma.studentInvite.createMany({
      data: [
        {
          studentPersonId: person.id,
          tokenHash: `null-binding-${randomUUID()}`,
          boundEmailSha256: null,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
        {
          studentPersonId: person.id,
          tokenHash: `wrong-binding-${randomUUID()}`,
          boundEmailSha256: "0".repeat(64),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      ],
    });

    await expect(accounts.getAccount(student.id)).resolves.toMatchObject({
      accountState: "not_activated",
      pendingCredential: null,
    });
  });

  it("updates only contact email and keeps non-active records read-only", async () => {
    const { person, student } = await createStudent("contact");
    await accounts.updateContactEmail(
      actorId,
      student.id,
      "CONTACT@EXAMPLE.TEST",
    );
    const [unchangedPerson, updatedStudent] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: person.id } }),
      prisma.student.findUniqueOrThrow({ where: { id: student.id } }),
    ]);
    expect(unchangedPerson.email).toBe(person.email);
    expect(updatedStudent.personalEmail).toBe("contact@example.test");

    await prisma.student.update({
      where: { id: student.id },
      data: { recordStatus: "archived" },
    });
    await prisma.person.update({
      where: { id: person.id },
      data: { status: "suspended", suspendedAt: new Date() },
    });
    expect(await accounts.getAccount(student.id)).toMatchObject({
      accountState: "archived",
      eligibleForCredentialAction: false,
    });
    await expect(
      accounts.updateContactEmail(actorId, student.id, "other@example.test"),
    ).rejects.toThrow(/read-only/i);
  });
});
