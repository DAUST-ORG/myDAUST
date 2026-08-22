import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

/** Safe person select — never expose passwordHash, status, sessionVersion, or suspendedAt. */
const SAFE_PERSON = { firstName: true, lastName: true, email: true } satisfies Prisma.PersonSelect;

/** Student + person select used by list endpoints that return nested student info. */
const STUDENT_WITH_PERSON = {
  select: {
    id: true,
    person: { select: SAFE_PERSON },
  },
};

@Injectable()
export class InfirmaryService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(actorId: string, action: string, entity: string, entityId: string, data?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: { actorId, action, entity, entityId, data: (data as any) ?? undefined },
      });
    } catch {
      // Audit log failure should never crash the parent mutation
    }
  }

  private handleDelete(e: unknown): never {
    const code = (e as any)?.code;
    if (code === "P2025") throw new NotFoundException("Record not found");
    if (code === "P2003") throw new NotFoundException("Cannot delete: record is referenced by other data");
    throw e;
  }

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
      include: { student: STUDENT_WITH_PERSON },
    });
  }

  async getConsultation(id: string) {
    const row = await this.prisma.consultation.findUnique({
      where: { id },
      include: { student: STUDENT_WITH_PERSON },
    });
    if (!row) throw new NotFoundException("Consultation not found");
    return row;
  }

  async createConsultation(data: Record<string, unknown>, actorId: string) {
    const { studentId, reason, visitType, clinicalNotes, status, followUpRequired, vitalsJson, diagnosis, treatmentPlan } = data as any;
    const created = await this.prisma.consultation.create({
      data: {
        studentId,
        reason,
        visitType,
        clinicalNotes: clinicalNotes ?? "",
        status: status ?? "Completed",
        followUpRequired: followUpRequired ?? false,
        vitalsJson: vitalsJson ?? undefined,
        diagnosis: diagnosis ?? undefined,
        treatmentPlan: treatmentPlan ?? undefined,
        clinicianId: actorId,
      },
    });
    await this.audit(actorId, "consultation.create", "Consultation", created.id, { studentId, reason });
    return created;
  }

  async updateConsultation(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.consultation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Consultation not found");
    const updated = await this.prisma.consultation.update({ where: { id }, data: data as any });
    await this.audit(actorId, "consultation.update", "Consultation", id, data);
    return updated;
  }

  async deleteConsultation(id: string, actorId: string) {
    try {
      await this.prisma.consultation.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "consultation.delete", "Consultation", id);
    return { ok: true };
  }

  // ─── Prescriptions ───────────────────────────────────────────────────
  async listPrescriptions() {
    return this.prisma.prescription.findMany({
      orderBy: { prescribedAt: "desc" },
      include: { student: STUDENT_WITH_PERSON },
    });
  }

  async createPrescription(data: Record<string, unknown>, actorId: string) {
    const { studentId, medication, dosage, frequency, duration, instructions, status, consultationId } = data as any;
    const created = await this.prisma.prescription.create({
      data: {
        studentId,
        medication,
        dosage,
        frequency,
        duration,
        instructions: instructions ?? "",
        status: status ?? "Active",
        consultationId: consultationId ?? undefined,
        authorId: actorId,
      },
    });
    await this.audit(actorId, "prescription.create", "Prescription", created.id, { studentId, medication });
    return created;
  }

  async updatePrescription(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Prescription not found");
    const updated = await this.prisma.prescription.update({ where: { id }, data: data as any });
    await this.audit(actorId, "prescription.update", "Prescription", id, data);
    return updated;
  }

  async deletePrescription(id: string, actorId: string) {
    try {
      await this.prisma.prescription.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "prescription.delete", "Prescription", id);
    return { ok: true };
  }

  // ─── Medications ─────────────────────────────────────────────────────
  async listMedications() {
    return this.prisma.medication.findMany({ orderBy: { name: "asc" } });
  }

  async createMedication(data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.medication.create({ data: data as any });
    await this.audit(actorId, "medication.create", "Medication", created.id, { name: (data as any).name });
    return created;
  }

  async updateMedication(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.medication.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Medication not found");
    const updated = await this.prisma.medication.update({ where: { id }, data: data as any });
    await this.audit(actorId, "medication.update", "Medication", id, data);
    return updated;
  }

  async deleteMedication(id: string, actorId: string) {
    try {
      await this.prisma.medication.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "medication.delete", "Medication", id);
    return { ok: true };
  }

  // ─── Appointments ────────────────────────────────────────────────────
  async listAppointments() {
    return this.prisma.infirmaryAppointment.findMany({
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: { student: STUDENT_WITH_PERSON },
    });
  }

  async createAppointment(data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.infirmaryAppointment.create({ data: data as any });
    await this.audit(actorId, "appointment.create", "InfirmaryAppointment", created.id, { studentId: (data as any).studentId });
    return created;
  }

  async updateAppointment(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.infirmaryAppointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Appointment not found");
    const updated = await this.prisma.infirmaryAppointment.update({ where: { id }, data: data as any });
    await this.audit(actorId, "appointment.update", "InfirmaryAppointment", id, data);
    return updated;
  }

  async deleteAppointment(id: string, actorId: string) {
    try {
      await this.prisma.infirmaryAppointment.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "appointment.delete", "InfirmaryAppointment", id);
    return { ok: true };
  }

  // ─── Documents ───────────────────────────────────────────────────────
  async listDocuments() {
    return this.prisma.infirmaryDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: { student: STUDENT_WITH_PERSON },
    });
  }

  async createDocument(data: Record<string, unknown>, actorId: string) {
    const { studentId, name, type, notes } = data as any;
    const created = await this.prisma.infirmaryDocument.create({
      data: { studentId, name, type: type ?? "Other", notes: notes ?? "", uploaderId: actorId },
    });
    await this.audit(actorId, "document.create", "InfirmaryDocument", created.id, { name });
    return created;
  }

  async updateDocument(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.infirmaryDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Document not found");
    const updated = await this.prisma.infirmaryDocument.update({ where: { id }, data: data as any });
    await this.audit(actorId, "document.update", "InfirmaryDocument", id, data);
    return updated;
  }

  async deleteDocument(id: string, actorId: string) {
    try {
      await this.prisma.infirmaryDocument.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "document.delete", "InfirmaryDocument", id);
    return { ok: true };
  }

  // ─── Follow-ups ──────────────────────────────────────────────────────
  async listFollowUps() {
    return this.prisma.followUp.findMany({
      orderBy: { dueDate: "asc" },
      include: { student: STUDENT_WITH_PERSON },
    });
  }

  async createFollowUp(data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.followUp.create({ data: data as any });
    await this.audit(actorId, "followUp.create", "FollowUp", created.id, { studentId: (data as any).studentId });
    return created;
  }

  async updateFollowUp(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.followUp.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Follow-up not found");
    const updated = await this.prisma.followUp.update({ where: { id }, data: data as any });
    await this.audit(actorId, "followUp.update", "FollowUp", id, data);
    return updated;
  }

  async deleteFollowUp(id: string, actorId: string) {
    try {
      await this.prisma.followUp.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "followUp.delete", "FollowUp", id);
    return { ok: true };
  }

  // ─── Forms ───────────────────────────────────────────────────────────
  async listForms() {
    const forms = await this.prisma.infirmaryForm.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { responses: true } } },
    });
    return forms.map(({ _count, ...f }) => ({
      ...f,
      responseCount: _count.responses,
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

  async createForm(data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.infirmaryForm.create({ data: data as any });
    await this.audit(actorId, "form.create", "InfirmaryForm", created.id, { name: (data as any).name });
    return created;
  }

  async updateForm(id: string, data: Record<string, unknown>, actorId: string) {
    const existing = await this.prisma.infirmaryForm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Form not found");
    const updated = await this.prisma.infirmaryForm.update({ where: { id }, data: data as any });
    await this.audit(actorId, "form.update", "InfirmaryForm", id, data);
    return updated;
  }

  async deleteForm(id: string, actorId: string) {
    try {
      await this.prisma.infirmaryForm.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "form.delete", "InfirmaryForm", id);
    return { ok: true };
  }

  // ─── Form Responses ──────────────────────────────────────────────────
  async listFormResponses(formId: string) {
    return this.prisma.infirmaryFormResponse.findMany({
      where: { formId },
      orderBy: { submittedAt: "desc" },
    });
  }

  async createFormResponse(data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.infirmaryFormResponse.create({ data: data as any });
    await this.audit(actorId, "formResponse.create", "InfirmaryFormResponse", created.id, { formId: (data as any).formId });
    return created;
  }

  async deleteFormResponse(id: string, actorId: string) {
    try {
      await this.prisma.infirmaryFormResponse.delete({ where: { id } });
    } catch (e) {
      this.handleDelete(e);
    }
    await this.audit(actorId, "formResponse.delete", "InfirmaryFormResponse", id);
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
      include: { person: { select: SAFE_PERSON }, program: true },
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
