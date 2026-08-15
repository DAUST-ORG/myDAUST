import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  AcademicCatalogDraftInput,
  AcademicNotYetGradedStandingInput,
  AcademicStandingRuleInput,
  DEFAULT_ACADEMIC_STANDING_RULES,
  DEFAULT_NOT_YET_GRADED_STANDING,
  academicLevelBands,
  deriveAcademicLevel,
  type AcademicCatalogDraft,
  type AcademicCatalogLevel,
  type AcademicCatalogProgram,
  type AcademicNotYetGradedStanding,
  type AcademicProgress,
  type AcademicStandingRule,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";

type RevisionRow = Awaited<
  ReturnType<PrismaService["academicCatalogRevision"]["findFirst"]>
>;

export interface AcademicCatalogRevisionView {
  id: string;
  academicYearId: string;
  revision: number;
  status:
    "draft" | "pending" | "approved" | "rejected" | "cancelled" | "superseded";
  yearLabel: string;
  startsOn: string | null;
  endsOn: string | null;
  defaultLevels: AcademicCatalogLevel[];
  defaultStandingRules: AcademicStandingRule[];
  notYetGradedStanding: AcademicNotYetGradedStanding;
  programs: AcademicCatalogProgram[];
  reason: string | null;
  activateYear: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvalRequestId: string | null;
}

interface AcademicProgressInput {
  programId: string | null;
  catalogYearId: string | null;
  catalogYearLabel: string | null;
  earnedCredits: number;
  inProgressCredits: number;
}

type ApprovedRevision = Prisma.AcademicCatalogRevisionGetPayload<{
  include: { academicYear: true };
}>;

interface EffectiveCatalogConfiguration {
  academicYearId: string;
  label: string;
  revision: number;
  fallback: boolean;
  defaultLevels: AcademicCatalogLevel[];
  defaultStandingRules: AcademicStandingRule[];
  notYetGradedStanding: AcademicNotYetGradedStanding;
  program: AcademicCatalogProgram | null;
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function levels(value: unknown): AcademicCatalogLevel[] {
  return Array.isArray(value) ? (value as AcademicCatalogLevel[]) : [];
}

function programs(value: unknown): AcademicCatalogProgram[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const program = raw as AcademicCatalogProgram;
    return {
      ...program,
      standingMode: program.standingMode ?? "default",
      customStandingRules: program.customStandingRules ?? [],
    };
  });
}

function standingRules(value: unknown): AcademicStandingRule[] {
  const parsed = Array.isArray(value)
    ? value
        .map((rule) => AcademicStandingRuleInput.safeParse(rule))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];
  return parsed.length > 0
    ? parsed
    : DEFAULT_ACADEMIC_STANDING_RULES.map((rule) => ({ ...rule }));
}

function notYetGraded(value: unknown): AcademicNotYetGradedStanding {
  const parsed = AcademicNotYetGradedStandingInput.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_NOT_YET_GRADED_STANDING };
}

