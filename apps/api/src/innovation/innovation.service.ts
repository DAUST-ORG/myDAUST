import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const PHASES = [
  { id: "proposal", name: "Proposal", short: "Form team & submit proposal" },
  { id: "research", name: "Research", short: "Literature review & problem framing" },
  { id: "design", name: "Design", short: "Architecture, specs & plan" },
  { id: "build", name: "Build", short: "Prototype & implementation" },
  { id: "test", name: "Test", short: "Testing & iteration" },
  { id: "showcase", name: "Showcase", short: "Innovation Expo & Demo Day" },
  { id: "final", name: "Final", short: "Final report & handover" },
] as const;
const phaseIndex = (id: string) => PHASES.findIndex((p) => p.id === id);

@Injectable()
export class InnovationService {
  constructor(private readonly prisma: PrismaService) {}

  private roadmap(currentPhase: string) {
    const cur = phaseIndex(currentPhase);
    return PHASES.map((p, i) => ({
      id: p.id,
      name: p.name,
      short: p.short,
      status: i < cur ? "done" : i === cur ? "current" : "upcoming",
    }));
  }

  // --- Student (project member) ---

  async myProject(personId: string) {
    const membership = await this.prisma.projectMember.findFirst({
      where: { personId },
      include: {
        project: {
          include: {
            members: { include: { person: true } },
            tasks: { orderBy: { dueDate: "asc" } },
            submissions: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!membership) return null;
    const p = membership.project;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      phase: p.phase,
      advisor: p.advisor,
      status: p.status,
      grade: p.grade,
      roadmap: this.roadmap(p.phase),
      members: p.members.map((m) => ({ name: `${m.person.firstName} ${m.person.lastName}`, role: m.role })),
      tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, phase: t.phase, status: t.status, dueDate: t.dueDate })),
      submissions: p.submissions.map((s) => ({ id: s.id, title: s.title, kind: s.kind, status: s.status, grade: s.grade, feedback: s.feedback, fileName: s.fileName, createdAt: s.createdAt })),
    };
  }

  private async assertMember(projectId: string, personId: string) {
    const m = await this.prisma.projectMember.findUnique({ where: { projectId_personId: { projectId, personId } } });
    if (!m) throw new ForbiddenException("Not a member of this project");
  }

  async toggleTask(taskId: string, personId: string) {
    const task = await this.prisma.projectTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found");
    await this.assertMember(task.projectId, personId);
    return this.prisma.projectTask.update({ where: { id: taskId }, data: { status: task.status === "done" ? "todo" : "done" } });
  }

  async submit(projectId: string, personId: string, input: { title: string; kind: string; fileUrl?: string; fileName?: string }) {
    await this.assertMember(projectId, personId);
    return this.prisma.projectSubmission.create({
      data: { projectId, title: input.title, kind: input.kind, fileUrl: input.fileUrl ?? null, fileName: input.fileName ?? null },
    });
  }

  // --- Admin (innovation studio) ---

  async adminOverview() {
    const [byPhase, total, pending] = await Promise.all([
      this.prisma.project.groupBy({ by: ["phase"], _count: true }),
      this.prisma.project.count(),
      this.prisma.projectSubmission.count({ where: { status: "submitted" } }),
    ]);
    return {
      total,
      pendingReviews: byPhase.length === 0 ? 0 : pending,
      phases: PHASES.map((p) => ({ id: p.id, name: p.name, count: byPhase.find((b) => b.phase === p.id)?._count ?? 0 })),
    };
  }

  async adminProjects() {
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      include: { members: { include: { person: true } }, _count: { select: { submissions: { where: { status: "submitted" } } } } },
    });
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      phase: p.phase,
      advisor: p.advisor,
      status: p.status,
      grade: p.grade,
      members: p.members.map((m) => `${m.person.firstName} ${m.person.lastName}`),
      pendingReviews: p._count.submissions,
    }));
  }

  async reviewQueue() {
    const subs = await this.prisma.projectSubmission.findMany({
      where: { status: "submitted" },
      orderBy: { createdAt: "asc" },
      include: { project: true },
    });
    return subs.map((s) => ({ id: s.id, project: s.project.name, projectId: s.projectId, title: s.title, kind: s.kind, fileName: s.fileName, fileUrl: s.fileUrl, createdAt: s.createdAt }));
  }

  async projectDetail(id: string) {
    const p = await this.prisma.project.findUnique({
      where: { id },
      include: { members: { include: { person: true } }, tasks: true, submissions: { orderBy: { createdAt: "desc" } } },
    });
    if (!p) throw new NotFoundException("Project not found");
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      phase: p.phase,
      advisor: p.advisor,
      status: p.status,
      grade: p.grade,
      roadmap: this.roadmap(p.phase),
      members: p.members.map((m) => ({ name: `${m.person.firstName} ${m.person.lastName}`, role: m.role })),
      submissions: p.submissions.map((s) => ({ id: s.id, title: s.title, kind: s.kind, status: s.status, grade: s.grade, feedback: s.feedback, fileName: s.fileName, fileUrl: s.fileUrl })),
    };
  }

  async advancePhase(id: string) {
    const p = await this.prisma.project.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Project not found");
    const next = phaseIndex(p.phase) + 1;
    if (next >= PHASES.length) throw new BadRequestException("Already in final phase");
    return this.prisma.project.update({ where: { id }, data: { phase: PHASES[next]!.id as never } });
  }

  async gradeSubmission(submissionId: string, grade: string, feedback?: string) {
    return this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data: { grade, feedback: feedback ?? null, status: "reviewed" },
    });
  }
}
