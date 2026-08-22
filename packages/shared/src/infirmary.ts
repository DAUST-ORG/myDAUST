import { z } from "zod";

// ─── Consultations ───────────────────────────────────────────────────────

const VitalsSchema = z
  .object({
    temperature: z.string().max(20).optional(),
    bloodPressure: z.string().max(20).optional(),
    heartRate: z.string().max(20).optional(),
    weight: z.string().max(20).optional(),
  })
  .optional();

export const CreateConsultationInput = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(1).max(500),
  visitType: z.string().min(1).max(100),
  clinicalNotes: z.string().max(10000).optional(),
  status: z.enum(["Completed", "In Progress", "Cancelled"]).optional(),
  followUpRequired: z.boolean().optional(),
  vitalsJson: VitalsSchema,
  diagnosis: z.string().max(2000).optional(),
  treatmentPlan: z.string().max(5000).optional(),
});

export const UpdateConsultationInput = CreateConsultationInput.partial();

// ─── Prescriptions ───────────────────────────────────────────────────────

export const CreatePrescriptionInput = z.object({
  consultationId: z.string().uuid().optional(),
  studentId: z.string().min(1),
  medication: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  duration: z.string().min(1).max(100),
  instructions: z.string().max(2000).optional(),
  status: z.enum(["Active", "Completed", "Cancelled"]).optional(),
});

export const UpdatePrescriptionInput = CreatePrescriptionInput.partial();

// ─── Medications ─────────────────────────────────────────────────────────

export const CreateMedicationInput = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  stock: z.number().int().min(0).optional(),
  unit: z.string().max(50).optional(),
  minStock: z.number().int().min(0).optional(),
  expiryDate: z.coerce.date().optional(),
  supplier: z.string().max(200).optional(),
  status: z.enum(["In Stock", "Low Stock", "Out of Stock", "Expired"]).optional(),
});

export const UpdateMedicationInput = CreateMedicationInput.partial();

// ─── Appointments ────────────────────────────────────────────────────────

export const CreateAppointmentInput = z.object({
  studentId: z.string().min(1),
  date: z.coerce.date(),
  time: z.string().min(1).max(20),
  type: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
  status: z.enum(["Scheduled", "Checked In", "Completed", "No Show", "Cancelled"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateAppointmentInput = CreateAppointmentInput.partial();

// ─── Documents ───────────────────────────────────────────────────────────

export const CreateDocumentInput = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(["Medical Record", "Lab Result", "Prescription", "Consent Form", "Insurance", "Vaccination", "Other"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateDocumentInput = CreateDocumentInput.partial();

// ─── Follow-ups ──────────────────────────────────────────────────────────

export const CreateFollowUpInput = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(1).max(500),
  dueDate: z.coerce.date(),
  status: z.enum(["Pending", "Completed", "Overdue", "Cancelled"]).optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateFollowUpInput = CreateFollowUpInput.partial();

// ─── Forms ───────────────────────────────────────────────────────────────

const FormQuestionSchema = z.object({
  id: z.string(),
  text: z.string().max(2000),
  type: z.enum(["text", "multiple_choice", "yes_no", "rating"]),
  options: z.array(z.string().max(200)).max(20).optional(),
  required: z.boolean(),
});

export const CreateFormInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  questions: z.array(FormQuestionSchema).max(50).optional(),
  status: z.enum(["Published", "Draft"]).optional(),
  shareLink: z.string().max(500).optional(),
});

export const UpdateFormInput = CreateFormInput.partial();

// ─── Form Responses ──────────────────────────────────────────────────────

export const CreateFormResponseInput = z.object({
  studentId: z.string().min(1),
  studentName: z.string().min(1).max(200),
  answers: z.record(z.string().max(2000)),
});

// ─── Settings ────────────────────────────────────────────────────────────

export const UpdateSettingsInput = z.object({
  clinic_name: z.string().max(200).optional(),
  clinic_address: z.string().max(500).optional(),
  clinic_phone: z.string().max(50).optional(),
  clinic_email: z.string().email().optional(),
  notifications_enabled: z.string().max(10).optional(),
  appointment_duration: z.string().max(10).optional(),
  working_hours_start: z.string().max(10).optional(),
  working_hours_end: z.string().max(10).optional(),
});
