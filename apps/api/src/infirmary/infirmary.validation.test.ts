import { describe, expect, it } from "vitest";
import {
  CreateConsultationInput,
  UpdateConsultationInput,
  CreatePrescriptionInput,
  CreateMedicationInput,
  CreateAppointmentInput,
  CreateDocumentInput,
  CreateFollowUpInput,
  CreateFormInput,
  CreateFormResponseInput,
  UpdateSettingsInput,
} from "@mydaust/shared";

describe("Infirmary Zod schemas", () => {
  describe("CreateConsultationInput", () => {
    it("accepts valid consultation", () => {
      const result = CreateConsultationInput.safeParse({
        studentId: "s-1",
        reason: "Headache",
        visitType: "Walk-in",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty studentId", () => {
      const result = CreateConsultationInput.safeParse({
        studentId: "",
        reason: "Headache",
        visitType: "Walk-in",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing reason", () => {
      const result = CreateConsultationInput.safeParse({
        studentId: "s-1",
        visitType: "Walk-in",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreatePrescriptionInput", () => {
    it("accepts valid prescription", () => {
      const result = CreatePrescriptionInput.safeParse({
        studentId: "s-1",
        medication: "Ibuprofen",
        dosage: "200mg",
        frequency: "Twice daily",
        duration: "7 days",
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields (no mass assignment)", () => {
      const result = CreatePrescriptionInput.safeParse({
        studentId: "s-1",
        medication: "X",
        dosage: "Y",
        frequency: "Z",
        duration: "W",
        authorId: "hacker-id",
        prescribedBy: "hacker-name",
        id: "fake-id",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("authorId");
        expect(result.data).not.toHaveProperty("prescribedBy");
        expect(result.data).not.toHaveProperty("id");
      }
    });
  });

  describe("CreateMedicationInput", () => {
    it("accepts valid medication", () => {
      const result = CreateMedicationInput.safeParse({
        name: "Paracetamol",
        stock: 100,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = CreateMedicationInput.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateAppointmentInput", () => {
    it("accepts valid appointment with coerced date", () => {
      const result = CreateAppointmentInput.safeParse({
        studentId: "s-1",
        date: "2026-09-01",
        time: "10:00",
        type: "Checkup",
        reason: "Annual",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = CreateAppointmentInput.safeParse({
        studentId: "s-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateFollowUpInput", () => {
    it("accepts valid follow-up with coerced date", () => {
      const result = CreateFollowUpInput.safeParse({
        studentId: "s-1",
        reason: "Review",
        dueDate: "2026-09-15",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing reason", () => {
      const result = CreateFollowUpInput.safeParse({
        studentId: "s-1",
        dueDate: "2026-09-15",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateDocumentInput", () => {
    it("accepts valid document", () => {
      const result = CreateDocumentInput.safeParse({
        studentId: "s-1",
        name: "X-Ray Report",
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields (no mass assignment)", () => {
      const result = CreateDocumentInput.safeParse({
        studentId: "s-1",
        name: "Report",
        uploadedBy: "attacker",
        id: "fake-id",
        uploaderId: "hacker",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("uploadedBy");
        expect(result.data).not.toHaveProperty("id");
        expect(result.data).not.toHaveProperty("uploaderId");
      }
    });
  });

  describe("CreateFormInput", () => {
    it("accepts valid form with questions", () => {
      const result = CreateFormInput.safeParse({
        name: "Wellness",
        questions: [
          { id: "Q1", text: "Do you smoke?", type: "yes_no", required: true },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects more than 50 questions", () => {
      const questions = Array.from({ length: 51 }, (_, i) => ({
        id: `Q${i}`,
        text: `Question ${i}`,
        type: "text" as const,
        required: false,
      }));
      const result = CreateFormInput.safeParse({ name: "Big", questions });
      expect(result.success).toBe(false);
    });

    it("strips extra fields", () => {
      const result = CreateFormInput.safeParse({
        name: "Test",
        hackerField: "oops",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("hackerField");
      }
    });
  });

  describe("CreateFormResponseInput", () => {
    it("accepts valid response", () => {
      const result = CreateFormResponseInput.safeParse({
        studentId: "s-1",
        studentName: "Awa Diallo",
        answers: { Q1: "Yes", Q2: "No" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing studentName", () => {
      const result = CreateFormResponseInput.safeParse({
        studentId: "s-1",
        answers: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateSettingsInput", () => {
    it("accepts valid settings", () => {
      const result = UpdateSettingsInput.safeParse({
        clinic_name: "New Clinic",
        notifications_enabled: "false",
      });
      expect(result.success).toBe(true);
    });

    it("rejects overly long notifications_enabled", () => {
      const result = UpdateSettingsInput.safeParse({
        notifications_enabled: "a".repeat(11),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Mass assignment prevention", () => {
    it("CreateConsultationInput strips clinicianId", () => {
      const result = CreateConsultationInput.safeParse({
        studentId: "s-1",
        reason: "test",
        visitType: "Walk-in",
        clinicianId: "hacker",
        id: "fake",
        createdAt: "2020-01-01",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("clinicianId");
        expect(result.data).not.toHaveProperty("id");
        expect(result.data).not.toHaveProperty("createdAt");
      }
    });
  });
});