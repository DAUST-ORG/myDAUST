import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  canFacultySeeResults,
  effectiveWindow,
  isOpen,
} from "./evaluation-release.js";

type Kind = "midterm" | "final";

@Injectable()
export class EvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ownership check, deliberately local: §4 keeps these per-service. */
  private async assertSectionOwner(
    sectionId: string,
    personId: string,
    isAdmin: boolean,
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section) throw new NotFoundException("Section not found");
    if (!isAdmin && section.instructorId !== personId) {
      throw new ForbiddenException("You do not teach this section");
    }
    return section;
  }

  // --- Director: windows -------------------------------------------------

  listWindows() {
    return this.prisma.courseEvaluationWindow.findMany({
      include: { term: { select: { name: true } } },
      orderBy: [{ boundsOpenAt: "desc" }],
    });
  }

  async upsertWindow(
    input: {
      termId: string;
      kind: Kind;
      status?: "draft" | "open" | "closed";
      boundsOpenAt: string;
      boundsCloseAt: string;
      minResponsesToRelease?: number;
    },
    actorId: string,
  ) {
    const open = new Date(input.boundsOpenAt);
    const close = new Date(input.boundsCloseAt);
    if (!(open < close)) {
      throw new BadRequestException("The window must open before it closes");
    }
    const data = {
      status: (input.status ?? "draft") as never,
      boundsOpenAt: open,
      boundsCloseAt: close,
      ...(input.minResponsesToRelease !== undefined
        ? { minResponsesToRelease: input.minResponsesToRelease }
        : {}),
    };
    return this.prisma.courseEvaluationWindow.upsert({
      where: { termId_kind: { termId: input.termId, kind: input.kind as never } },
      create: {
        termId: input.termId,
        kind: input.kind as never,
        createdById: actorId,
        ...data,
      },
      update: data,
    });
  }

  /**
   * Director-only view: every response, live, with no floor applied. The floor governs
   * what faculty may see, not what the director may see.
   */
  async windowResults(windowId: string) {
    const window = await this.prisma.courseEvaluationWindow.findUnique({
      where: { id: windowId },
    });
    if (!window) throw new NotFoundException("Evaluation window not found");
    const [responses, receipts] = await Promise.all([
      this.prisma.courseEvaluationResponse.findMany({
        where: { windowId },
        include: { section: { include: { course: true, instructor: true } } },
      }),
      this.prisma.courseEvaluationReceipt.count({ where: { windowId } }),
    ]);
    const bySection = new Map<string, typeof responses>();
    for (const r of responses) {
      bySection.set(r.sectionId, [...(bySection.get(r.sectionId) ?? []), r]);
    }
    return {
      window,
      totalResponses: receipts,
      sections: [...bySection.entries()].map(([sectionId, rows]) => {
        const first = rows[0]!;
        return {
          sectionId,
          course: `${first.section.course.code} — ${first.section.course.title}`,
          sectionCode: first.section.sectionCode,
          instructor: first.section.instructor
            ? `${first.section.instructor.firstName} ${first.section.instructor.lastName}`
            : null,
          responseCount: rows.length,
          meetsFloor: rows.length >= window.minResponsesToRelease,
          ...this.aggregate(rows),
        };
      }),
    };
  }

  private aggregate(
    rows: { overall: number; clarity: number; workload: number; comment: string | null }[],
  ) {
    const avg = (pick: (r: (typeof rows)[number]) => number) =>
      rows.length === 0
        ? null
        : Math.round((rows.reduce((s, r) => s + pick(r), 0) / rows.length) * 10) / 10;
    return {
      overall: avg((r) => r.overall),
      clarity: avg((r) => r.clarity),
      workload: avg((r) => r.workload),
      comments: rows.map((r) => r.comment).filter((c): c is string => Boolean(c)),
    };
  }

  /** Release a round to faculty. Reversible, and audited. */
  async setReleased(windowId: string, released: boolean, actorId: string) {
    const window = await this.prisma.courseEvaluationWindow.findUnique({
      where: { id: windowId },
    });
    if (!window) throw new NotFoundException("Evaluation window not found");
    await this.prisma.auditLog.create({
      data: {
        entity: "CourseEvaluationWindow",
        entityId: windowId,
        action: released ? "released" : "unreleased",
        actorId,
      },
    });
    return this.prisma.courseEvaluationWindow.update({
      where: { id: windowId },
      data: { status: (released ? "closed" : "open") as never },
    });
  }

  // --- Faculty -----------------------------------------------------------

  /** Narrow this section's window inside the director's bounds. */
  async setSectionSchedule(
    sectionId: string,
    windowId: string,
    input: { opensAt: string; closesAt: string },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const window = await this.prisma.courseEvaluationWindow.findUnique({
      where: { id: windowId },
    });
    if (!window) throw new NotFoundException("Evaluation window not found");
    const opensAt = new Date(input.opensAt);
    const closesAt = new Date(input.closesAt);
    if (!(opensAt < closesAt)) {
      throw new BadRequestException("The window must open before it closes");
    }
    if (opensAt < window.boundsOpenAt || closesAt > window.boundsCloseAt) {
      throw new BadRequestException(
        "Your dates must sit inside the dates the director set for this round",
      );
    }
    return this.prisma.courseEvaluationSchedule.upsert({
      where: { windowId_sectionId: { windowId, sectionId } },
      create: { windowId, sectionId, opensAt, closesAt },
      update: { opensAt, closesAt },
    });
  }

  async sectionResults(sectionId: string, personId: string, isAdmin: boolean) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const windows = await this.prisma.courseEvaluationWindow.findMany({
      orderBy: { boundsOpenAt: "desc" },
    });
    const submission = await this.prisma.gradeSubmission.findUnique({
      where: { sectionId },
      select: { status: true },
    });
    return Promise.all(
      windows.map(async (w) => {
        const rows = await this.prisma.courseEvaluationResponse.findMany({
          where: { windowId: w.id, sectionId },
        });
        const verdict = canFacultySeeResults({
          releasedToFaculty: w.status === "closed",
          responseCount: rows.length,
          minResponses: w.minResponsesToRelease,
          gradeSubmissionStatus: submission?.status ?? null,
          kind: w.kind as Kind,
        });
        return {
          windowId: w.id,
          kind: w.kind,
          responseCount: rows.length,
          ...(verdict.visible
            ? { visible: true as const, ...this.aggregate(rows) }
            : { visible: false as const, reason: verdict.reason }),
        };
      }),
    );
  }

  // --- Student -----------------------------------------------------------

  /** Sections this student can evaluate right now, minus any already answered. */
  async pending(studentId: string) {
    const now = new Date();
    const windows = await this.prisma.courseEvaluationWindow.findMany({
      where: { status: "open" },
      include: { schedules: true },
    });
    if (windows.length === 0) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: "enrolled" },
      include: { section: { include: { course: true, instructor: true } } },
    });
    const receipts = await this.prisma.courseEvaluationReceipt.findMany({
      where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
      select: { windowId: true, enrollmentId: true },
    });
    const answered = new Set(receipts.map((r) => `${r.windowId}:${r.enrollmentId}`));

    const out: unknown[] = [];
    for (const w of windows) {
      for (const e of enrollments) {
        if (e.section.termId !== w.termId) continue;
        if (answered.has(`${w.id}:${e.id}`)) continue;
        const schedule = w.schedules.find((s) => s.sectionId === e.sectionId) ?? null;
        const eff = effectiveWindow(w, schedule);
        if (!isOpen(w.status, eff, now)) continue;
        out.push({
          windowId: w.id,
          kind: w.kind,
          sectionId: e.sectionId,
          course: `${e.section.course.code} — ${e.section.course.title}`,
          instructor: e.section.instructor
            ? `${e.section.instructor.firstName} ${e.section.instructor.lastName}`
            : null,
          closesAt: eff.closesAt,
        });
      }
    }
    return out;
  }

  /**
   * Record one evaluation. The answers and the receipt are written in the same
   * transaction and share no key, so nothing can attribute a response to a student.
   */
  async submit(
    studentId: string,
    windowId: string,
    sectionId: string,
    input: { overall: number; clarity: number; workload: number; comment?: string },
  ) {
    const [window, enrollment] = await Promise.all([
      this.prisma.courseEvaluationWindow.findUnique({
        where: { id: windowId },
        include: { schedules: { where: { sectionId } } },
      }),
      this.prisma.enrollment.findUnique({
        where: { studentId_sectionId: { studentId, sectionId } },
        select: { id: true, status: true },
      }),
    ]);
    if (!window) throw new NotFoundException("Evaluation window not found");
    if (!enrollment || enrollment.status !== "enrolled") {
      throw new ForbiddenException("You are not enrolled in this section");
    }
    const eff = effectiveWindow(window, window.schedules[0] ?? null);
    if (!isOpen(window.status, eff, new Date())) {
      throw new BadRequestException("This evaluation is not open");
    }

    // Calendar date only: an instant would correlate a response with its receipt in a
    // small section and undo the anonymity the split table exists to provide.
    const submittedOn = new Date();
    submittedOn.setUTCHours(0, 0, 0, 0);

    try {
      await this.prisma.$transaction([
        this.prisma.courseEvaluationResponse.create({
          data: {
            windowId,
            sectionId,
            overall: input.overall,
            clarity: input.clarity,
            workload: input.workload,
            comment: input.comment?.trim() || null,
            submittedOn,
          },
        }),
        this.prisma.courseEvaluationReceipt.create({
          data: { windowId, enrollmentId: enrollment.id },
        }),
      ]);
    } catch {
      // The unique receipt is what makes a double submit impossible; both writes roll
      // back together, so a retry never leaves an orphan response.
      throw new BadRequestException("You have already evaluated this course");
    }
    return { ok: true };
  }
}
