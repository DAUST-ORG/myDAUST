"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  AppStore,
  Appointment,
  Consultation,
  MedicalDocument,
  FollowUp,
  FormRecord,
  FormResponse,
  Medication,
  Prescription,
  Student,
  AppSettings,
} from "./types";
import {
  getInfirmaryStudents,
  getInfirmaryConsultations,
  createInfirmaryConsultation,
  updateInfirmaryConsultation,
  deleteInfirmaryConsultation,
  getInfirmaryPrescriptions,
  createInfirmaryPrescription,
  updateInfirmaryPrescription,
  deleteInfirmaryPrescription,
  getInfirmaryMedications,
  createInfirmaryMedication,
  updateInfirmaryMedication,
  deleteInfirmaryMedication,
  getInfirmaryAppointments,
  createInfirmaryAppointment,
  updateInfirmaryAppointment,
  deleteInfirmaryAppointment,
  getInfirmaryDocuments,
  createInfirmaryDocument,
  updateInfirmaryDocument,
  deleteInfirmaryDocument,
  getInfirmaryFollowUps,
  createInfirmaryFollowUp,
  updateInfirmaryFollowUp,
  deleteInfirmaryFollowUp,
  getInfirmaryForms,
  createInfirmaryForm,
  updateInfirmaryForm,
  deleteInfirmaryForm,
  getInfirmaryFormResponses,
  createInfirmaryFormResponse,
  deleteInfirmaryFormResponse,
  getInfirmarySettings,
  updateInfirmarySettings,
  type InfirmaryConsultation,
  type InfirmaryPrescription,
  type InfirmaryMedication,
  type InfirmaryAppointment,
  type InfirmaryDocument,
  type InfirmaryFollowUp,
  type InfirmaryForm,
  type InfirmaryFormResponse as ApiFormResponse,
  type InfirmaryStudent,
} from "@/lib/api";

// ─── Mapping helpers (API → portal types) ────────────────────────────────

function mapStudent(s: InfirmaryStudent): Student {
  return {
    id: s.id,
    name: s.name,
    initials: s.initials,
    program: s.program,
    year: s.year,
    status: s.status,
    lastVisit: s.lastVisit,
    allergies: s.allergies ?? [],
    concern: s.concern ?? "",
    email: s.email,
    phone: s.phone,
    dateOfBirth: s.dateOfBirth ?? "",
    gender: s.gender ?? "",
    bloodType: s.bloodType,
    emergencyContact: s.emergencyContact,
    emergencyPhone: s.emergencyPhone,
    medicalHistory: s.medicalHistory,
    height: s.height,
    weight: s.weight,
  };
}

/**
 * The list endpoints return the joined student, not a flattened name, and their date columns
 * are visitedAt / prescribedAt / createdAt rather than a generic `date`. Reading the fields
 * the mappers previously assumed produced undefined everywhere: blank names, blank dates, and
 * a crash in the search filters, which call .toLowerCase() on the name.
 */
function joinedStudentName(row: unknown): string {
  const person = (row as { student?: { person?: { firstName?: string; lastName?: string } } })
    ?.student?.person;
  if (!person) return "";
  return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
}

/**
 * Dates are kept as yyyy-mm-dd rather than a localised display string. The pages do arithmetic
 * on these values (days-until-expiry, overdue follow-ups), and `new Date("Aug 22, 2027")`
 * parsed back from a display string yielded NaN, so expiry warnings never fired.
 */
function isoDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function mapConsultation(c: InfirmaryConsultation): Consultation {
  const visited = (c as { visitedAt?: string }).visitedAt;
  return {
    id: c.id,
    studentId: c.studentId,
    studentName: joinedStudentName(c) || c.studentName || "",
    reason: c.reason,
    visitType: c.visitType,
    clinicalNotes: c.clinicalNotes ?? "",
    status: c.status as Consultation["status"],
    date: isoDate(visited ?? c.date),
    time: visited
      ? new Date(visited).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : (c.time ?? ""),
    followUpRequired: c.followUpRequired ?? false,
    vitals: (c as any).vitalsJson as Consultation["vitals"],
    diagnosis: c.diagnosis,
    treatmentPlan: c.treatmentPlan,
  };
}

function mapPrescription(p: InfirmaryPrescription): Prescription {
  return {
    id: p.id,
    consultationId: p.consultationId ?? "",
    studentId: p.studentId,
    studentName: joinedStudentName(p) || p.studentName || "",
    medication: p.medication,
    dosage: p.dosage,
    frequency: p.frequency,
    duration: p.duration,
    instructions: p.instructions ?? "",
    status: p.status as Prescription["status"],
    date: isoDate((p as { prescribedAt?: string }).prescribedAt ?? p.date),
    prescribedBy: p.prescribedBy ?? "",
  };
}