@Injectable()
export class AcademicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  present(row: NonNullable<RevisionRow>): AcademicCatalogRevisionView {
    return {
      id: row.id,
      academicYearId: row.academicYearId,
      revision: row.revision,
      status: row.status,
      yearLabel: row.yearLabel,
      startsOn: dateOnly(row.startsOn),
      endsOn: dateOnly(row.endsOn),
      defaultLevels: levels(row.defaultLevels),
      defaultStandingRules: standingRules(row.defaultStandingRules),
      notYetGradedStanding: notYetGraded(row.notYetGradedStanding),
      programs: programs(row.programConfigurations),
      reason: row.reason,
      activateYear: row.activateYear,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvalRequestId: row.approvalRequestId,
    };
  }

  private async legacyPrograms(academicYearLabel: string) {
    const rows = await this.prisma.program.findMany({
      orderBy: { code: "asc" },
      include: {
        requirements: {
          where: { catalogYear: academicYearLabel },
          orderBy: [{ position: "asc" }, { category: "asc" }],
        },
      },
    });
    return rows.map((program): AcademicCatalogProgram => ({
      programId: program.id,
      programCode: program.code,
      programName: program.name,
      progressionMode: "default",
      customLevels: [],
      standingMode: "default",
      customStandingRules: [],
      requirements: program.requirements.map((requirement) => ({
        category: requirement.category,
        requiredCredits: requirement.requiredCredits,
      })),
    }));
  }

  private defaultLevelsFor(programRows: AcademicCatalogProgram[]) {
    const largest = Math.max(
      30,
      ...programRows.map((program) =>
        program.requirements.reduce(
          (sum, requirement) => sum + requirement.requiredCredits,
          0,
        ),
      ),
    );
    return Array.from({ length: Math.ceil(largest / 30) }, (_, index) => ({
      code: `S${index + 1}`,
      name: `Semester ${index + 1}`,
      creditCeiling: (index + 1) * 30,
    }));
  }

  async workspace(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) throw new NotFoundException("Academic year not found");
    const [approved, editable, allPrograms, revisionHistory] =
      await Promise.all([
        this.prisma.academicCatalogRevision.findFirst({
          where: { academicYearId, status: "approved" },
          orderBy: { revision: "desc" },
        }),
        this.prisma.academicCatalogRevision.findFirst({
          where: { academicYearId, status: { in: ["draft", "pending"] } },
          orderBy: { revision: "desc" },
        }),
        this.prisma.program.findMany({
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        }),
        this.prisma.academicCatalogRevision.findMany({
          where: { academicYearId },
          orderBy: { revision: "desc" },
          include: {
            createdBy: {
              select: { firstName: true, lastName: true, email: true },
            },
            approvedBy: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        }),
      ]);
    const legacy = await this.legacyPrograms(year.label);
    const baselinePrograms = approved
      ? programs(approved.programConfigurations)
      : legacy;
    const byId = new Map(
      baselinePrograms.map((program) => [program.programId, program]),
    );
    const completePrograms = allPrograms.map(
      (program): AcademicCatalogProgram =>
        byId.get(program.id) ?? {
          programId: program.id,
          programCode: program.code,
          programName: program.name,
          progressionMode: "default",
          customLevels: [],
          standingMode: "default",
          customStandingRules: [],
          requirements: [],
        },
    );
    const effective = approved
      ? this.present(approved)
      : {
          id: "legacy",
          academicYearId: year.id,
          revision: 0,
          status: "approved" as const,
          yearLabel: year.label,
          startsOn: dateOnly(year.startsOn),
          endsOn: dateOnly(year.endsOn),
          defaultLevels: this.defaultLevelsFor(completePrograms),
          defaultStandingRules: DEFAULT_ACADEMIC_STANDING_RULES.map((rule) => ({
            ...rule,
          })),
          notYetGradedStanding: { ...DEFAULT_NOT_YET_GRADED_STANDING },
          programs: completePrograms,
          reason: "Legacy programme requirements",
          activateYear: year.status === "active",
          createdAt: year.createdAt.toISOString(),
          updatedAt: year.createdAt.toISOString(),
          approvedAt: null,
          approvalRequestId: null,
        };
    return {
      year: {
        id: year.id,
        label: year.label,
        status: year.status,
        startsOn: dateOnly(year.startsOn),
        endsOn: dateOnly(year.endsOn),
      },
      effective: { ...effective, programs: completePrograms },
      editable: editable ? this.present(editable) : null,
      levelBands: academicLevelBands(effective.defaultLevels),
      history: revisionHistory.map((revision) => ({
        ...this.present(revision),
        requester: revision.createdBy
          ? {
              name: `${revision.createdBy.firstName} ${revision.createdBy.lastName}`.trim(),
              email: revision.createdBy.email,
            }
          : null,
        reviewer: revision.approvedBy
          ? {
              name: `${revision.approvedBy.firstName} ${revision.approvedBy.lastName}`.trim(),
              email: revision.approvedBy.email,
            }
          : null,
      })),
    };
  }

  async saveDraft(academicYearId: string, actorId: string, raw: unknown) {
    const parsed = AcademicCatalogDraftInput.parse(raw);
    const [year, canonicalPrograms] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: academicYearId },
      }),
      this.prisma.program.findMany({
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
    ]);
    if (!year) throw new NotFoundException("Academic year not found");
    const submittedById = new Map(
      parsed.programs.map((program) => [program.programId, program]),
    );
    if (
      parsed.programs.length !== canonicalPrograms.length ||
      canonicalPrograms.some((program) => !submittedById.has(program.id))
    ) {
      throw new BadRequestException(
        "The catalog must include every current programme exactly once",
      );
    }
    const input: AcademicCatalogDraft = {
      ...parsed,
      programs: canonicalPrograms.map((program) => ({
        ...submittedById.get(program.id)!,
        programCode: program.code,
        programName: program.name,
      })),
    };
    const pending = await this.prisma.academicCatalogRevision.findFirst({
      where: { academicYearId, status: "pending" },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException(
        "This catalog already has a revision awaiting director approval",
      );
    }
    const currentDraft = await this.prisma.academicCatalogRevision.findFirst({
      where: { academicYearId, status: "draft" },
      orderBy: { revision: "desc" },
    });
    const latest = await this.prisma.academicCatalogRevision.findFirst({
      where: { academicYearId },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    const data = {
      yearLabel: input.yearLabel,
      startsOn: input.startsOn
        ? new Date(`${input.startsOn}T00:00:00.000Z`)
        : null,
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00.000Z`) : null,
      defaultLevels: json(input.defaultLevels),
      defaultStandingRules: json(input.defaultStandingRules),
      notYetGradedStanding: json(input.notYetGradedStanding),
      programConfigurations: json(input.programs),
      reason: input.reason,
      activateYear: input.activateYear,
      createdById: actorId,
    };
    const draft = currentDraft
      ? await this.prisma.academicCatalogRevision.update({
          where: { id: currentDraft.id },
          data,
        })
      : await this.prisma.academicCatalogRevision.create({
          data: {
            academicYearId,
            revision: (latest?.revision ?? 0) + 1,
            status: "draft",
            ...data,
          },
        });
    await this.prisma.auditLog.create({
      data: {
        entity: "AcademicCatalogRevision",
        entityId: draft.id,
        action: currentDraft ? "draft-updated" : "draft-created",
        actorId,
        data: { academicYearId, revision: draft.revision },
      },
    });
    return this.present(draft);
  }

  async submit(academicYearId: string, actor: AuthUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.academicCatalogRevision.findFirst({
          where: { academicYearId, status: "draft" },
          orderBy: { revision: "desc" },
        });
        if (!draft) throw new NotFoundException("Catalog draft not found");
        const parsed: AcademicCatalogDraft = AcademicCatalogDraftInput.parse({
          yearLabel: draft.yearLabel,
          startsOn: dateOnly(draft.startsOn),
          endsOn: dateOnly(draft.endsOn),
          defaultLevels: draft.defaultLevels,
          defaultStandingRules: draft.defaultStandingRules,
          notYetGradedStanding: draft.notYetGradedStanding,
          programs: draft.programConfigurations,
          reason: draft.reason,
          activateYear: draft.activateYear,
        });
        const approved = await tx.academicCatalogRevision.findFirst({
          where: { academicYearId, status: "approved" },
          orderBy: { revision: "desc" },
        });
        const snapshot = {
          id: draft.id,
          academicYearId,
          revision: draft.revision,
          ...parsed,
        };
        const request = await tx.approvalRequest.create({
          data: {
            kind: "academic_catalog",
            status: "pending",
            targetType: "AcademicCatalogRevision",
            targetId: draft.id,
            academicYearLabel: draft.yearLabel,
            reason: draft.reason ?? "Academic catalog revision",
            beforeJson: approved
              ? json(this.present(approved))
              : Prisma.JsonNull,
            afterJson: json(snapshot),
            baseRevision: approved?.revision ?? 0,
            requestedById: actor.personId,
          },
        });
        await tx.academicCatalogRevision.update({
          where: { id: draft.id },
          data: { status: "pending", approvalRequestId: request.id },
        });
        await tx.approvalEvent.create({
          data: {
            requestId: request.id,
            action: "submitted",
            actorId: actor.personId,
            data: { academicYearId, revision: draft.revision },
          },
        });
        await tx.auditLog.create({
          data: {
            entity: "AcademicCatalogRevision",
            entityId: draft.id,
            action: "submitted-for-approval",
            actorId: actor.personId,
            data: { requestId: request.id, revision: draft.revision },
          },
        });
        return {
          requestId: request.id,
          revision: draft.revision,
          status: "pending",
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private progressFromConfiguration(
    input: AcademicProgressInput,
    effective: EffectiveCatalogConfiguration | null,
  ): AcademicProgress {
    if (!effective) {
      return {
        earnedCredits: input.earnedCredits,
        requiredCredits: null,
        inProgressCredits: input.inProgressCredits,
        level: null,
        maximumLevel: null,
        catalog: null,
      };
    }
    const requiredCredits = effective.program
      ? effective.program.requirements.reduce(
          (sum, requirement) => sum + requirement.requiredCredits,
          0,
        ) || null
      : null;
    const effectiveLevels =
      effective.program?.progressionMode === "custom"
        ? effective.program.customLevels
        : effective.defaultLevels;
    const derived = deriveAcademicLevel(
      effectiveLevels,
      input.earnedCredits,
      requiredCredits,
    );
    return {
      earnedCredits: input.earnedCredits,
      requiredCredits,
      inProgressCredits: input.inProgressCredits,
      ...derived,
      catalog: {
        academicYearId: effective.academicYearId,
        label: effective.label,
        revision: effective.revision,
        fallback: effective.fallback,
      },
    };
  }

  private effectiveFromApproved(
    input: Pick<
      AcademicProgressInput,
      "programId" | "catalogYearId" | "catalogYearLabel"
    >,
    approved: ApprovedRevision[],
  ): EffectiveCatalogConfiguration | null {
    const assigned = input.catalogYearId
      ? approved.find((row) => row.academicYearId === input.catalogYearId)
      : input.catalogYearLabel
        ? approved.find(
            (row) => row.academicYear.label === input.catalogYearLabel,
          )
        : null;
    const latestForProgram = approved.find((row) =>
      input.programId
        ? programs(row.programConfigurations).some(
            (program) => program.programId === input.programId,
          )
        : true,
    );
    const revision = assigned ?? latestForProgram ?? null;
    if (!revision) return null;
    const configuration = input.programId
      ? programs(revision.programConfigurations).find(
          (program) => program.programId === input.programId,
        )
      : null;
    return {
      academicYearId: revision.academicYearId,
      label: revision.yearLabel,
      revision: revision.revision,
      fallback: assigned === null,
      defaultLevels: levels(revision.defaultLevels),
      defaultStandingRules: standingRules(revision.defaultStandingRules),
      notYetGradedStanding: notYetGraded(revision.notYetGradedStanding),
      program: configuration ?? null,
    };
  }

  async progress(
    input: AcademicProgressInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AcademicProgress> {
    const effective = await this.effectiveConfiguration(
      {
        programId: input.programId,
        catalogYearId: input.catalogYearId,
        catalogYearLabel: input.catalogYearLabel,
      },
      client,
    );
    return this.progressFromConfiguration(input, effective);
  }

  async standingPolicy(
    input: Pick<
      AcademicProgressInput,
      "programId" | "catalogYearId" | "catalogYearLabel"
    >,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const effective = await this.effectiveConfiguration(input, client);
    return this.standingPolicyFromConfiguration(effective);
  }

  private standingPolicyFromConfiguration(
    effective: EffectiveCatalogConfiguration | null,
  ) {
    if (!effective) {
      return {
        rules: DEFAULT_ACADEMIC_STANDING_RULES.map((rule) => ({ ...rule })),
        notYetGraded: { ...DEFAULT_NOT_YET_GRADED_STANDING },
        catalog: null,
      };
    }
    return {
      rules:
        effective.program?.standingMode === "custom"
          ? effective.program.customStandingRules
          : effective.defaultStandingRules,
      notYetGraded: effective.notYetGradedStanding,
      catalog: {
        academicYearId: effective.academicYearId,
        label: effective.label,
        revision: effective.revision,
        fallback: effective.fallback,
      },
    };
  }

  async standingPoliciesMany(
    inputs: Pick<
      AcademicProgressInput,
      "programId" | "catalogYearId" | "catalogYearLabel"
    >[],
  ) {
    if (inputs.length === 0) return [];
    const delegate = (
      this.prisma as unknown as {
        academicCatalogRevision?: {
          findMany: PrismaService["academicCatalogRevision"]["findMany"];
        };
      }
    ).academicCatalogRevision;
    if (!delegate?.findMany) {
      return inputs.map(() => this.standingPolicyFromConfiguration(null));
    }
    const approved = (await delegate.findMany({
      where: { status: "approved" },
      orderBy: [{ approvedAt: "desc" }, { revision: "desc" }],
      include: { academicYear: true },
    })) as ApprovedRevision[];
    return inputs.map((input) =>
      this.standingPolicyFromConfiguration(
        this.effectiveFromApproved(input, approved),
      ),
    );
  }

  /** Resolve a roster page with one catalog query rather than one query per
   * student. The result order always matches the input order. */
  async progressMany(
    inputs: AcademicProgressInput[],
  ): Promise<AcademicProgress[]> {
    if (inputs.length === 0) return [];
    const delegate = (
      this.prisma as unknown as {
        academicCatalogRevision?: {
          findMany: PrismaService["academicCatalogRevision"]["findMany"];
        };
      }
    ).academicCatalogRevision;
    if (!delegate?.findMany) {
      return inputs.map((input) => this.progressFromConfiguration(input, null));
    }
    const approved = (await delegate.findMany({
      where: { status: "approved" },
      orderBy: [{ approvedAt: "desc" }, { revision: "desc" }],
      include: { academicYear: true },
    })) as ApprovedRevision[];
    return inputs.map((input) =>
      this.progressFromConfiguration(
        input,
        this.effectiveFromApproved(input, approved),
      ),
    );
  }

  /** Resolve progression and standing policy together for roster surfaces so
   * both student-facing values come from one approved-catalog snapshot/read. */
  async progressAndStandingPoliciesMany(inputs: AcademicProgressInput[]) {
    if (inputs.length === 0) return [];
    const delegate = (
      this.prisma as unknown as {
        academicCatalogRevision?: {
          findMany: PrismaService["academicCatalogRevision"]["findMany"];
        };
      }
    ).academicCatalogRevision;
    if (!delegate?.findMany) {
      return inputs.map((input) => ({
        progress: this.progressFromConfiguration(input, null),
        standingPolicy: this.standingPolicyFromConfiguration(null),
      }));
    }
    const approved = (await delegate.findMany({
      where: { status: "approved" },
      orderBy: [{ approvedAt: "desc" }, { revision: "desc" }],
      include: { academicYear: true },
    })) as ApprovedRevision[];
    return inputs.map((input) => {
      const effective = this.effectiveFromApproved(input, approved);
      return {
        progress: this.progressFromConfiguration(input, effective),
        standingPolicy: this.standingPolicyFromConfiguration(effective),
      };
    });
  }

  async effectiveConfiguration(
    input: {
      programId: string | null;
      catalogYearId: string | null;
      catalogYearLabel: string | null;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const revisionDelegate = (
      client as unknown as {
        academicCatalogRevision?: {
          findMany: typeof client.academicCatalogRevision.findMany;
        };
      }
    ).academicCatalogRevision;
    if (!revisionDelegate?.findMany) return null;
    const approved = await revisionDelegate.findMany({
      where: { status: "approved" },
      orderBy: [{ approvedAt: "desc" }, { revision: "desc" }],
      include: { academicYear: true },
    });
    return this.effectiveFromApproved(input, approved as ApprovedRevision[]);
  }
}
