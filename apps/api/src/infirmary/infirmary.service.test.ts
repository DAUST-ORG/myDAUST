import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { InfirmaryService } from "./infirmary.service.js";

function mockPrisma() {
  return {
    consultation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "c-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    prescription: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "p-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    medication: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "m-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    infirmaryAppointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "a-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    infirmaryDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "d-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    followUp: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "f-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    infirmaryForm: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "form-1", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    infirmaryFormResponse: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "resp-1", ...data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    appSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
    student: {
      count: vi.fn().mockResolvedValue(10),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const ACTOR = "nurse-actor-id";

describe("InfirmaryService", () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let svc: InfirmaryService;

  beforeEach(() => {
    prisma = mockPrisma();
    svc = new InfirmaryService(prisma as never);
  });

  describe("Consultations", () => {
    it("listConsultations returns all", async () => {
      prisma.consultation.findMany.mockResolvedValue([{ id: "c-1" }]);
      const result = await svc.listConsultations();
      expect(result).toHaveLength(1);
    });

    it("getConsultation throws 404 for missing", async () => {
      prisma.consultation.findUnique.mockResolvedValue(null);
      await expect(svc.getConsultation("missing")).rejects.toThrow(NotFoundException);
    });

    it("getConsultation returns existing", async () => {
      prisma.consultation.findUnique.mockResolvedValue({ id: "c-1", reason: "headache" });
      const result = await svc.getConsultation("c-1");
      expect(result.id).toBe("c-1");
    });

    it("createConsultation sets clinicianId from actor", async () => {
      await svc.createConsultation({ studentId: "s-1", reason: "flu", visitType: "Walk-in" }, ACTOR);
      const callArgs = prisma.consultation.create.mock.calls[0][0];
      expect(callArgs.data.clinicianId).toBe(ACTOR);
      expect(callArgs.data.studentId).toBe("s-1");
    });

    it("createConsultation writes audit log", async () => {
      await svc.createConsultation({ studentId: "s-1", reason: "test", visitType: "Routine" }, ACTOR);
      expect(prisma.auditLog.create).toHaveBeenCalledOnce();
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.entity).toBe("Consultation");
      expect(audit.data.action).toBe("consultation.create");
      expect(audit.data.actorId).toBe(ACTOR);
    });

    it("audit failure does not crash the mutation", async () => {
      prisma.auditLog.create.mockRejectedValue(new Error("DB down"));
      const result = await svc.createConsultation({ studentId: "s-1", reason: "test", visitType: "Routine" }, ACTOR);
      expect(result.id).toBe("c-1");
    });

    it("updateConsultation throws 404 for missing", async () => {
      prisma.consultation.findUnique.mockResolvedValue(null);
      await expect(svc.updateConsultation("missing", { reason: "x" }, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it("updateConsultation writes audit", async () => {
      prisma.consultation.findUnique.mockResolvedValue({ id: "c-1" });
      await svc.updateConsultation("c-1", { reason: "updated" }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("consultation.update");
      expect(audit.data.entityId).toBe("c-1");
    });

    it("deleteConsultation catches P2025 as 404", async () => {
      prisma.consultation.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteConsultation("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });

    it("deleteConsultation catches P2003 as constraint error", async () => {
      prisma.consultation.delete.mockRejectedValue({ code: "P2003" });
      await expect(svc.deleteConsultation("c-1", ACTOR)).rejects.toThrow(NotFoundException);
      await expect(svc.deleteConsultation("c-1", ACTOR)).rejects.toThrow("referenced by other data");
    });

    it("deleteConsultation rethrows non-P2025/P2003 errors", async () => {
      prisma.consultation.delete.mockRejectedValue({ code: "P1234" });
      await expect(svc.deleteConsultation("c-1", ACTOR)).rejects.toMatchObject({ code: "P1234" });
    });

    it("deleteConsultation writes audit on success", async () => {
      await svc.deleteConsultation("c-1", ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("consultation.delete");
    });
  });

  describe("Prescriptions", () => {
    it("createPrescription sets authorId from actor", async () => {
      await svc.createPrescription(
        { studentId: "s-1", medication: "Ibuprofen", dosage: "200mg", frequency: "Twice daily", duration: "7 days" },
        ACTOR,
      );
      const callArgs = prisma.prescription.create.mock.calls[0][0];
      expect(callArgs.data.authorId).toBe(ACTOR);
    });

    it("createPrescription writes audit", async () => {
      await svc.createPrescription(
        { studentId: "s-1", medication: "X", dosage: "Y", frequency: "Z", duration: "W" },
        ACTOR,
      );
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("prescription.create");
    });

    it("deletePrescription catches P2025 as 404", async () => {
      prisma.prescription.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deletePrescription("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });

    it("updatePrescription throws 404 for missing", async () => {
      prisma.prescription.findUnique.mockResolvedValue(null);
      await expect(svc.updatePrescription("missing", {}, ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Medications", () => {
    it("createMedication writes audit", async () => {
      await svc.createMedication({ name: "Aspirin", stock: 100 }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("medication.create");
      expect(audit.data.entity).toBe("Medication");
    });

    it("updateMedication throws 404 for missing", async () => {
      prisma.medication.findUnique.mockResolvedValue(null);
      await expect(svc.updateMedication("missing", { stock: 50 }, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it("deleteMedication catches P2025 as 404", async () => {
      prisma.medication.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteMedication("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Appointments", () => {
    it("createAppointment writes audit", async () => {
      await svc.createAppointment({ studentId: "s-1", date: new Date(), time: "10:00", type: "Checkup", reason: "Annual" }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("appointment.create");
    });

    it("deleteAppointment catches P2025 as 404", async () => {
      prisma.infirmaryAppointment.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteAppointment("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Documents", () => {
    it("createDocument sets uploaderId from actor", async () => {
      await svc.createDocument({ studentId: "s-1", name: "X-Ray" }, ACTOR);
      const callArgs = prisma.infirmaryDocument.create.mock.calls[0][0];
      expect(callArgs.data.uploaderId).toBe(ACTOR);
      expect(callArgs.data).not.toHaveProperty("uploadedBy");
    });

    it("createDocument writes audit", async () => {
      await svc.createDocument({ studentId: "s-1", name: "X-Ray" }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("document.create");
    });

    it("deleteDocument catches P2025 as 404", async () => {
      prisma.infirmaryDocument.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteDocument("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Follow-ups", () => {
    it("createFollowUp writes audit", async () => {
      await svc.createFollowUp({ studentId: "s-1", reason: "Checkup", dueDate: new Date() }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("followUp.create");
    });

    it("deleteFollowUp catches P2025 as 404", async () => {
      prisma.followUp.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteFollowUp("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Forms", () => {
    it("createForm writes audit", async () => {
      await svc.createForm({ name: "Wellness", questions: [] }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("form.create");
    });

    it("getForm throws 404 for missing", async () => {
      prisma.infirmaryForm.findUnique.mockResolvedValue(null);
      await expect(svc.getForm("missing")).rejects.toThrow(NotFoundException);
    });

    it("deleteForm catches P2025 as 404", async () => {
      prisma.infirmaryForm.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteForm("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });

    it("deleteForm catches P2003 (restrict) as constraint error", async () => {
      prisma.infirmaryForm.delete.mockRejectedValue({ code: "P2003" });
      await expect(svc.deleteForm("form-1", ACTOR)).rejects.toThrow(NotFoundException);
      await expect(svc.deleteForm("form-1", ACTOR)).rejects.toThrow("referenced by other data");
    });
  });

  describe("Form Responses", () => {
    it("createFormResponse writes audit", async () => {
      await svc.createFormResponse({ formId: "form-1", studentId: "s-1", studentName: "Test", answers: {} }, ACTOR);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe("formResponse.create");
    });

    it("deleteFormResponse catches P2025 as 404", async () => {
      prisma.infirmaryFormResponse.delete.mockRejectedValue({ code: "P2025" });
      await expect(svc.deleteFormResponse("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("Settings", () => {
    it("getSettings returns defaults when no DB rows", async () => {
      const settings = await svc.getSettings();
      expect(settings).toHaveProperty("clinic_name", "DAUST Health Center");
      expect(settings).toHaveProperty("clinic_phone");
    });

    it("getSettings overlays DB values on defaults", async () => {
      prisma.appSetting.findMany.mockResolvedValue([
        { key: "infirmary:clinic_name", valueJson: "Custom Clinic" },
      ]);
      const settings = await svc.getSettings();
      expect(settings.clinic_name).toBe("Custom Clinic");
    });

    it("updateSettings upserts each key", async () => {
      await svc.updateSettings({ clinic_name: "New Name" });
      expect(prisma.appSetting.upsert).toHaveBeenCalledOnce();
      const callArgs = prisma.appSetting.upsert.mock.calls[0][0];
      expect(callArgs.where.key).toBe("infirmary:clinic_name");
      expect(callArgs.create.valueJson).toBe("New Name");
    });
  });

  describe("Analytics", () => {
    it("getAnalytics returns all counts", async () => {
      const result = await svc.getAnalytics();
      expect(result).toHaveProperty("totalStudents");
      expect(result).toHaveProperty("totalConsultations");
      expect(result).toHaveProperty("monthlyConsultations");
      expect(Array.isArray(result.monthlyConsultations)).toBe(true);
      expect(result.monthlyConsultations).toHaveLength(6);
    });
  });

  describe("Students", () => {
    it("listStudents maps records", async () => {
      prisma.student.findMany.mockResolvedValue([{
        id: "s-1",
        person: { firstName: "Awa", lastName: "Diallo", email: "awa@daust.edu" },
        program: { name: "CS" },
        yearLevel: 2,
        allergies: "Penicillin",
        phone: "123",
        dateOfBirth: new Date("2000-01-01"),
        gender: "F",
        bloodType: "O+",
        emergencyName2: "Mom",
        emergencyPhone2: "456",
      }]);
      const result = await svc.listStudents();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Awa Diallo");
      expect(result[0].allergies).toEqual(["Penicillin"]);
      expect(result[0].bloodType).toBe("O+");
    });
  });
});