function mapMedication(m: InfirmaryMedication): Medication {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    stock: m.stock,
    unit: m.unit,
    minStock: m.minStock,
    expiryDate: isoDate(m.expiryDate),
    supplier: m.supplier,
    lastRestocked: isoDate(m.lastRestocked),
    status: m.status as Medication["status"],
  };
}

function mapAppointment(a: InfirmaryAppointment): Appointment {
  return {
    id: a.id,
    studentId: a.studentId,
    studentName: joinedStudentName(a) || a.studentName || "",
    date: isoDate(a.date),
    time: a.time,
    type: a.type,
    reason: a.reason,
    status: a.status as Appointment["status"],
    notes: a.notes ?? "",
  };
}

function mapDocument(d: InfirmaryDocument): MedicalDocument {
  return {
    id: d.id,
    studentId: d.studentId,
    studentName: joinedStudentName(d) || d.studentName || "",
    name: d.name,
    type: d.type as MedicalDocument["type"],
    date: isoDate((d as { createdAt?: string }).createdAt ?? d.date),
    uploadedBy: d.uploadedBy ?? "",
    notes: d.notes ?? "",
  };
}

function mapFollowUp(f: InfirmaryFollowUp): FollowUp {
  return {
    id: f.id,
    studentId: f.studentId,
    studentName: joinedStudentName(f) || f.studentName || "",
    reason: f.reason,
    dueDate: isoDate(f.dueDate),
    status: f.status as FollowUp["status"],
    priority: f.priority as FollowUp["priority"],
    notes: f.notes ?? "",
    createdAt: f.createdAt
      ? new Date(f.createdAt).toISOString()
      : "",
  };
}

function mapForm(f: InfirmaryForm & { responseCount?: number }): FormRecord {
  return {
    id: f.id,
    name: f.name,
    description: f.description ?? "",
    questions: (f.questions as any[]) ?? [],
    responses: (f as any).responseCount ?? f.responses ?? 0,
    completion: f.completion ?? 0,
    status: f.status as FormRecord["status"],
    updated: f.updated
      ? new Date(f.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "",
    shareLink: f.shareLink ?? undefined,
  };
}

function mapFormResponse(r: ApiFormResponse): FormResponse {
  return {
    id: r.id,
    formId: r.formId,
    studentId: r.studentId,
    studentName: r.studentName,
    answers: r.answers as Record<string, string>,
    submittedAt: r.submittedAt
      ? new Date(r.submittedAt).toISOString()
      : "",
  };
}

function mapSettings(s: Record<string, unknown>): AppSettings {
  return {
    clinicName: String(s.clinic_name ?? "DAUST Health Center"),
    clinicAddress: String(s.clinic_address ?? ""),
    clinicPhone: String(s.clinic_phone ?? ""),
    clinicEmail: String(s.clinic_email ?? ""),
    darkMode: false,
    notificationsEnabled: s.notifications_enabled === "true" || s.notifications_enabled === true,
    appointmentDuration: Number(s.appointment_duration ?? 30),
    workingHoursStart: String(s.working_hours_start ?? "08:00"),
    workingHoursEnd: String(s.working_hours_end ?? "17:00"),
  };
}

function settingsToApi(s: Partial<AppSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.clinicName !== undefined) out.clinic_name = s.clinicName;
  if (s.clinicAddress !== undefined) out.clinic_address = s.clinicAddress;
  if (s.clinicPhone !== undefined) out.clinic_phone = s.clinicPhone;
  if (s.clinicEmail !== undefined) out.clinic_email = s.clinicEmail;
  if (s.notificationsEnabled !== undefined) out.notifications_enabled = String(s.notificationsEnabled);
  if (s.appointmentDuration !== undefined) out.appointment_duration = String(s.appointmentDuration);
  if (s.workingHoursStart !== undefined) out.working_hours_start = s.workingHoursStart;
  if (s.workingHoursEnd !== undefined) out.working_hours_end = s.workingHoursEnd;
  return out;
}

// ─── Context ────────────────────────────────────────────────────────────

