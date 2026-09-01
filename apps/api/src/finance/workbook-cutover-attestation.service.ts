import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";

const AUTHORIZED_REVIEWER_ROLES = new Set([
  "admin",
  "bursar",
  "registrar",
  "admissions",
]);
const MAX_TRANSACTION_ATTEMPTS = 3;

export const WORKBOOK_CUTOVER_ATTESTATION_STATEMENT =
  "I attest that every workbook, production-student, applicant, and financial-adjustment decision in this exact canonical manifest that bears my institutional login email is my reviewed decision.";

export const WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 = createHash(
  "sha256",
)
  .update(WORKBOOK_CUTOVER_ATTESTATION_STATEMENT)
  .digest("hex");

export const WORKBOOK_CUTOVER_ATTESTATION_REVOCATION_REASONS = [
  "decisions_changed",
  "attested_in_error",
  "identity_compromised",
] as const;

export type WorkbookCutoverAttestationRevocationReason =
  (typeof WORKBOOK_CUTOVER_ATTESTATION_REVOCATION_REASONS)[number];

export type WorkbookCutoverAttestationStatus = {
  manifestSha256: string;
  statement: string;
  statementSha256: string;
  status:
    "missing" | "valid" | "revoked" | "identity_drift" | "statement_stale";
  attestationId: string | null;
  attestedAt: string | null;
  revokedAt: string | null;
};

type AttestationRow = {
  id: string;
  manifestSha256: string;
  reviewerEmailNormalized: string;
  statementSha256: string;
  attestedAt: Date;
  revokedAt: Date | null;
};

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

@Injectable()
export class WorkbookCutoverAttestationService {
  constructor(private readonly prisma: PrismaService) {}

  private async actorContext(
    db: PrismaService | Prisma.TransactionClient,
    actor: AuthUser,
  ) {
    const person = await db.person.findUnique({
      where: { id: actor.personId },
      select: { id: true, email: true, status: true, roles: true },
    });
    const authorizedRoles = person
      ? [
          ...new Set(
            person.roles.filter((role) => AUTHORIZED_REVIEWER_ROLES.has(role)),
          ),
        ].sort()
      : null;
    if (
      !person ||
      person.status !== "active" ||
      !person.email ||
      !authorizedRoles ||
      authorizedRoles.length === 0
    ) {
      throw new ForbiddenException(
        "An active authorized staff identity is required to attest a cutover manifest",
      );
    }
    return {
      personId: person.id,
      emailNormalized: normalizedEmail(person.email),
      authorizedRoles,
    };
  }

  private response(
    manifestSha256: string,
    actorEmailNormalized: string,
    row: AttestationRow | null,
  ): WorkbookCutoverAttestationStatus {
    let status: WorkbookCutoverAttestationStatus["status"] = "missing";
    if (row?.revokedAt) status = "revoked";
    else if (row && row.reviewerEmailNormalized !== actorEmailNormalized) {
      status = "identity_drift";
    } else if (
      row &&
      row.statementSha256 !== WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256
    ) {
      status = "statement_stale";
    } else if (row) status = "valid";

    return {
      manifestSha256,
      statement: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT,
      statementSha256: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
      status,
      attestationId: row?.id ?? null,
      attestedAt: row?.attestedAt.toISOString() ?? null,
      revokedAt: row?.revokedAt?.toISOString() ?? null,
    };
  }

  async status(
    actor: AuthUser,
    manifestSha256: string,
  ): Promise<WorkbookCutoverAttestationStatus> {
    const context = await this.actorContext(this.prisma, actor);
    const row = await this.prisma.workbookCutoverReviewerAttestation.findUnique(
      {
        where: {
          manifestSha256_reviewerId: {
            manifestSha256,
            reviewerId: context.personId,
          },
        },
        select: {
          id: true,
          manifestSha256: true,
          reviewerEmailNormalized: true,
          statementSha256: true,
          attestedAt: true,
          revokedAt: true,
        },
      },
    );
    return this.response(manifestSha256, context.emailNormalized, row);
  }

