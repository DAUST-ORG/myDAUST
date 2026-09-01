import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { ROLES_KEY } from "../auth/decorators.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { WorkbookCutoverAttestationController } from "./workbook-cutover-attestation.controller.js";
import {
  WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
  WorkbookCutoverAttestationService,
} from "./workbook-cutover-attestation.service.js";

const SCHEMA = `cutover_attestation_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

function authUser(
  personId: string,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    personId,
    roles: ["admin"],
    email: "untrusted-claim@example.test",
    name: "Untrusted Claim",
    ...overrides,
  };
}

describe("WorkbookCutoverAttestationController authorization", () => {
  it("guards every route for the four authorized reviewer roles", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, WorkbookCutoverAttestationController),
    ).toEqual(["admin", "bursar", "registrar", "admissions"]);
  });

  it("requires an explicit true affirmation before calling the service", () => {
    const attest = vi.fn();
    const controller = new WorkbookCutoverAttestationController({
      status: vi.fn(),
      attest,
      revoke: vi.fn(),
    } as unknown as WorkbookCutoverAttestationService);
    expect(() =>
      controller.attest(authUser("person-1"), {
        manifestSha256: "a".repeat(64),
        affirmed: false,
      }),
    ).toThrow();
    expect(() =>
      controller.attest(authUser("person-1"), {
        manifestSha256: "a".repeat(64),
        affirmed: true,
        reviewerEmail: "someone-else@example.test",
      }),
    ).toThrow();
    expect(attest).not.toHaveBeenCalled();
  });
});

describe.skipIf(!DB_URL)(
  "WorkbookCutoverAttestationService database controls",
  () => {
    let prisma: PrismaClient;
    let service: WorkbookCutoverAttestationService;
    let reviewerId: string;
    let reviewerEmail: string;
    let attackerId: string;
    let attackerEmail: string;
    let facultyId: string;
    let suspendedId: string;

    beforeAll(async () => {
      execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
        cwd: new URL("../../../../packages/db", import.meta.url).pathname,
        env: { ...process.env, DATABASE_URL: DB_URL! },
        stdio: "pipe",
      });
      prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
      service = new WorkbookCutoverAttestationService(
        prisma as unknown as PrismaService,
      );
      reviewerEmail = `reviewer-${randomUUID()}@test.local`;
      attackerEmail = `attacker-${randomUUID()}@test.local`;
      const [reviewer, attacker, faculty, suspended] = await Promise.all([
        prisma.person.create({
          data: {
            email: reviewerEmail,
            firstName: "Authorized",
            lastName: "Reviewer",
            kind: "staff",
            roles: ["admin"],
          },
        }),
        prisma.person.create({
          data: {
            email: attackerEmail,
            firstName: "Different",
            lastName: "Reviewer",
            kind: "staff",
            roles: ["admissions"],
          },
        }),
        prisma.person.create({
          data: {
            email: `faculty-${randomUUID()}@test.local`,
            firstName: "Faculty",
            lastName: "Only",
            kind: "staff",
            roles: ["faculty"],
          },
        }),
        prisma.person.create({
          data: {
            email: `suspended-${randomUUID()}@test.local`,
            firstName: "Suspended",
            lastName: "Admin",
            kind: "staff",
            roles: ["admin"],
            status: "suspended",
            suspendedAt: new Date(),
          },
        }),
      ]);
      reviewerId = reviewer.id;
      attackerId = attacker.id;
      facultyId = faculty.id;
      suspendedId = suspended.id;
    }, 120_000);

    afterAll(async () => {
      if (!prisma) return;
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`,
      );
      await prisma.$disconnect();
    });

    it("binds the database Person instead of untrusted session email/name and is idempotent", async () => {
      const digest = "1".repeat(64);
      const forgedClaims = authUser(reviewerId, {
        email: attackerEmail,
        name: "Different Reviewer",
      });
      const [first, second] = await Promise.all([
        service.attest(forgedClaims, digest),
        service.attest(forgedClaims, digest),
      ]);
      expect(first).toMatchObject({
        manifestSha256: digest,
        status: "valid",
        statementSha256: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
      });
      expect(second.attestationId).toBe(first.attestationId);
      expect(JSON.stringify(first)).not.toContain(reviewerEmail);
      expect(JSON.stringify(first)).not.toContain(attackerEmail);

      const row =
        await prisma.workbookCutoverReviewerAttestation.findUniqueOrThrow({
          where: {
            manifestSha256_reviewerId: {
              manifestSha256: digest,
              reviewerId,
            },
          },
        });
      expect(row).toMatchObject({
        reviewerId,
        reviewerEmailNormalized: reviewerEmail.toLowerCase(),
        authorizedRoles: ["admin"],
      });
      await expect(
        prisma.workbookCutoverReviewerAttestation.count({
          where: { manifestSha256: digest, reviewerId },
        }),
      ).resolves.toBe(1);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: row.id, action: "attested" },
      });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits[0]!.data)).not.toContain(reviewerEmail);
      expect(JSON.stringify(audits[0]!.data)).not.toContain("Authorized");
    });

    it("cannot impersonate a different manifest reviewer through session claims", async () => {
      const digest = "2".repeat(64);
      const result = await service.attest(
        authUser(attackerId, {
          roles: ["admin"],
          email: reviewerEmail,
          name: "Authorized Reviewer",
        }),
        digest,
      );
      const row =
        await prisma.workbookCutoverReviewerAttestation.findUniqueOrThrow({
          where: { id: result.attestationId! },
        });
      expect(row).toMatchObject({
        reviewerId: attackerId,
        reviewerEmailNormalized: attackerEmail.toLowerCase(),
        authorizedRoles: ["admissions"],
      });
      expect(row.reviewerId).not.toBe(reviewerId);
    });

    it("rejects unauthorized or inactive People even when JWT claims say admin", async () => {
      await expect(
        service.attest(authUser(facultyId), "3".repeat(64)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.attest(authUser(suspendedId), "4".repeat(64)),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("fails closed on login-email drift", async () => {
      const digest = "5".repeat(64);
      await service.attest(authUser(reviewerId), digest);
      const changedEmail = `changed-${randomUUID()}@test.local`;
      await prisma.person.update({
        where: { id: reviewerId },
        data: { email: changedEmail },
      });
      try {
        await expect(
          service.status(authUser(reviewerId), digest),
        ).resolves.toMatchObject({
          status: "identity_drift",
        });
        await expect(
          service.attest(authUser(reviewerId), digest),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        await prisma.person.update({
          where: { id: reviewerId },
          data: { email: reviewerEmail },
        });
      }
    });

    it("makes revocation terminal and database evidence undeletable", async () => {
      const digest = "6".repeat(64);
      const created = await service.attest(authUser(reviewerId), digest);
      const revoked = await service.revoke(
        authUser(reviewerId),
        digest,
        "attested_in_error",
      );
      expect(revoked).toMatchObject({
        attestationId: created.attestationId,
        status: "revoked",
      });
      await expect(
        service.attest(authUser(reviewerId), digest),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        prisma.workbookCutoverReviewerAttestation.update({
          where: { id: created.attestationId! },
          data: {
            revokedAt: null,
            revokedById: null,
            revocationReason: null,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.workbookCutoverReviewerAttestation.update({
          where: { id: created.attestationId! },
          data: { reviewerEmailNormalized: "rewritten@example.test" },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.workbookCutoverReviewerAttestation.delete({
          where: { id: created.attestationId! },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.auditLog.count({
          where: { entityId: created.attestationId!, action: "revoked" },
        }),
      ).resolves.toBe(1);
    });
  },
);
