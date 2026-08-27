export type Student = {
  id: string
  name: string
  initials: string
  program: string
  year: string
  status: string
  lastVisit: string
  allergies: string[]
  concern: string
  email: string
  phone: string
  dateOfBirth: string
  gender: string
  bloodType?: string
  emergencyContact?: string
  emergencyPhone?: string
  medicalHistory?: string[]
  height?: string
  weight?: string
}

export type FormQuestion = {
  id: string
  text: string
  type: "text" | "multiple_choice" | "yes_no" | "rating"
  options?: string[]
  required: boolean
}

export type FormResponse = {
  id: string
  formId: string
  studentId: string
  studentName: string
  answers: Record<string, string>
  submittedAt: string
}

export type FormRecord = {
  id: string
  name: string
  description: string
  questions: FormQuestion[]
  responses: number
  completion: number
  status: "Published" | "Draft"
  updated: string
  shareLink?: string
}

export type Consultation = {
  id: string
  studentId: string
  studentName: string
  reason: string
  visitType: string
  clinicalNotes: string
  status: "Completed" | "In Progress" | "Cancelled"
  date: string
  time: string
  followUpRequired: boolean
  vitals?: {
    temperature?: string
    bloodPressure?: string
    heartRate?: string
    weight?: string
  }
  diagnosis?: string
  treatmentPlan?: string
}

export type Prescription = {
  id: string
  consultationId: string
  studentId: string
  studentName: string
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  status: "Active" | "Completed" | "Cancelled"
  date: string
  prescribedBy: string
}

export type Medication = {
  id: string
  name: string
  category: string
  stock: number
  unit: string
  minStock: number
  expiryDate: string
  supplier: string
  lastRestocked: string
  status: "In Stock" | "Low Stock" | "Out of Stock" | "Expired"
}

export type Appointment = {
  id: string
  studentId: string
  studentName: string
  date: string
  time: string
  type: string
  reason: string
  status: "Scheduled" | "Checked In" | "Completed" | "No Show" | "Cancelled"
  notes: string
}

export type MedicalDocument = {
  id: string
  studentId: string
  studentName: string
  name: string
  type: "Medical Record" | "Lab Result" | "Prescription" | "Consent Form" | "Insurance" | "Vaccination" | "Other"
  date: string
  uploadedBy: string
  notes: string
}

export type FollowUp = {
  id: string
  studentId: string
  studentName: string
  reason: string
  dueDate: string
  status: "Pending" | "Completed" | "Overdue" | "Cancelled"
  priority: "High" | "Medium" | "Low"
  notes: string
  createdAt: string
}

export type AppSettings = {
  clinicName: string
  clinicAddress: string
  clinicPhone: string
  clinicEmail: string
  darkMode: boolean
  notificationsEnabled: boolean
  appointmentDuration: number
  workingHoursStart: string
  workingHoursEnd: string
}

export type AppStore = {
  students: Student[]
  forms: FormRecord[]
  formResponses: FormResponse[]
  consultations: Consultation[]
  prescriptions: Prescription[]
  medications: Medication[]
  appointments: Appointment[]
  documents: MedicalDocument[]
  followUps: FollowUp[]
  settings: AppSettings
}
