import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@mydaust/db";
import type {
  TranscriptPdfGeneration,
  TranscriptPdfGeneratorKind,
  TranscriptStudentIdentity,
  TranscriptView,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { summarizeTranscriptRows } from "./transcript-calculation.js";
import {
  renderTranscriptPdf,
  transcriptWatermark,
  UnsupportedTranscriptCharacterError,
} from "./transcript-pdf.js";
import {
  buildTranscriptView,
  type TranscriptLedgerRow,
} from "./transcript-view.js";

export interface TranscriptEntryInput {
  courseId?: string | null;
  termId?: string | null;
  courseCode: string;
  courseTitle: string;
  termLabel: string;
  termSortKey?: string | null;
  grade: string;
  credits: number;
  earnedCredits?: number;
  gradePoints?: number | null;
  countsTowardGpa?: boolean;
  countsTowardCredits?: boolean;
  requirementCategory?: string | null;
  note?: string | null;
}

export type TranscriptEntryPatch = Partial<TranscriptEntryInput> & {
  reason: string;
};

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sortKeyForDate(date: Date, label: string): string {
  return `${date.toISOString().slice(0, 10)}:${label}`;
}

function dakarTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

function transcriptFileName(studentNo: string): string {
  const safeStudentNo = studentNo.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `unofficial-transcript-${safeStudentNo || "student"}.pdf`;
}

export interface TranscriptPdfFile {
  data: Buffer;
  fileName: string;
  sha256: string;
  generationId: string;
  pageCount: number;
}

@Injectable()
export class TranscriptService {
  constructor(private readonly prisma: PrismaService) {}

  private async readView(
    client: Prisma.TransactionClient,
    studentId: string,
  ): Promise<TranscriptView> {
    const [student, entries] = await Promise.all([
      client.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          studentNo: true,
          person: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          program: {
            select: { code: true, name: true, degree: true },
          },
        },
      }),
      client.transcriptEntry.findMany({
        where: { studentId, voidedAt: null },
        select: {
          id: true,
          courseId: true,
          termId: true,
          courseCode: true,
          courseTitle: true,
          termLabel: true,
          termSortKey: true,
          grade: true,
          credits: true,
          earnedCredits: true,
          gradePoints: true,
          countsTowardGpa: true,
          countsTowardCredits: true,
          requirementCategory: true,
          source: true,
        },
      }),
    ]);
    if (!student) throw new NotFoundException("Student not found");

    const identity: TranscriptStudentIdentity = {
      id: student.id,
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`.trim(),
      email: student.person.email,
      program: student.program,
    };
    const rows: TranscriptLedgerRow[] = entries.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      termId: entry.termId,
      courseCode: entry.courseCode,
      title: entry.courseTitle,
      term: entry.termLabel,
      termSortKey: entry.termSortKey,
      grade: entry.grade,
      credits: entry.credits,
      earnedCredits: entry.earnedCredits,
      points: entry.gradePoints,
      countsTowardGpa: entry.countsTowardGpa,
      countsTowardCredits: entry.countsTowardCredits,
      requirementCategory: entry.requirementCategory,
      source: entry.source as TranscriptLedgerRow["source"],
    }));
    return buildTranscriptView(identity, rows);
  }

  /** Consistent canonical transcript view used by every interactive surface. */
  async view(studentId: string): Promise<TranscriptView> {
    return this.prisma.$transaction((tx) => this.readView(tx, studentId), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /**
   * Render and audit one immutable ledger snapshot. The consistent read, hash
   * and audit record share a transaction so the provenance describes exactly
   * the PDF returned to the caller.
   */
  async generatePdf(
    actor: AuthUser,
    studentId: string,
    kind: TranscriptPdfGeneratorKind,
  ): Promise<TranscriptPdfFile> {
    const generatedAt = new Date();
    const generationId = randomUUID();
    const role =
      kind === "student"
        ? "student"
        : actor.roles.includes("admin")
          ? "admin"
          : "registrar";
    const generation: TranscriptPdfGeneration = {
      generationId,
      generatedAt: generatedAt.toISOString(),
      generatedAtDakar: dakarTimestamp(generatedAt),
      generator: {
        personId: actor.personId,
        name: actor.name,
        email: actor.email,
        role,
        kind,
      },
    };

    return this.prisma.$transaction(
      async (tx) => {
        const view = await this.readView(tx, studentId);
        let rendered: Awaited<ReturnType<typeof renderTranscriptPdf>>;
        try {
          rendered = await renderTranscriptPdf(view, generation);
        } catch (error) {
          if (error instanceof UnsupportedTranscriptCharacterError) {
            throw new UnprocessableEntityException(
              "This academic record contains characters that the transcript renderer cannot represent safely. Contact the registrar rather than using a corrupted document.",
            );
          }
          throw error;
        }
        const data = Buffer.from(rendered.bytes);
        const sha256 = createHash("sha256").update(data).digest("hex");
        await tx.auditLog.create({
          data: {
            entity: "TranscriptGeneration",
            entityId: generationId,
            action: "pdf-generated",
            actorId: actor.personId,
            data: {
              studentId,
              studentNo: view.student.studentNo,
              generation: {
                generationId: generation.generationId,
                generatedAt: generation.generatedAt,
                generatedAtDakar: generation.generatedAtDakar,
                generator: {
                  personId: generation.generator.personId,
                  name: generation.generator.name,
                  email: generation.generator.email,
                  role: generation.generator.role,
                  kind: generation.generator.kind,
                },
              },
              watermark: transcriptWatermark(kind),
              sha256,
              pageCount: rendered.pageCount,
              entryCount: view.semesters.reduce(
                (count, semester) => count + semester.entries.length,
                0,
              ),
            },
          },
        });
        return {
          data,
          fileName: transcriptFileName(view.student.studentNo),
          sha256,
          generationId,
          pageCount: rendered.pageCount,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  }

  private async defaultPolicy(grade: string) {
    const normalized = clean(grade).toUpperCase();
    const scheme = await this.prisma.gradingScheme.findFirst({
      where: { isDefault: true },
      include: { rows: { orderBy: { position: "asc" } } },
    });
    const row = scheme?.rows.find(
      (candidate) => clean(candidate.grade).toUpperCase() === normalized,
    );
    if (!row) {
      throw new BadRequestException(
        `Grade ${grade} is not configured in the institution grading scale`,
      );
    }
    return {
      gradePoints: row.points,
      countsTowardGpa: row.countsTowardGpa && row.points !== null,
      countsTowardCredits: row.countsTowardCredits,
    };
  }

  async summary(studentId: string) {
    const entries = await this.prisma.transcriptEntry.findMany({
      where: { studentId, voidedAt: null },
      select: {
        courseId: true,
        courseCode: true,
        credits: true,
        earnedCredits: true,
        gradePoints: true,
        countsTowardGpa: true,
        countsTowardCredits: true,
      },
    });
    return summarizeTranscriptRows(entries);
  }

  async list(
    studentId: string,
    includeVoided = false,
    includeAuditActors = false,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Student not found");
    const entries = await this.prisma.transcriptEntry.findMany({
      where: { studentId, ...(includeVoided ? {} : { voidedAt: null }) },
      orderBy: [
        { termSortKey: "desc" },
        { termLabel: "desc" },
        { courseCode: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        voidedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return entries.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      termId: entry.termId,
      courseCode: entry.courseCode,
      title: entry.courseTitle,
      credits: entry.credits,
      earnedCredits: entry.earnedCredits,
      term: entry.termLabel,
      termSortKey: entry.termSortKey,
      grade: entry.grade,
      points: entry.gradePoints,
      countsTowardGpa: entry.countsTowardGpa,
      countsTowardCredits: entry.countsTowardCredits,
      requirementCategory: entry.requirementCategory,
      source: entry.source,
      sourceRow: entry.importRowNumber,
      matched: entry.courseId !== null,
      note: entry.note,
      voidedAt: entry.voidedAt,
      voidReason: entry.voidReason,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      ...(includeAuditActors
        ? {
            createdBy: entry.createdBy,
            updatedBy: entry.updatedBy,
            voidedBy: entry.voidedBy,
          }
        : {}),
    }));
  }

  async create(
    actorId: string,
    studentId: string,
    input: TranscriptEntryInput,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException("Student not found");
    const [course, term, policy] = await Promise.all([
      input.courseId
        ? this.prisma.course.findUnique({ where: { id: input.courseId } })
        : null,
      input.termId
        ? this.prisma.term.findUnique({ where: { id: input.termId } })
        : null,
      input.gradePoints === undefined ||
      input.countsTowardGpa === undefined ||
      input.countsTowardCredits === undefined
        ? this.defaultPolicy(input.grade)
        : null,
    ]);
    if (input.courseId && !course)
      throw new BadRequestException("Catalog course not found");
    if (input.termId && !term) throw new BadRequestException("Term not found");

    const grade = clean(input.grade).toUpperCase();
    const countsTowardGpa =
      input.countsTowardGpa ?? policy?.countsTowardGpa ?? false;
    const countsTowardCredits =
      input.countsTowardCredits ?? policy?.countsTowardCredits ?? false;
    const gradePoints =
      input.gradePoints !== undefined
        ? input.gradePoints
        : (policy?.gradePoints ?? null);
    const earnedCredits =
      input.earnedCredits ?? (countsTowardCredits ? input.credits : 0);
    if (earnedCredits > input.credits) {
      throw new BadRequestException(
        "Earned credits cannot exceed attempted credits",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.transcriptEntry.create({
        data: {
          studentId,
          source: "manual",
          courseId: course?.id ?? null,
          termId: term?.id ?? null,
          courseCode: clean(input.courseCode),
          courseTitle: clean(input.courseTitle),
          termLabel: clean(input.termLabel),
          termSortKey:
            input.termSortKey ??
            (term ? sortKeyForDate(term.startDate, term.name) : null),
          grade,
          credits: input.credits,
          earnedCredits,
          gradePoints,
          countsTowardGpa: countsTowardGpa && gradePoints !== null,
          countsTowardCredits,
          requirementCategory:
            input.requirementCategory ?? course?.requirementCategory ?? null,
          note: input.note ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "TranscriptEntry",
          entityId: entry.id,
          action: "created",
          actorId,
          data: { after: entry },
        },
      });
      return entry;
    });
  }

  async update(actorId: string, entryId: string, input: TranscriptEntryPatch) {
    const existing = await this.prisma.transcriptEntry.findUnique({
      where: { id: entryId },
    });
    if (!existing) throw new NotFoundException("Transcript entry not found");
    if (existing.voidedAt) {
      throw new BadRequestException("Restore the entry before editing it");
    }
    const course =
      input.courseId === undefined || input.courseId === null
        ? null
        : await this.prisma.course.findUnique({
            where: { id: input.courseId },
          });
    if (input.courseId && !course)
      throw new BadRequestException("Catalog course not found");
    const term =
      input.termId === undefined || input.termId === null
        ? null
        : await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (input.termId && !term) throw new BadRequestException("Term not found");

    const grade = input.grade
      ? clean(input.grade).toUpperCase()
      : existing.grade;
    const policy =
      input.grade !== undefined &&
      input.gradePoints === undefined &&
      input.countsTowardGpa === undefined &&
      input.countsTowardCredits === undefined
        ? await this.defaultPolicy(grade)
        : null;
    const credits = input.credits ?? existing.credits;
    const gradePoints =
      input.gradePoints !== undefined
        ? input.gradePoints
        : (policy?.gradePoints ?? existing.gradePoints);
    const countsTowardCredits =
      input.countsTowardCredits ??
      policy?.countsTowardCredits ??
      existing.countsTowardCredits;
    const countsTowardGpa =
      (input.countsTowardGpa ??
        policy?.countsTowardGpa ??
        existing.countsTowardGpa) &&
      gradePoints !== null;
    const creditsChanged =
      input.credits !== undefined && input.credits !== existing.credits;
    const creditPolicyChanged =
      input.countsTowardCredits !== undefined &&
      input.countsTowardCredits !== existing.countsTowardCredits;
    const earnedCredits =
      input.earnedCredits ??
      (creditsChanged || creditPolicyChanged || policy
        ? countsTowardCredits
          ? credits
          : 0
        : existing.earnedCredits);
    if (earnedCredits > credits) {
      throw new BadRequestException(
        "Earned credits cannot exceed attempted credits",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transcriptEntry.update({
        where: { id: entryId },
        data: {
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
          ...(input.termId !== undefined ? { termId: input.termId } : {}),
          ...(input.courseCode !== undefined
            ? { courseCode: clean(input.courseCode) }
            : {}),
          ...(input.courseTitle !== undefined
            ? { courseTitle: clean(input.courseTitle) }
            : {}),
          ...(input.termLabel !== undefined
            ? { termLabel: clean(input.termLabel) }
            : {}),
          ...(input.termSortKey !== undefined
            ? { termSortKey: input.termSortKey }
            : input.termId !== undefined
              ? {
                  termSortKey: term
                    ? sortKeyForDate(term.startDate, term.name)
                    : null,
                }
              : {}),
          ...(input.grade !== undefined ? { grade } : {}),
          credits,
          earnedCredits,
          gradePoints,
          countsTowardGpa,
          countsTowardCredits,
          ...(input.requirementCategory !== undefined
            ? { requirementCategory: input.requirementCategory }
            : input.courseId !== undefined
              ? { requirementCategory: course?.requirementCategory ?? null }
              : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "TranscriptEntry",
          entityId: entryId,
          action: "updated",
          actorId,
          data: { reason: input.reason, before: existing, after: updated },
        },
      });
      return updated;
    });
  }

  async void(actorId: string, entryId: string, reason: string) {
    const existing = await this.prisma.transcriptEntry.findUnique({
      where: { id: entryId },
    });
    if (!existing) throw new NotFoundException("Transcript entry not found");
    if (existing.voidedAt) return existing;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transcriptEntry.update({
        where: { id: entryId },
        data: {
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: clean(reason),
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "TranscriptEntry",
          entityId: entryId,
          action: "voided",
          actorId,
          data: { reason: clean(reason), before: existing },
        },
      });
      return updated;
    });
  }

  async restore(actorId: string, entryId: string, reason: string) {
    const existing = await this.prisma.transcriptEntry.findUnique({
      where: { id: entryId },
    });
    if (!existing) throw new NotFoundException("Transcript entry not found");
    if (!existing.voidedAt) return existing;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transcriptEntry.update({
        where: { id: entryId },
        data: {
          voidedAt: null,
          voidedById: null,
          voidReason: null,
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "TranscriptEntry",
          entityId: entryId,
          action: "restored",
          actorId,
          data: { reason: clean(reason), before: existing },
        },
      });
      return updated;
    });
  }

  async history(entryId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity: "TranscriptEntry", entityId: entryId },
      orderBy: { createdAt: "desc" },
    });
  }
}
