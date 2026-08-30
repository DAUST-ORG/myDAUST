import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const NOTE_KINDS = ["general", "financial", "academic", "followup"] as const;
export type AdmissionNoteKind = (typeof NOTE_KINDS)[number];

const NOTE_SELECT = {
  id: true,
  applicantId: true,
  authorId: true,
  kind: true,
  body: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Per-applicant notes thread. Authored by admissions officers (or admins) and
 * scoped to the pre-acceptance pipeline. Hard-deletable; the audit log
 * retains the metadata but not the body.
 *
 * Authorisation is per-call rather than a shared guard: an admissions officer
 * can edit their own notes only; admins can edit any. There is no per-applicant
 * row-level filter — admissions officers read each other's notes for handover.
 */
@Injectable()
export class ApplicantNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List notes for an applicant. Pinned notes always come first regardless of
   * the cursor; within each group, oldest-first.
   */
  async list(applicantId: string, limit = 50) {
    return this.prisma.admissionNote.findMany({
      where: { applicantId },
      orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
      take: Math.min(Math.max(1, limit), 100),
      select: NOTE_SELECT,
    });
  }

  async create(
    actorId: string,
    applicantId: string,
    input: { kind?: AdmissionNoteKind; body: string },
  ) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { id: true },
    });
    if (!applicant) throw new NotFoundException("Applicant not found");

    const kind = input.kind ?? "general";
    if (!NOTE_KINDS.includes(kind)) {
      throw new ForbiddenException(`Unknown note kind: ${kind}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.admissionNote.create({
        data: {
          applicantId,
          authorId: actorId,
          kind,
          body: input.body.trim(),
        },
        select: NOTE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          entity: "AdmissionNote",
          entityId: note.id,
          action: "admission-note-created",
          actorId,
          data: { applicantId, kind },
        },
      });
      return note;
    });
  }

  async update(
    actorId: string,
    actorIsAdmin: boolean,
    applicantId: string,
    noteId: string,
    input: { body?: string; kind?: AdmissionNoteKind; pinned?: boolean },
  ) {
    const note = await this.prisma.admissionNote.findUnique({
      where: { id: noteId },
      select: { id: true, applicantId: true, authorId: true, kind: true },
    });
    if (!note || note.applicantId !== applicantId) {
      throw new NotFoundException("Note not found");
    }
    if (!actorIsAdmin && note.authorId !== actorId) {
      throw new ForbiddenException("Only the author or an admin can edit this note");
    }
    if (input.kind !== undefined && !NOTE_KINDS.includes(input.kind)) {
      throw new ForbiddenException(`Unknown note kind: ${input.kind}`);
    }

    const edited = Boolean(
      (input.body !== undefined && input.body.trim() !== "") ||
        input.kind !== undefined ||
        input.pinned !== undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.admissionNote.update({
        where: { id: noteId },
        data: {
          ...(input.body !== undefined ? { body: input.body.trim() } : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
          ...(edited ? { editedAt: new Date() } : {}),
        },
        select: NOTE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          entity: "AdmissionNote",
          entityId: noteId,
          action: "admission-note-updated",
          actorId,
          data: {
            applicantId,
            bodyChanged: input.body !== undefined,
            kindChanged: input.kind !== undefined,
            pinnedChanged: input.pinned !== undefined,
          },
        },
      });
      return updated;
    });
  }

  async remove(actorId: string, actorIsAdmin: boolean, applicantId: string, noteId: string) {
    const note = await this.prisma.admissionNote.findUnique({
      where: { id: noteId },
      select: { id: true, applicantId: true, authorId: true, kind: true, body: true },
    });
    if (!note || note.applicantId !== applicantId) {
      throw new NotFoundException("Note not found");
    }
    if (!actorIsAdmin && note.authorId !== actorId) {
      throw new ForbiddenException("Only the author or an admin can delete this note");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.admissionNote.delete({ where: { id: noteId } });
      await tx.auditLog.create({
        data: {
          entity: "AdmissionNote",
          entityId: noteId,
          action: "admission-note-deleted",
          actorId,
          data: { applicantId, kind: note.kind, bodyLength: note.body.length },
        },
      });
    });
    return { deleted: noteId };
  }
}
