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
  defaultAppointments,
  defaultConsultations,
  defaultDocuments,
  defaultFollowUps,
  defaultForms,
  defaultFormResponses,
  defaultMedications,
  defaultPrescriptions,
  defaultSettings,
  defaultStudents,
} from "./data";

type StoreContextType = {
  store: AppStore;
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

const STORAGE_KEY = "campuscare-store";

function loadStore(): AppStore {
  if (typeof window === "undefined") {
    return {
      students: defaultStudents,
      forms: defaultForms,
      formResponses: defaultFormResponses,
      consultations: defaultConsultations,
      prescriptions: defaultPrescriptions,
      medications: defaultMedications,
      appointments: defaultAppointments,
      documents: defaultDocuments,
      followUps: defaultFollowUps,
      settings: defaultSettings,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.formResponses) parsed.formResponses = defaultFormResponses;
      if (parsed.forms) parsed.forms = parsed.forms.map((f: Record<string, unknown>) => ({ ...f, questions: f.questions || [] }));
      return parsed;
    }
  } catch {
    // fall through
  }
  return {
    students: defaultStudents,
    forms: defaultForms,
    formResponses: defaultFormResponses,
    consultations: defaultConsultations,
    prescriptions: defaultPrescriptions,
    medications: defaultMedications,
    appointments: defaultAppointments,
    documents: defaultDocuments,
    followUps: defaultFollowUps,
    settings: defaultSettings,
  };
}

function saveStore(store: AppStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full — ignore
  }
}

function generateId(prefix: string, items: { id: string }[]): string {
  const nums = items.map((i) => {
    const m = i.id.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function InfirmaryStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store, setStore] = useState<AppStore>(loadStore);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const addStudent = useCallback((s: Student) => {
    setStore((prev) => {
      const id = generateId("ST", prev.students);
      const initials = s.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
      return { ...prev, students: [{ ...s, id, initials, status: "Active", lastVisit: "Never" }, ...prev.students] };
    });
  }, []);

  const updateStudent = useCallback((id: string, data: Partial<Student>) => {
    setStore((prev) => ({ ...prev, students: prev.students.map((s) => s.id === id ? { ...s, ...data } : s) }));
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== id) }));
  }, []);

  const addForm = useCallback((f: FormRecord) => {
    setStore((prev) => ({ ...prev, forms: [{ ...f, id: generateId("F", prev.forms), updated: "Just now" }, ...prev.forms] }));
  }, []);

  const updateForm = useCallback((id: string, data: Partial<FormRecord>) => {
    setStore((prev) => ({ ...prev, forms: prev.forms.map((f) => f.id === id ? { ...f, ...data } : f) }));
  }, []);

  const deleteForm = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, forms: prev.forms.filter((f) => f.id !== id), formResponses: prev.formResponses.filter((r) => r.formId !== id) }));
  }, []);

  const addFormResponse = useCallback((r: FormResponse) => {
    setStore((prev) => ({
      ...prev,
      formResponses: [{ ...r, id: generateId("FR", prev.formResponses) }, ...prev.formResponses],
      forms: prev.forms.map((f) => f.id === r.formId ? { ...f, responses: f.responses + 1 } : f),
    }));
  }, []);

  const deleteFormResponse = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, formResponses: prev.formResponses.filter((r) => r.id !== id) }));
  }, []);

  const addConsultation = useCallback((c: Consultation) => {
    setStore((prev) => ({ ...prev, consultations: [{ ...c, id: generateId("C", prev.consultations) }, ...prev.consultations] }));
  }, []);

  const updateConsultation = useCallback((id: string, data: Partial<Consultation>) => {
    setStore((prev) => ({ ...prev, consultations: prev.consultations.map((c) => c.id === id ? { ...c, ...data } : c) }));
  }, []);

  const deleteConsultation = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, consultations: prev.consultations.filter((c) => c.id !== id) }));
  }, []);

  const addPrescription = useCallback((p: Prescription) => {
    setStore((prev) => ({ ...prev, prescriptions: [{ ...p, id: generateId("P", prev.prescriptions) }, ...prev.prescriptions] }));
  }, []);

  const updatePrescription = useCallback((id: string, data: Partial<Prescription>) => {
    setStore((prev) => ({ ...prev, prescriptions: prev.prescriptions.map((p) => p.id === id ? { ...p, ...data } : p) }));
  }, []);

  const deletePrescription = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, prescriptions: prev.prescriptions.filter((p) => p.id !== id) }));
  }, []);

  const addMedication = useCallback((m: Medication) => {
    setStore((prev) => ({ ...prev, medications: [{ ...m, id: generateId("M", prev.medications) }, ...prev.medications] }));
  }, []);

  const updateMedication = useCallback((id: string, data: Partial<Medication>) => {
    setStore((prev) => ({ ...prev, medications: prev.medications.map((m) => m.id === id ? { ...m, ...data } : m) }));
  }, []);

  const deleteMedication = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, medications: prev.medications.filter((m) => m.id !== id) }));
  }, []);

  const addAppointment = useCallback((a: Appointment) => {
    setStore((prev) => ({ ...prev, appointments: [{ ...a, id: generateId("A", prev.appointments) }, ...prev.appointments] }));
  }, []);

  const updateAppointment = useCallback((id: string, data: Partial<Appointment>) => {
    setStore((prev) => ({ ...prev, appointments: prev.appointments.map((a) => a.id === id ? { ...a, ...data } : a) }));
  }, []);

  const deleteAppointment = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, appointments: prev.appointments.filter((a) => a.id !== id) }));
  }, []);

  const addDocument = useCallback((d: MedicalDocument) => {
    setStore((prev) => ({ ...prev, documents: [{ ...d, id: generateId("D", prev.documents) }, ...prev.documents] }));
  }, []);

  const updateDocument = useCallback((id: string, data: Partial<MedicalDocument>) => {
    setStore((prev) => ({ ...prev, documents: prev.documents.map((d) => d.id === id ? { ...d, ...data } : d) }));
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, documents: prev.documents.filter((d) => d.id !== id) }));
  }, []);

  const addFollowUp = useCallback((f: FollowUp) => {
    setStore((prev) => ({ ...prev, followUps: [{ ...f, id: generateId("FU", prev.followUps) }, ...prev.followUps] }));
  }, []);

  const updateFollowUp = useCallback((id: string, data: Partial<FollowUp>) => {
    setStore((prev) => ({ ...prev, followUps: prev.followUps.map((f) => f.id === id ? { ...f, ...data } : f) }));
  }, []);

  const deleteFollowUp = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, followUps: prev.followUps.filter((f) => f.id !== id) }));
  }, []);

  const updateSettings = useCallback((data: Partial<AppSettings>) => {
    setStore((prev) => ({ ...prev, settings: { ...prev.settings, ...data } }));
  }, []);

  return (
    <StoreContext.Provider value={{
      store, addStudent, updateStudent, deleteStudent,
      addForm, updateForm, deleteForm, addFormResponse, deleteFormResponse,
      addConsultation, updateConsultation, deleteConsultation,
      addPrescription, updatePrescription, deletePrescription,
      addMedication, updateMedication, deleteMedication,
      addAppointment, updateAppointment, deleteAppointment,
      addDocument, updateDocument, deleteDocument,
      addFollowUp, updateFollowUp, deleteFollowUp, updateSettings,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useInfirmaryStore(): StoreContextType {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useInfirmaryStore must be used within InfirmaryStoreProvider");
  return ctx;
}
