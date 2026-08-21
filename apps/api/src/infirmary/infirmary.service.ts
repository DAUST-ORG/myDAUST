import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class InfirmaryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Settings ────────────────────────────────────────────────────────
  private readonly SETTINGS_PREFIX = "infirmary:";
  private readonly DEFAULT_SETTINGS: Record<string, string> = {
    clinic_name: "DAUST Health Center",
    clinic_address: "Dakar, Senegal",
    clinic_phone: "+221 33 000 0000",
    clinic_email: "health@daust.sn",
    notifications_enabled: "true",
    appointment_duration: "30",
    working_hours_start: "08:00",
    working_hours_end: "17:00",
  };

  async getSettings(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: this.SETTINGS_PREFIX } },
    });
    const result: Record<string, unknown> = { ...this.DEFAULT_SETTINGS };
    for (const row of rows) {
      const shortKey = row.key.slice(this.SETTINGS_PREFIX.length);
      result[shortKey] = row.valueJson;
    }
    return result;
  }

  async updateSettings(partial: Record<string, unknown>) {
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) continue;
      await this.prisma.appSetting.upsert({
        where: { key: `${this.SETTINGS_PREFIX}${k}` },
        update: { valueJson: v as any },
        create: { key: `${this.SETTINGS_PREFIX}${k}`, valueJson: v as any },
      });
    }
    return this.getSettings();
  }

  // ─── Consultations ───────────────────────────────────────────────────
  async listConsultations() {
    return this.prisma.consultation.findMany({
      orderBy: { visitedAt: "desc" },
      include: { student: { include: { person: true } } },
    });
  }

  async getConsultation(id: string) {
    const row = await this.prisma.consultation.findUnique({
      where: { id },
      include: { student: { include: { person: true } } },
    });
    if (!row) throw new NotFoundException("Consultation not found");
    return row;
  }

  async createConsultation(data: Record<string, unknown>) {
    return this.prisma.consultation.create({ data: data as any });
  }

  async updateConsultation(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.consultation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Consultation not found");
    return this.prisma.consultation.update({ where: { id }, data: data as any });
  }

  async deleteConsultation(id: string) {
    await this.prisma.consultation.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Consultation not found");
    });
    return { ok: true };
  }

  // ─── Prescriptions ───────────────────────────────────────────────────
  async listPrescriptions() {
    return this.prisma.prescription.findMany({
      orderBy: { prescribedAt: "desc" },
      include: { student: { include: { person: true } } },
    });
  }

  async createPrescription(data: Record<string, unknown>) {
    return this.prisma.prescription.create({ data: data as any });
  }

  async updatePrescription(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Prescription not found");
    return this.prisma.prescription.update({ where: { id }, data: data as any });
  }

  async deletePrescription(id: string) {
    await this.prisma.prescription.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Prescription not found");
    });
    return { ok: true };
  }

  // ─── Medications ─────────────────────────────────────────────────────
  async listMedications() {
    return this.prisma.medication.findMany({ orderBy: { name: "asc" } });
  }

  async createMedication(data: Record<string, unknown>) {
    return this.prisma.medication.create({ data: data as any });
  }

  async updateMedication(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.medication.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Medication not found");
    return this.prisma.medication.update({ where: { id }, data: data as any });
  }

  async deleteMedication(id: string) {
    await this.prisma.medication.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Medication not found");
    });
    return { ok: true };
  }

  // ─── Appointments ────────────────────────────────────────────────────
  async listAppointments() {
    return this.prisma.infirmaryAppointment.findMany({
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: { student: { include: { person: true } } },
    });
  }

  async createAppointment(data: Record<string, unknown>) {
    return this.prisma.infirmaryAppointment.create({ data: data as any });
  }

  async updateAppointment(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.infirmaryAppointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Appointment not found");
    return this.prisma.infirmaryAppointment.update({ where: { id }, data: data as any });
  }

  async deleteAppointment(id: string) {
    await this.prisma.infirmaryAppointment.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Appointment not found");
    });
    return { ok: true };
  }

  // ─── Documents ───────────────────────────────────────────────────────
  async listDocuments() {
    return this.prisma.infirmaryDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: { student: { include: { person: true } } },
    });
  }

  async createDocument(data: Record<string, unknown>) {
    return this.prisma.infirmaryDocument.create({ data: data as any });
  }

  async updateDocument(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.infirmaryDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Document not found");
    return this.prisma.infirmaryDocument.update({ where: { id }, data: data as any });
  }

  async deleteDocument(id: string) {
    await this.prisma.infirmaryDocument.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Document not found");
    });
    return { ok: true };
  }

  // ─── Follow-ups ──────────────────────────────────────────────────────
  async listFollowUps() {
    return this.prisma.followUp.findMany({
      orderBy: { dueDate: "asc" },
      include: { student: { include: { person: true } } },
    });
  }

  async createFollowUp(data: Record<string, unknown>) {
    return this.prisma.followUp.create({ data: data as any });
  }

  async updateFollowUp(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.followUp.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Follow-up not found");
    return this.prisma.followUp.update({ where: { id }, data: data as any });
  }

  async deleteFollowUp(id: string) {
    await this.prisma.followUp.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Follow-up not found");
    });
    return { ok: true };
  }

  // ─── Forms ───────────────────────────────────────────────────────────
  async listForms() {
    const forms = await this.prisma.infirmaryForm.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { responses: true } } },
    });
    return forms.map((f) => ({
      ...f,
      responseCount: f._count.responses,
      _count: undefined,
    }));
  }

  async getForm(id: string) {
    const form = await this.prisma.infirmaryForm.findUnique({
      where: { id },
      include: { responses: true },
    });
    if (!form) throw new NotFoundException("Form not found");
    return form;
  }

  async createForm(data: Record<string, unknown>) {
    return this.prisma.infirmaryForm.create({ data: data as any });
  }

  async updateForm(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.infirmaryForm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Form not found");
    return this.prisma.infirmaryForm.update({ where: { id }, data: data as any });
  }

  async deleteForm(id: string) {
    await this.prisma.infirmaryForm.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Form not found");
    });
    return { ok: true };
  }

  // ─── Form Responses ──────────────────────────────────────────────────
  async listFormResponses(formId: string) {
    return this.prisma.infirmaryFormResponse.findMany({
      where: { formId },
      orderBy: { submittedAt: "desc" },
    });
  }

  async createFormResponse(data: Record<string, unknown>) {
    return this.prisma.infirmaryFormResponse.create({ data: data as any });
  }

  async deleteFormResponse(id: string) {
    await this.prisma.infirmaryFormResponse.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Response not found");
    });
    return { ok: true };
  }

  // ─── Analytics ───────────────────────────────────────────────────────
  async getAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalStudents,
      consultationsThisMonth,
      totalConsultations,
      activePrescriptions,
      totalMedications,
      lowStockMedications,
      upcomingAppointments,
      pendingFollowUps,
      overdueFollowUps,
      totalFormResponses,
      documentsThisMonth,
    ] = await Promise.all([
      this.prisma.student.count({ where: { recordStatus: "active" } }),
      this.prisma.consultation.count({ where: { visitedAt: { gte: startOfMonth } } }),
      this.prisma.consultation.count(),
      this.prisma.prescription.count({ where: { status: "Active" } }),
      this.prisma.medication.count(),
      this.prisma.medication.count({ where: { status: { in: ["Low Stock", "Out of Stock"] } } }),
      this.prisma.infirmaryAppointment.count({
        where: { date: { gte: startOfMonth }, status: { in: ["Scheduled", "Checked In"] } },
      }),
      this.prisma.followUp.count({ where: { status: "Pending" } }),
      this.prisma.followUp.count({ where: { status: "Overdue" } }),
      this.prisma.infirmaryFormResponse.count(),
      this.prisma.infirmaryDocument.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // Monthly consultation trend (last 6 months)
    const monthlyConsultations = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = await this.prisma.consultation.count({
        where: { visitedAt: { gte: d, lt: nextMonth } },
      });
      monthlyConsultations.push({
        label: d.toLocaleString("en", { month: "short" }),
        count,
      });
    }

    return {
      totalStudents,
      consultationsThisMonth,
      totalConsultations,
      activePrescriptions,
      totalMedications,
      lowStockMedications,
      upcomingAppointments,
      pendingFollowUps,
      overdueFollowUps,
      totalFormResponses,
      documentsThisMonth,
      monthlyConsultations,
    };
  }

  // ─── Students (enriched from SIS) ────────────────────────────────────
  async listStudents() {
    const students = await this.prisma.student.findMany({
      where: { recordStatus: "active" },
      include: { person: true, program: true },
      orderBy: { person: { firstName: "asc" } },
    });
    return students.map((s) => ({
      id: s.id,
      name: `${s.person.firstName} ${s.person.lastName}`,
      initials: `${s.person.firstName[0]}${s.person.lastName[0]}`.toUpperCase(),
      program: s.program?.name ?? "—",
      year: s.yearLevel ? `Year ${s.yearLevel}` : "—",
      status: "Active",
      lastVisit: "Never",
      allergies: s.allergies ? s.allergies.split(",").map((a: string) => a.trim()).filter(Boolean) : [],
      concern: "",
      email: s.person.email ?? "",
      phone: s.phone ?? "",
      dateOfBirth: s.dateOfBirth?.toISOString().split("T")[0] ?? "",
      gender: s.gender ?? "",
      bloodType: s.bloodType ?? undefined,
      emergencyContact: s.emergencyName2 ?? undefined,
      emergencyPhone: s.emergencyPhone2 ?? undefined,
      medicalHistory: [],
      height: undefined,
      weight: undefined,
    }));
  }
}