  async attest(
    actor: AuthUser,
    manifestSha256: string,
  ): Promise<WorkbookCutoverAttestationStatus> {
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const context = await this.actorContext(tx, actor);
            const existing =
              await tx.workbookCutoverReviewerAttestation.findUnique({
                where: {
                  manifestSha256_reviewerId: {
                    manifestSha256,
                    reviewerId: context.personId,
                  },
                },
                select: {
                  id: true,
                  manifestSha256: true,
                  reviewerEmailNormalized: true,
                  statementSha256: true,
                  attestedAt: true,
                  revokedAt: true,
                },
              });
            if (existing) {
              const response = this.response(
                manifestSha256,
                context.emailNormalized,
                existing,
              );
              if (response.status !== "valid") {
                throw new ConflictException(
                  "This exact manifest digest cannot be re-attested; regenerate the canonical manifest and attest its new digest",
                );
              }
              return response;
            }

            const created = await tx.workbookCutoverReviewerAttestation.create({
              data: {
                manifestSha256,
                reviewerId: context.personId,
                reviewerEmailNormalized: context.emailNormalized,
                authorizedRoles: context.authorizedRoles,
                statementSha256: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
              },
              select: {
                id: true,
                manifestSha256: true,
                reviewerEmailNormalized: true,
                statementSha256: true,
                attestedAt: true,
                revokedAt: true,
              },
            });
            await tx.auditLog.create({
              data: {
                entity: "WorkbookCutoverReviewerAttestation",
                entityId: created.id,
                action: "attested",
                actorId: context.personId,
                data: {
                  manifestSha256,
                  statementSha256:
                    WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
                  authorizedRoles: context.authorizedRoles,
                },
              },
            });
            return this.response(
              manifestSha256,
              context.emailNormalized,
              created,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        const code = errorCode(error);
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS - 1 &&
          (code === "P2002" || code === "P2034")
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Could not record the manifest attestation");
  }

  async revoke(
    actor: AuthUser,
    manifestSha256: string,
    reason: WorkbookCutoverAttestationRevocationReason,
  ): Promise<WorkbookCutoverAttestationStatus> {
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const context = await this.actorContext(tx, actor);
            const existing =
              await tx.workbookCutoverReviewerAttestation.findUnique({
                where: {
                  manifestSha256_reviewerId: {
                    manifestSha256,
                    reviewerId: context.personId,
                  },
                },
                select: {
                  id: true,
                  manifestSha256: true,
                  reviewerEmailNormalized: true,
                  statementSha256: true,
                  attestedAt: true,
                  revokedAt: true,
                },
              });
            if (!existing) {
              throw new NotFoundException(
                "No attestation exists for this manifest digest",
              );
            }
            if (existing.reviewerEmailNormalized !== context.emailNormalized) {
              throw new ConflictException(
                "The institutional identity has changed; this attestation is not valid for the current login email",
              );
            }
            if (existing.revokedAt) {
              return this.response(
                manifestSha256,
                context.emailNormalized,
                existing,
              );
            }

            const revokedAt = new Date();
            const updated = await tx.workbookCutoverReviewerAttestation.update({
              where: { id: existing.id },
              data: {
                revokedAt,
                revokedById: context.personId,
                revocationReason: reason,
              },
              select: {
                id: true,
                manifestSha256: true,
                reviewerEmailNormalized: true,
                statementSha256: true,
                attestedAt: true,
                revokedAt: true,
              },
            });
            await tx.auditLog.create({
              data: {
                entity: "WorkbookCutoverReviewerAttestation",
                entityId: updated.id,
                action: "revoked",
                actorId: context.personId,
                data: { manifestSha256, reasonCode: reason },
              },
            });
            return this.response(
              manifestSha256,
              context.emailNormalized,
              updated,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error) {
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS - 1 &&
          errorCode(error) === "P2034"
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Could not revoke the manifest attestation");
  }
}
