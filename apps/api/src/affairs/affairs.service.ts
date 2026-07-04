import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// Weighted roommate-compatibility heuristic. (Phase 6 upgrades this to the "AI" feature.)
const WEIGHTS = { sleep: 30, tidy: 30, social: 20, study: 20 };

@Injectable()
export class AffairsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [halls, assigned, pending, openCases, lines] = await Promise.all([
      this.prisma.hall.findMany(),
      this.prisma.housingAssignment.count({ where: { status: "assigned" } }),
      this.prisma.housingAssignment.count({ where: { status: "pending" } }),
      this.prisma.conductCase.count({ where: { stage: { not: "resolved" } } }),
      this.prisma.coCurricularLine.findMany(),
    ]);
    const beds = halls.reduce((s, h) => s + h.beds, 0);
    const allocated = lines.reduce((s, l) => s + l.allocatedXof, 0);
    const spent = lines.reduce((s, l) => s + l.spentXof, 0);
    return {
      occupancy: { beds, filled: assigned, pct: beds === 0 ? 0 : Math.round((assigned / beds) * 100) },
      pendingAssignments: pending,
      openConductCases: openCases,
      budget: { allocated, spent, pct: allocated === 0 ? 0 : Math.round((spent / allocated) * 100) },
    };
  }

  async halls() {
    const halls = await this.prisma.hall.findMany({
      include: { _count: { select: { assignments: { where: { status: "assigned" } } } } },
      orderBy: { name: "asc" },
    });
    return halls.map((h) => ({ id: h.id, name: h.name, kind: h.kind, beds: h.beds, filled: h._count.assignments, color: h.color }));
  }

  async roster() {
    const rows = await this.prisma.housingAssignment.findMany({
      include: { student: { include: { person: true, program: true } }, hall: true },
      orderBy: { student: { studentNo: "asc" } },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      studentId: r.studentId,
      studentNo: r.student.studentNo,
      name: `${r.student.person.firstName} ${r.student.person.lastName}`,
      program: r.student.program?.code ?? "—",
      hall: r.hall?.name ?? "—",
      room: r.room ?? "—",
      status: r.status,
    }));
  }

  async requests() {
    const rows = await this.prisma.housingAssignment.findMany({
      where: { status: "pending" },
      include: { student: { include: { person: true } } },
      orderBy: { updatedAt: "asc" },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      studentId: r.studentId,
      name: `${r.student.person.firstName} ${r.student.person.lastName}`,
      studentNo: r.student.studentNo,
      need: r.note ?? "New assignment",
    }));
  }

  /**
   * Assign a room. When a housing fee is given, an Invoice tagged cost-center 3700 is created
   * so the charge rides the existing billing/payment rail and the director sees housing revenue.
   */
  async assignRoom(assignmentId: string, hallId: string, room: string, feeXof?: number) {
    const hall = await this.prisma.hall.findUnique({ where: { id: hallId } });
    if (!hall) throw new NotFoundException("Hall not found");
    const assignment = await this.prisma.housingAssignment.update({
      where: { id: assignmentId },
      data: { hallId, room, status: "assigned" },
    });

    if (feeXof && feeXof > 0) {
      const term = await this.prisma.term.findFirst({
        where: { endDate: { gte: new Date() } },
        orderBy: { startDate: "asc" },
      });
      if (!term) throw new BadRequestException("No active term to bill housing against");
      const invoice = await this.prisma.invoice.create({
        data: {
          studentId: assignment.studentId,
          termId: term.id,
          totalAmount: feeXof,
          costCenterCode: "3700",
        },
      });
      await this.prisma.auditLog.create({
        data: { entity: "Invoice", entityId: invoice.id, action: "housing-fee-billed", data: { assignmentId, hall: hall.name, room, feeXof } },
      });
    }
    return assignment;
  }

  /** Heuristic roommate matches for a student, ranked by weighted preference overlap. */
  async roommateMatches(studentId: string) {
    const subject = await this.prisma.roommateProfile.findUnique({
      where: { studentId },
      include: { student: { include: { person: true } } },
    });
    if (!subject) throw new NotFoundException("No roommate profile for this student");

    const others = await this.prisma.roommateProfile.findMany({
      where: { studentId: { not: studentId } },
      include: { student: { include: { person: true, housing: { include: { hall: true } } } } },
    });

    const keys = ["sleep", "tidy", "social", "study"] as const;
    const matches = others
      .map((o) => {
        let score = 0;
        const shared: string[] = [];
        const diff: string[] = [];
        for (const k of keys) {
          if (subject[k] === o[k]) {
            score += WEIGHTS[k];
            shared.push(`${k}: ${o[k]}`);
          } else {
            diff.push(k);
          }
        }
        return {
          studentId: o.studentId,
          name: `${o.student.person.firstName} ${o.student.person.lastName}`,
          hall: o.student.housing?.hall?.name ?? "Unassigned",
          room: o.student.housing?.room ?? "—",
          score,
          shared,
          diff,
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      subject: { name: `${subject.student.person.firstName} ${subject.student.person.lastName}`, prefs: { sleep: subject.sleep, tidy: subject.tidy, social: subject.social, study: subject.study } },
      matches,
    };
  }

  async roommateSubjects() {
    const profiles = await this.prisma.roommateProfile.findMany({
      include: { student: { include: { person: true } } },
      orderBy: { student: { studentNo: "asc" } },
    });
    return profiles.map((p) => ({ studentId: p.studentId, name: `${p.student.person.firstName} ${p.student.person.lastName}` }));
  }

  async conductCases() {
    const cases = await this.prisma.conductCase.findMany({ orderBy: { openedAt: "desc" } });
    return cases.map((c) => ({
      id: c.id,
      subject: c.subject,
      type: c.type,
      stage: c.stage,
      severity: c.severity,
      officer: c.officer,
      openedAt: c.openedAt,
      slaDueAt: c.slaDueAt,
      overdue: c.slaDueAt ? c.slaDueAt.getTime() < Date.now() && c.stage !== "resolved" : false,
    }));
  }

  async createConductCase(input: { subject: string; type: string; severity: string }) {
    const sla = new Date(Date.now() + 5 * 86_400_000); // 5-day SLA from intake
    return this.prisma.conductCase.create({
      data: { subject: input.subject, type: input.type, severity: input.severity as never, slaDueAt: sla },
    });
  }

  async advanceConduct(id: string, stage: string) {
    const order = ["intake", "investigation", "mediation", "hearing", "resolved"];
    if (!order.includes(stage)) throw new BadRequestException("Invalid stage");
    return this.prisma.conductCase.update({ where: { id }, data: { stage: stage as never } });
  }

  async clubs() {
    return this.prisma.club.findMany({ orderBy: { name: "asc" } });
  }

  async setClubStatus(id: string, status: string) {
    return this.prisma.club.update({ where: { id }, data: { status } });
  }

  async budget() {
    const lines = await this.prisma.coCurricularLine.findMany({ orderBy: { line: "asc" } });
    return lines.map((l) => ({
      line: l.line,
      allocated: l.allocatedXof,
      spent: l.spentXof,
      pct: l.allocatedXof === 0 ? 0 : Math.round((l.spentXof / l.allocatedXof) * 100),
      color: l.color,
    }));
  }

  async internationalCases() {
    const cases = await this.prisma.onboardingCase.findMany({ orderBy: { arrivalDate: "asc" } });
    return cases.map((c) => ({
      id: c.id,
      name: c.name,
      origin: c.origin,
      kind: c.kind,
      visaStatus: c.visaStatus,
      arrivalDate: c.arrivalDate,
      tasks: Array.isArray(c.tasks) ? (c.tasks as { label: string; done: boolean }[]) : [],
    }));
  }

  async toggleOnboardingTask(id: string, index: number, done: boolean) {
    const c = await this.prisma.onboardingCase.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Onboarding case not found");
    const tasks = Array.isArray(c.tasks) ? (c.tasks as { label: string; done: boolean }[]) : [];
    const current = Number.isInteger(index) ? tasks[index] : undefined;
    if (!current) throw new BadRequestException("Invalid task index");
    tasks[index] = { label: current.label, done: Boolean(done) };
    return this.prisma.onboardingCase.update({ where: { id }, data: { tasks } });
  }

  async eventsBoard() {
    return this.prisma.event.findMany({ orderBy: { startsAt: "asc" } });
  }

  async createBoardEvent(input: {
    title: string;
    category: string;
    location: string;
    organizer: string;
    attendees?: number;
    budgetXof?: number;
    startsAt: string;
    status: string;
  }) {
    if (!input.title || !input.startsAt) throw new BadRequestException("title and startsAt are required");
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("Invalid startsAt date");
    return this.prisma.event.create({
      data: {
        title: input.title,
        category: input.category || "Campus",
        location: input.location || null,
        organizer: input.organizer || null,
        attendees: input.attendees ?? null,
        budgetXof: input.budgetXof ?? null,
        status: ["planning", "upcoming", "past"].includes(input.status) ? input.status : "upcoming",
        startsAt,
      },
    });
  }

  async abroadPrograms() {
    return this.prisma.abroadProgram.findMany({ orderBy: { name: "asc" } });
  }

  async adjustAbroadSeat(id: string, delta: number) {
    if (delta !== 1 && delta !== -1) throw new BadRequestException("delta must be 1 or -1");
    const program = await this.prisma.abroadProgram.findUnique({ where: { id } });
    if (!program) throw new NotFoundException("Program not found");
    const seatsTaken = Math.min(program.seatsTotal, Math.max(0, program.seatsTaken + delta));
    const status = program.status === "closed" ? "closed" : seatsTaken >= program.seatsTotal ? "full" : "open";
    return this.prisma.abroadProgram.update({ where: { id }, data: { seatsTaken, status } });
  }

  async maintenanceTickets() {
    const rows = await this.prisma.maintenanceTicket.findMany({
      include: { hall: true },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    });
    return rows.map((t) => ({
      id: t.id,
      hallId: t.hallId,
      hall: t.hall.name,
      room: t.room,
      kind: t.kind,
      note: t.note,
      severity: t.severity,
      status: t.status,
      openedAt: t.openedAt,
    }));
  }

  async createMaintenanceTicket(input: { hallId: string; room?: string; kind: string; note?: string; severity: string }) {
    if (!input.hallId || !input.kind) throw new BadRequestException("hallId and kind are required");
    const hall = await this.prisma.hall.findUnique({ where: { id: input.hallId } });
    if (!hall) throw new NotFoundException("Hall not found");
    return this.prisma.maintenanceTicket.create({
      data: {
        hallId: input.hallId,
        room: input.room || null,
        kind: input.kind,
        note: input.note || null,
        severity: ["low", "med", "high"].includes(input.severity) ? input.severity : "low",
      },
    });
  }

  async resolveMaintenanceTicket(id: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return this.prisma.maintenanceTicket.update({ where: { id }, data: { status: "resolved" } });
  }
}