type StoreContextType = {
  store: AppStore;
  loading: boolean;
  error: string | null;
  addStudent: (s: Student) => void;
  updateStudent: (id: string, data: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  addForm: (f: FormRecord) => void;
  updateForm: (id: string, data: Partial<FormRecord>) => void;
  deleteForm: (id: string) => void;
  addFormResponse: (r: FormResponse) => void;
  deleteFormResponse: (id: string) => void;
  addConsultation: (c: Consultation) => void;
  updateConsultation: (id: string, data: Partial<Consultation>) => void;
  deleteConsultation: (id: string) => void;
  addPrescription: (p: Prescription) => void;
  updatePrescription: (id: string, data: Partial<Prescription>) => void;
  deletePrescription: (id: string) => void;
  addMedication: (m: Medication) => void;
  updateMedication: (id: string, data: Partial<Medication>) => void;
  deleteMedication: (id: string) => void;
  addAppointment: (a: Appointment) => void;
  updateAppointment: (id: string, data: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  addDocument: (d: MedicalDocument) => void;
  updateDocument: (id: string, data: Partial<MedicalDocument>) => void;
  deleteDocument: (id: string) => void;
  addFollowUp: (f: FollowUp) => void;
  updateFollowUp: (id: string, data: Partial<FollowUp>) => void;
  deleteFollowUp: (id: string) => void;
  updateSettings: (data: Partial<AppSettings>) => void;
};

const StoreContext = createContext<StoreContextType | null>(null);

function emptyStore(): AppStore {
  return {
    students: [],
    forms: [],
    formResponses: [],
    consultations: [],
    prescriptions: [],
    medications: [],
    appointments: [],
    documents: [],
    followUps: [],
    settings: {
      clinicName: "DAUST Health Center",
      clinicAddress: "",
      clinicPhone: "",
      clinicEmail: "",
      darkMode: false,
      notificationsEnabled: true,
      appointmentDuration: 30,
      workingHoursStart: "08:00",
      workingHoursEnd: "17:00",
    },
  };
}

export function InfirmaryStoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AppStore>(emptyStore);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data from API on mount
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [students, consultations, prescriptions, medications, appointments, documents, followUps, forms, settings] =
        await Promise.all([
          getInfirmaryStudents(),
          getInfirmaryConsultations(),
          getInfirmaryPrescriptions(),
          getInfirmaryMedications(),
          getInfirmaryAppointments(),
          getInfirmaryDocuments(),
          getInfirmaryFollowUps(),
          getInfirmaryForms(),
          getInfirmarySettings().catch(() => ({} as Record<string, unknown>)),
        ]);

      // Fetch form responses for each form
      const allResponses: FormResponse[] = [];
      for (const f of forms) {
        try {
          const resps = await getInfirmaryFormResponses(f.id);
          allResponses.push(...resps.map(mapFormResponse));
        } catch {
          // ignore individual form response failures
        }
      }

      setStore({
        students: students.map(mapStudent),
        consultations: consultations.map(mapConsultation),
        prescriptions: prescriptions.map(mapPrescription),
        medications: medications.map(mapMedication),
        appointments: appointments.map(mapAppointment),
        documents: documents.map(mapDocument),
        followUps: followUps.map(mapFollowUp),
        forms: forms.map(mapForm),
        formResponses: allResponses,
        settings: mapSettings(settings as Record<string, unknown>),
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load infirmary data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Student stubs (not full CRUD — SIS-owned) ────────────────
  const addStudent = useCallback((_s: Student) => {
    // Students are SIS-managed; add is a no-op here
  }, []);

  const updateStudent = useCallback((_id: string, _data: Partial<Student>) => {
    // SIS-managed
  }, []);

  const deleteStudent = useCallback((_id: string) => {
    // SIS-managed
  }, []);

  // ─── Consultations ────────────────────────────────────────────
  const addConsultation = useCallback(async (c: Consultation) => {
    await createInfirmaryConsultation({
      studentId: c.studentId,
      reason: c.reason,
      visitType: c.visitType,
      clinicalNotes: c.clinicalNotes,
      status: c.status,
      followUpRequired: c.followUpRequired,
      vitalsJson: c.vitals ?? undefined,
      diagnosis: c.diagnosis,
      treatmentPlan: c.treatmentPlan,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updateConsultation = useCallback(async (id: string, data: Partial<Consultation>) => {
    // The column is vitalsJson. Sending the UI's `vitals` key meant zod stripped it and the
    // PATCH returned 200 having changed nothing, so vitals edits silently disappeared.
    const { vitals, ...rest } = data;
    await updateInfirmaryConsultation(id, {
      ...rest,
      ...(vitals !== undefined ? { vitalsJson: vitals } : {}),
    } as any);
    fetchAll();
  }, [fetchAll]);

  const deleteConsultation = useCallback(async (id: string) => {
    await deleteInfirmaryConsultation(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Prescriptions ────────────────────────────────────────────
  const addPrescription = useCallback(async (p: Prescription) => {
    await createInfirmaryPrescription({
      consultationId: p.consultationId,
      studentId: p.studentId,
      medication: p.medication,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      status: p.status,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updatePrescription = useCallback(async (id: string, data: Partial<Prescription>) => {
    await updateInfirmaryPrescription(id, data as any);
    fetchAll();
  }, [fetchAll]);

  const deletePrescription = useCallback(async (id: string) => {
    await deleteInfirmaryPrescription(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Medications ──────────────────────────────────────────────
  const addMedication = useCallback(async (m: Medication) => {
    await createInfirmaryMedication({
      name: m.name,
      category: m.category,
      stock: m.stock,
      unit: m.unit,
      minStock: m.minStock,
      expiryDate: m.expiryDate,
      supplier: m.supplier,
      status: m.status,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updateMedication = useCallback(async (id: string, data: Partial<Medication>) => {
    await updateInfirmaryMedication(id, data as any);
    fetchAll();
  }, [fetchAll]);

  const deleteMedication = useCallback(async (id: string) => {
    await deleteInfirmaryMedication(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Appointments ─────────────────────────────────────────────
  const addAppointment = useCallback(async (a: Appointment) => {
    await createInfirmaryAppointment({
      studentId: a.studentId,
      date: a.date,
      time: a.time,
      type: a.type,
      reason: a.reason,
      status: a.status,
      notes: a.notes,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updateAppointment = useCallback(async (id: string, data: Partial<Appointment>) => {
    await updateInfirmaryAppointment(id, data as any);
    fetchAll();
  }, [fetchAll]);

  const deleteAppointment = useCallback(async (id: string) => {
    await deleteInfirmaryAppointment(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Documents ────────────────────────────────────────────────
  const addDocument = useCallback(async (d: MedicalDocument) => {
    await createInfirmaryDocument({
      studentId: d.studentId,
      name: d.name,
      type: d.type,
      notes: d.notes,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updateDocument = useCallback(async (id: string, data: Partial<MedicalDocument>) => {
    await updateInfirmaryDocument(id, data as any);
    fetchAll();
  }, [fetchAll]);

  const deleteDocument = useCallback(async (id: string) => {
    await deleteInfirmaryDocument(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Follow-ups ───────────────────────────────────────────────
  const addFollowUp = useCallback(async (f: FollowUp) => {
    await createInfirmaryFollowUp({
      studentId: f.studentId,
      reason: f.reason,
      dueDate: f.dueDate,
      status: f.status,
      priority: f.priority,
      notes: f.notes,
    } as any);
    fetchAll();
  }, [fetchAll]);

  const updateFollowUp = useCallback(async (id: string, data: Partial<FollowUp>) => {
    await updateInfirmaryFollowUp(id, data as any);
    fetchAll();
  }, [fetchAll]);

  const deleteFollowUp = useCallback(async (id: string) => {
    await deleteInfirmaryFollowUp(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Forms ────────────────────────────────────────────────────
  const addForm = useCallback(async (f: FormRecord) => {
    await createInfirmaryForm({
      name: f.name,
      description: f.description,
      questions: f.questions as any,
      status: f.status,
    });
    fetchAll();
  }, [fetchAll]);

  const updateForm = useCallback(async (id: string, data: Partial<FormRecord>) => {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.questions !== undefined) payload.questions = data.questions;
    if (data.status !== undefined) payload.status = data.status;
    if (data.shareLink !== undefined) payload.shareLink = data.shareLink;
    await updateInfirmaryForm(id, payload);
    fetchAll();
  }, [fetchAll]);

  const deleteForm = useCallback(async (id: string) => {
    await deleteInfirmaryForm(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Form Responses ───────────────────────────────────────────
  const addFormResponse = useCallback(async (r: FormResponse) => {
    await createInfirmaryFormResponse(r.formId, {
      studentId: r.studentId,
      studentName: r.studentName,
      answers: r.answers,
    });
    fetchAll();
  }, [fetchAll]);

  const deleteFormResponse = useCallback(async (id: string) => {
    await deleteInfirmaryFormResponse(id);
    fetchAll();
  }, [fetchAll]);

  // ─── Settings ─────────────────────────────────────────────────
  const updateSettings = useCallback(async (data: Partial<AppSettings>) => {
    await updateInfirmarySettings(settingsToApi(data));
    fetchAll();
  }, [fetchAll]);

  return (
    <StoreContext.Provider
      value={{
        store,
        loading,
        error,
        addStudent,
        updateStudent,
        deleteStudent,
        addForm,
        updateForm,
        deleteForm,
        addFormResponse,
        deleteFormResponse,
        addConsultation,
        updateConsultation,
        deleteConsultation,
        addPrescription,
        updatePrescription,
        deletePrescription,
        addMedication,
        updateMedication,
        deleteMedication,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        addDocument,
        updateDocument,
        deleteDocument,
        addFollowUp,
        updateFollowUp,
        deleteFollowUp,
        updateSettings,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useInfirmaryStore(): StoreContextType {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useInfirmaryStore must be used within InfirmaryStoreProvider");
  return ctx;
}
