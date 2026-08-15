import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@mydaust/db";
import {
  deriveAcademicStanding,
  type AcademicStanding,
  type AcademicStandingRule,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AcademicCatalogService } from "./academic-catalog.service.js";

export interface StandingContext {
  studentId: string;
  programId: string | null;
  catalogYearId: string | null;
  catalogYearLabel: string | null;
  cumulativeGpa: number | null;
  hasGpaBearingCoursework: boolean;
}

export interface StandingOverrideInput {
  standingCode: string;
  reason: string;
  expiresAt?: string | null;
}

@Injectable()
export class AcademicStandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogs: AcademicCatalogService,
  ) {}

  private async activeOverride(
    studentId: string,
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const delegate = (
      client as unknown as {
        studentStandingOverride?: PrismaService["studentStandingOverride"];
      }
    ).studentStandingOverride;
    if (!delegate?.findFirst) return null;
    return delegate.findFirst({
      where: {
        studentId,
        clearedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  private async recordExpiredOverrides(
    studentIds: string[],
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const delegates = client as unknown as {
      studentStandingOverride?: PrismaService["studentStandingOverride"];
      auditLog?: PrismaService["auditLog"];
    };
    if (
      !delegates.studentStandingOverride?.findMany ||
      !delegates.studentStandingOverride?.updateMany ||
      !delegates.auditLog?.create
    ) {
      return;
    }
    const expired = await delegates.studentStandingOverride.findMany({
      where: {
        studentId: { in: studentIds },
        clearedAt: null,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, studentId: true, standingCode: true },
    });
    for (const override of expired) {
      const clearedAt = new Date();
      const result = await delegates.studentStandingOverride.updateMany({
        where: { id: override.id, clearedAt: null },
        data: { clearedAt, clearReason: "Expired automatically" },
      });
      if (result.count === 0) continue;
      await delegates.auditLog.create({
        data: {
          entity: "StudentStandingOverride",
          entityId: override.id,
          action: "standing-override-expired",
          data: {
            studentId: override.studentId,
            standingCode: override.standingCode,
          },
        },
      });
    }
  }

  private async activeOverrides(studentIds: string[]) {
    const delegate = (
      this.prisma as unknown as {
        studentStandingOverride?: PrismaService["studentStandingOverride"];
      }
    ).studentStandingOverride;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
      where: {
        studentId: { in: studentIds },
        clearedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async resolve(
    context: StandingContext,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AcademicStanding> {
    await this.recordExpiredOverrides([context.studentId], client);
    const policy = await this.catalogs.standingPolicy(
      {
        programId: context.programId,
        catalogYearId: context.catalogYearId,
        catalogYearLabel: context.catalogYearLabel,
      },
      client,
    );
    const computed = deriveAcademicStanding(
      policy.rules,
      policy.notYetGraded,
      context.cumulativeGpa,
      context.hasGpaBearingCoursework,
    );
    const active = await this.activeOverride(context.studentId, client);
    if (!active) {
      return {
        ...computed,
        source: "computed",
        catalog: policy.catalog,
        override: null,
      };
    }

    const rule = policy.rules.find(
      (candidate: AcademicStandingRule) =>
        candidate.code === active.standingCode,
    );
    const display =
      rule ??
      (active.standingCode === policy.notYetGraded.code
        ? policy.notYetGraded
        : null);
    if (!display) {
      return {
        ...computed,
        source: "computed",
        catalog: policy.catalog,
        override: null,
      };
    }

    return {
      code: display.code,
      label: display.label,
      tone: display.tone,
      source: "override",
      catalog: policy.catalog,
      override: {
        id: active.id,
        reason: active.reason,
        expiresAt: active.expiresAt?.toISOString() ?? null,
        createdAt: active.createdAt.toISOString(),
        createdBy: active.createdBy
          ? {
              name: `${active.createdBy.firstName} ${active.createdBy.lastName}`.trim(),
              email: active.createdBy.email,
            }
          : null,
      },
    };
  }

  async resolveMany(
    contexts: StandingContext[],
    suppliedPolicies?: Awaited<
      ReturnType<AcademicCatalogService["standingPoliciesMany"]>
    >,
  ): Promise<AcademicStanding[]> {
    if (contexts.length === 0) return [];
    await this.recordExpiredOverrides(
      contexts.map((context) => context.studentId),
      this.prisma,
    );
    const [policies, overrides] = await Promise.all([
      suppliedPolicies
        ? Promise.resolve(suppliedPolicies)
        : this.catalogs.standingPoliciesMany(contexts),
      this.activeOverrides(contexts.map((context) => context.studentId)),
    ]);
    const overrideByStudent = new Map(
      overrides.map((override) => [override.studentId, override]),
    );
    return contexts.map((context, index) => {
      const policy = policies[index]!;
      const computed = deriveAcademicStanding(
        policy.rules,
        policy.notYetGraded,
        context.cumulativeGpa,
        context.hasGpaBearingCoursework,
      );
      const active = overrideByStudent.get(context.studentId);
      const display = active
        ? (policy.rules.find(
            (rule: AcademicStandingRule) => rule.code === active.standingCode,
          ) ??
          (active.standingCode === policy.notYetGraded.code
            ? policy.notYetGraded
            : null))
        : null;
      if (!active || !display) {
        return {
          ...computed,
          source: "computed",
          catalog: policy.catalog,
          override: null,
        };
      }
      return {
        code: display.code,
        label: display.label,
        tone: display.tone,
        source: "override",
        catalog: policy.catalog,
        override: {
          id: active.id,
          reason: active.reason,
          expiresAt: active.expiresAt?.toISOString() ?? null,
          createdAt: active.createdAt.toISOString(),
          createdBy: active.createdBy
            ? {
                name: `${active.createdBy.firstName} ${active.createdBy.lastName}`.trim(),
                email: active.createdBy.email,
              }
            : null,
        },
      };
    });
  }

  private async studentContext(
    studentId: string,
    client: Prisma.TransactionClient,
  ) {
    const student = await client.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        programId: true,
        catalogYearId: true,
        catalogYear: true,
        transcriptEntries: {
          where: { voidedAt: null, countsTowardGpa: true },
          select: { credits: true, gradePoints: true },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  async setOverride(
    actorId: string,
    studentId: string,
    input: StandingOverrideInput,
  ) {
    const reason = input.reason.trim();
    if (!reason)
      throw new BadRequestException("An override reason is required");
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("The expiry date must be in the future");
    }
    return this.prisma.$transaction(async (tx) => {
      const student = await this.studentContext(studentId, tx);
      const policy = await this.catalogs.standingPolicy(
        {
          programId: student.programId,
          catalogYearId: student.catalogYearId,
          catalogYearLabel: student.catalogYear,
        },
        tx,
      );
      const allowedCodes = new Set([
        policy.notYetGraded.code,
        ...policy.rules.map((rule: AcademicStandingRule) => rule.code),
      ]);
      if (!allowedCodes.has(input.standingCode)) {
        throw new BadRequestException(
          "Select a standing from the student's approved policy",
        );
      }
      const active = await tx.studentStandingOverride.findFirst({
        where: {
          studentId,
          clearedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
      });
      const saved = active
        ? await tx.studentStandingOverride.update({
            where: { id: active.id },
            data: {
              standingCode: input.standingCode,
              reason,
              expiresAt,
              updatedById: actorId,
            },
          })
        : await tx.studentStandingOverride.create({
            data: {
              studentId,
              standingCode: input.standingCode,
              reason,
              expiresAt,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      await tx.auditLog.create({
        data: {
          entity: "StudentStandingOverride",
          entityId: saved.id,
          action: active
            ? "standing-override-updated"
            : "standing-override-set",
          actorId,
          data: {
            studentId,
            standingCode: input.standingCode,
            reason,
            expiresAt,
            previousStandingCode: active?.standingCode ?? null,
            previousReason: active?.reason ?? null,
          },
        },
      });
      return saved;
    });
  }

  async policyForStudent(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { programId: true, catalogYearId: true, catalogYear: true },
    });
    if (!student) throw new NotFoundException("Student not found");
    return this.catalogs.standingPolicy({
      programId: student.programId,
      catalogYearId: student.catalogYearId,
      catalogYearLabel: student.catalogYear,
    });
  }

  async currentOverrides() {
    const rows = await this.prisma.studentStandingOverride.findMany({
      where: {
        clearedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        student: {
          include: {
            person: { select: { firstName: true, lastName: true } },
            program: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentNo: row.student.studentNo,
      studentName:
        `${row.student.person.firstName} ${row.student.person.lastName}`.trim(),
      program: row.student.program,
      standingCode: row.standingCode,
      reason: row.reason,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    }));
  }

  async clearOverride(actorId: string, studentId: string, reason: string) {
    const clearReason = reason.trim();
    if (!clearReason)
      throw new BadRequestException("A clearing reason is required");
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.studentStandingOverride.findFirst({
        where: { studentId, clearedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (!active) throw new NotFoundException("No active standing override");
      const clearedAt = new Date();
      const cleared = await tx.studentStandingOverride.update({
        where: { id: active.id },
        data: {
          clearedAt,
          clearedById: actorId,
          clearReason,
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "StudentStandingOverride",
          entityId: active.id,
          action: "standing-override-cleared",
          actorId,
          data: { studentId, reason: clearReason },
        },
      });
      return cleared;
    });
  }
}
