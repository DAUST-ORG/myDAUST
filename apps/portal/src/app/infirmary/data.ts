import type {
  Student,
  FormRecord,
  FormResponse,
  Consultation,
  Prescription,
  Medication,
  Appointment,
  MedicalDocument,
  FollowUp,
  AppSettings,
} from "./types";

export const defaultStudents: Student[] = [
  { id: "ST-1042", name: "Amina Diallo", initials: "AD", program: "Computer Science", year: "Year 3", status: "Active", lastVisit: "Today, 09:42", allergies: ["Penicillin"], concern: "Recurring migraines", email: "a.diallo@daust.sn", phone: "+221 77 123 4567", dateOfBirth: "2002-05-14", gender: "Female", bloodType: "O+", emergencyContact: "Mariama Diallo", emergencyPhone: "+221 77 111 2233", medicalHistory: ["Migraines (2024)", "Iron deficiency anemia"], height: "165cm", weight: "58kg" },
  { id: "ST-1188", name: "Kofi Mensah", initials: "KM", program: "Data Science", year: "Year 2", status: "Active", lastVisit: "Yesterday, 14:10", allergies: [], concern: "Annual wellness check", email: "k.mensah@daust.sn", phone: "+221 78 234 5678", dateOfBirth: "2003-09-22", gender: "Male", bloodType: "A+", emergencyContact: "Kwame Mensah", emergencyPhone: "+221 78 222 3344", medicalHistory: [], height: "178cm", weight: "72kg" },
  { id: "ST-0931", name: "Fatou Ndiaye", initials: "FN", program: "Business Analytics", year: "Year 4", status: "Follow-up", lastVisit: "Aug 13, 11:25", allergies: ["Peanuts"], concern: "Asthma review", email: "f.ndiaye@daust.sn", phone: "+221 76 345 6789", dateOfBirth: "2001-01-30", gender: "Female", bloodType: "B+", emergencyContact: "Ibrahima Ndiaye", emergencyPhone: "+221 76 333 4455", medicalHistory: ["Childhood asthma", "Peanut allergy (anaphylaxis risk)"], height: "160cm", weight: "55kg" },
  { id: "ST-1270", name: "Boubacar Sarr", initials: "BS", program: "Cybersecurity", year: "Year 1", status: "Active", lastVisit: "Aug 12, 08:18", allergies: [], concern: "Sports clearance", email: "b.sarr@daust.sn", phone: "+221 77 456 7890", dateOfBirth: "2004-07-11", gender: "Male", bloodType: "AB+", emergencyContact: "Ousmane Sarr", emergencyPhone: "+221 77 444 5566", medicalHistory: [], height: "182cm", weight: "75kg" },
  { id: "ST-1114", name: "Ndeye Fall", initials: "NF", program: "Software Engineering", year: "Year 3", status: "Active", lastVisit: "Aug 11, 16:32", allergies: ["Latex"], concern: "Skin irritation", email: "n.fall@daust.sn", phone: "+221 78 567 8901", dateOfBirth: "2002-11-05", gender: "Female", bloodType: "A-", emergencyContact: "Aissatou Fall", emergencyPhone: "+221 78 555 6677", medicalHistory: ["Latex allergy", "Eczema"], height: "170cm", weight: "62kg" },
  { id: "ST-1305", name: "Moussa Sy", initials: "MS", program: "Network Engineering", year: "Year 2", status: "Active", lastVisit: "Aug 10, 10:00", allergies: [], concern: "Back pain from long study hours", email: "m.sy@daust.sn", phone: "+221 76 678 9012", dateOfBirth: "2003-03-18", gender: "Male", bloodType: "O-", emergencyContact: "Fatoumata Sy", emergencyPhone: "+221 76 666 7788", medicalHistory: [], height: "175cm", weight: "68kg" },
  { id: "ST-1340", name: "Aissatou Ba", initials: "AB2", program: "Artificial Intelligence", year: "Year 1", status: "Active", lastVisit: "Aug 14, 09:15", allergies: ["Shellfish"], concern: "Freshman health screening", email: "a.ba@daust.sn", phone: "+221 77 789 0123", dateOfBirth: "2004-12-02", gender: "Female", bloodType: "B-", emergencyContact: "Abdoulaye Ba", emergencyPhone: "+221 77 777 8899", medicalHistory: ["Shellfish allergy"], height: "158cm", weight: "50kg" },
  { id: "ST-1398", name: "Ibrahima Diop", initials: "ID", program: "Cloud Computing", year: "Year 3", status: "Inactive", lastVisit: "Jul 20, 11:30", allergies: [], concern: "Transferred out", email: "i.diop@daust.sn", phone: "+221 78 890 1234", dateOfBirth: "2001-06-25", gender: "Male", bloodType: "AB-", emergencyContact: "Mariama Diop", emergencyPhone: "+221 78 888 9900", medicalHistory: [], height: "180cm", weight: "78kg" },
];

export const defaultForms: FormRecord[] = [
  {
    id: "F-001", name: "Pre-arrival wellness questionnaire", description: "Collect essential health information before students arrive on campus.",
    questions: [
      { id: "Q1", text: "Do you have any known allergies?", type: "yes_no", required: true },
      { id: "Q2", text: "If yes, please list your allergies", type: "text", required: false },
      { id: "Q3", text: "Do you have any chronic medical conditions?", type: "yes_no", required: true },
      { id: "Q4", text: "List any current medications", type: "text", required: false },
      { id: "Q5", text: "Rate your overall health (1-5)", type: "rating", required: true },
      { id: "Q6", text: "Have you had any surgeries in the past 2 years?", type: "yes_no", required: true },
    ],
    responses: 126, completion: 70, status: "Published", updated: "Yesterday",
  },
  {
    id: "F-002", name: "Sports clearance 2026", description: "Screening form for students joining an athletic program.",
    questions: [
      { id: "Q1", text: "Which sport do you participate in?", type: "text", required: true },
      { id: "Q2", text: "Have you had any sports injuries?", type: "yes_no", required: true },
      { id: "Q3", text: "Do you have a heart condition?", type: "yes_no", required: true },
      { id: "Q4", text: "Rate your fitness level (1-5)", type: "rating", required: true },
      { id: "Q5", text: "Do you carry an EpiPen?", type: "yes_no", required: true },
    ],
    responses: 84, completion: 70, status: "Published", updated: "Aug 15",
  },
  {
    id: "F-003", name: "Mental wellbeing check-in", description: "A private, low-friction pulse check for student wellbeing.",
    questions: [
      { id: "Q1", text: "How would you describe your stress level this week?", type: "rating", required: true },
      { id: "Q2", text: "Are you sleeping well?", type: "yes_no", required: true },
      { id: "Q3", text: "Do you feel connected to your peers?", type: "yes_no", required: true },
      { id: "Q4", text: "Would you like to speak with a counselor?", type: "yes_no", required: false },
      { id: "Q5", text: "Anything else you'd like to share?", type: "text", required: false },
    ],
    responses: 42, completion: 21, status: "Draft", updated: "Aug 12",
  },
];

export const defaultFormResponses: FormResponse[] = [
  { id: "FR-001", formId: "F-001", studentId: "ST-1042", studentName: "Amina Diallo", answers: { Q1: "Yes", Q2: "Penicillin", Q3: "No", Q4: "", Q5: "4", Q6: "No" }, submittedAt: "2026-08-18T10:30:00" },
  { id: "FR-002", formId: "F-001", studentId: "ST-1188", studentName: "Kofi Mensah", answers: { Q1: "No", Q2: "", Q3: "No", Q4: "", Q5: "5", Q6: "No" }, submittedAt: "2026-08-19T14:15:00" },
  { id: "FR-003", formId: "F-001", studentId: "ST-0931", studentName: "Fatou Ndiaye", answers: { Q1: "Yes", Q2: "Peanuts, shellfish", Q3: "Yes", Q4: "Salbutamol inhaler", Q5: "3", Q6: "No" }, submittedAt: "2026-08-17T09:00:00" },
  { id: "FR-004", formId: "F-001", studentId: "ST-1270", studentName: "Boubacar Sarr", answers: { Q1: "No", Q2: "", Q3: "No", Q4: "", Q5: "5", Q6: "No" }, submittedAt: "2026-08-20T08:45:00" },
  { id: "FR-005", formId: "F-001", studentId: "ST-1114", studentName: "Ndeye Fall", answers: { Q1: "Yes", Q2: "Latex", Q3: "No", Q4: "", Q5: "4", Q6: "No" }, submittedAt: "2026-08-16T11:20:00" },
  { id: "FR-006", formId: "F-002", studentId: "ST-1270", studentName: "Boubacar Sarr", answers: { Q1: "Football", Q2: "No", Q3: "No", Q4: "5", Q5: "No" }, submittedAt: "2026-08-12T08:10:00" },
  { id: "FR-007", formId: "F-002", studentId: "ST-1042", studentName: "Amina Diallo", answers: { Q1: "Volleyball", Q2: "Yes", Q3: "No", Q4: "4", Q5: "No" }, submittedAt: "2026-08-14T16:30:00" },
  { id: "FR-008", formId: "F-002", studentId: "ST-1114", studentName: "Ndeye Fall", answers: { Q1: "Track & Field", Q2: "No", Q3: "No", Q4: "4", Q5: "No" }, submittedAt: "2026-08-13T12:00:00" },
  { id: "FR-009", formId: "F-001", studentId: "ST-1340", studentName: "Aissatou Ba", answers: { Q1: "Yes", Q2: "Shellfish", Q3: "No", Q4: "", Q5: "5", Q6: "No" }, submittedAt: "2026-08-15T10:00:00" },
  { id: "FR-010", formId: "F-003", studentId: "ST-1042", studentName: "Amina Diallo", answers: { Q1: "3", Q2: "Yes", Q3: "Yes", Q4: "No", Q5: "Feeling better this week after reducing caffeine intake" }, submittedAt: "2026-08-19T20:00:00" },
  { id: "FR-011", formId: "F-003", studentId: "ST-1188", studentName: "Kofi Mensah", answers: { Q1: "2", Q2: "Yes", Q3: "Yes", Q4: "No", Q5: "" }, submittedAt: "2026-08-18T21:30:00" },
  { id: "FR-012", formId: "F-003", studentId: "ST-1305", studentName: "Moussa Sy", answers: { Q1: "4", Q2: "No", Q3: "No", Q4: "Yes", Q5: "Back pain is affecting my sleep and mood" }, submittedAt: "2026-08-20T19:00:00" },
];

export const defaultConsultations: Consultation[] = [
  { id: "C-001", studentId: "ST-1042", studentName: "Amina Diallo", reason: "Recurring migraines", visitType: "Follow-up", clinicalNotes: "Patient reports 3 episodes this week. Prescribed sumatriptan. Recommend stress management workshop.", status: "Completed", date: "2026-08-20", time: "09:30", followUpRequired: true, vitals: { temperature: "36.8°C", bloodPressure: "118/76", heartRate: "72 bpm", weight: "58kg" }, diagnosis: "Tension-type migraine", treatmentPlan: "Sumatriptan 50mg PRN, stress reduction, follow-up in 1 week" },
  { id: "C-002", studentId: "ST-1188", studentName: "Kofi Mensah", reason: "Annual wellness check", visitType: "Routine", clinicalNotes: "Full physical exam completed. All vitals normal. Blood work ordered.", status: "Completed", date: "2026-08-19", time: "14:00", followUpRequired: false, vitals: { temperature: "36.5°C", bloodPressure: "120/78", heartRate: "68 bpm", weight: "72kg" }, diagnosis: "Healthy - no concerns", treatmentPlan: "Continue healthy lifestyle. Vitamin D supplementation." },
  { id: "C-003", studentId: "ST-0931", studentName: "Fatou Ndiaye", reason: "Asthma review", visitType: "Follow-up", clinicalNotes: "Inhaler technique reviewed. Peak flow improved from last visit. Continue current medication.", status: "In Progress", date: "2026-08-20", time: "10:30", followUpRequired: true, vitals: { temperature: "36.6°C", bloodPressure: "115/70", heartRate: "76 bpm", weight: "55kg" }, diagnosis: "Mild persistent asthma - well controlled", treatmentPlan: "Continue Salbutamol PRN, avoid peanut exposure, follow-up in 2 weeks" },
  { id: "C-004", studentId: "ST-1270", studentName: "Boubacar Sarr", reason: "Sports clearance", visitType: "Routine", clinicalNotes: "Physical exam for football team. Heart, lungs, joints all clear. Cleared for participation.", status: "Completed", date: "2026-08-12", time: "08:18", followUpRequired: false, vitals: { temperature: "36.7°C", bloodPressure: "122/80", heartRate: "64 bpm", weight: "75kg" }, diagnosis: "Fit for sports participation", treatmentPlan: "No restrictions. Stay hydrated." },
  { id: "C-005", studentId: "ST-1114", studentName: "Ndeye Fall", reason: "Skin irritation", visitType: "Walk-in", clinicalNotes: "Contact dermatitis on forearms. Likely from lab chemicals. Prescribed hydrocortisone cream. Advised to wear gloves in lab.", status: "Completed", date: "2026-08-11", time: "16:32", followUpRequired: true, vitals: { temperature: "36.5°C", bloodPressure: "110/68", heartRate: "70 bpm", weight: "62kg" }, diagnosis: "Contact dermatitis (occupational)", treatmentPlan: "Hydrocortisone 1% cream BID, nitrile gloves in lab, follow-up in 1 week" },
  { id: "C-006", studentId: "ST-1305", studentName: "Moussa Sy", reason: "Lower back pain", visitType: "Walk-in", clinicalNotes: "Chronic lower back pain from prolonged sitting. Recommended ergonomic assessment of study area. Prescribed ibuprofen and physiotherapy referral.", status: "Completed", date: "2026-08-10", time: "10:00", followUpRequired: true, vitals: { temperature: "36.6°C", bloodPressure: "116/72", heartRate: "66 bpm", weight: "68kg" }, diagnosis: "Mechanical lower back pain", treatmentPlan: "Ibuprofen 400mg TID PRN, physiotherapy referral, ergonomic workstation setup" },
  { id: "C-007", studentId: "ST-1340", studentName: "Aissatou Ba", reason: "Freshman health screening", visitType: "Routine", clinicalNotes: "Initial health screening for incoming student. All vitals normal. Vaccination records verified.", status: "Completed", date: "2026-08-14", time: "09:15", followUpRequired: false, vitals: { temperature: "36.4°C", bloodPressure: "108/66", heartRate: "74 bpm", weight: "50kg" }, diagnosis: "Healthy", treatmentPlan: "No treatment needed. Welcome to DAUST." },
];

export const defaultPrescriptions: Prescription[] = [
  { id: "P-001", consultationId: "C-001", studentId: "ST-1042", studentName: "Amina Diallo", medication: "Sumatriptan 50mg", dosage: "50mg", frequency: "As needed (max 2/day)", duration: "30 days", instructions: "Take at onset of migraine. Avoid within 24h of SSRI.", status: "Active", date: "2026-08-20", prescribedBy: "Dr. S. Diop" },
  { id: "P-002", consultationId: "C-003", studentId: "ST-0931", studentName: "Fatou Ndiaye", medication: "Salbutamol Inhaler", dosage: "100mcg/puff", frequency: "2 puffs as needed", duration: "90 days", instructions: "Shake well before use. Rinse mouth after.", status: "Active", date: "2026-08-13", prescribedBy: "Dr. S. Diop" },
  { id: "P-003", consultationId: "C-005", studentId: "ST-1114", studentName: "Ndeye Fall", medication: "Hydrocortisone 1% Cream", dosage: "Apply thin layer", frequency: "Twice daily", duration: "14 days", instructions: "Apply to affected areas only. Do not use on face.", status: "Active", date: "2026-08-11", prescribedBy: "Dr. S. Diop" },
  { id: "P-004", consultationId: "C-002", studentId: "ST-1188", studentName: "Kofi Mensah", medication: "Vitamin D3 1000IU", dosage: "1000IU", frequency: "Once daily", duration: "90 days", instructions: "Take with food for better absorption.", status: "Active", date: "2026-08-19", prescribedBy: "Dr. S. Diop" },
  { id: "P-005", consultationId: "C-006", studentId: "ST-1305", studentName: "Moussa Sy", medication: "Ibuprofen 400mg", dosage: "400mg", frequency: "Three times daily as needed", duration: "14 days", instructions: "Take with food. Do not exceed 1200mg/day.", status: "Active", date: "2026-08-10", prescribedBy: "Dr. S. Diop" },
];

export const defaultMedications: Medication[] = [
  { id: "M-001", name: "Amoxicillin 500mg", category: "Antibiotics", stock: 12, unit: "capsules", minStock: 50, expiryDate: "2027-03-15", supplier: "PharmaDakar", lastRestocked: "2026-07-01", status: "Low Stock" },
  { id: "M-002", name: "Salbutamol Inhaler", category: "Respiratory", stock: 8, unit: "inhalers", minStock: 10, expiryDate: "2026-09-08", supplier: "MediSupply SA", lastRestocked: "2026-06-15", status: "Low Stock" },
  { id: "M-003", name: "Paracetamol 500mg", category: "Pain Relief", stock: 280, unit: "tablets", minStock: 100, expiryDate: "2028-01-20", supplier: "PharmaDakar", lastRestocked: "2026-08-01", status: "In Stock" },
  { id: "M-004", name: "Ibuprofen 400mg", category: "Pain Relief", stock: 150, unit: "tablets", minStock: 80, expiryDate: "2027-11-30", supplier: "MediSupply SA", lastRestocked: "2026-08-10", status: "In Stock" },
  { id: "M-005", name: "Hydrocortisone 1% Cream", category: "Dermatology", stock: 25, unit: "tubes", minStock: 15, expiryDate: "2027-06-22", supplier: "PharmaDakar", lastRestocked: "2026-07-20", status: "In Stock" },
  { id: "M-006", name: "Sumatriptan 50mg", category: "Neurology", stock: 18, unit: "tablets", minStock: 20, expiryDate: "2027-08-10", supplier: "HealthWest", lastRestocked: "2026-08-05", status: "Low Stock" },
  { id: "M-007", name: "Omeprazole 20mg", category: "Gastrointestinal", stock: 90, unit: "capsules", minStock: 40, expiryDate: "2027-12-01", supplier: "PharmaDakar", lastRestocked: "2026-08-12", status: "In Stock" },
  { id: "M-008", name: "Cetirizine 10mg", category: "Allergy", stock: 65, unit: "tablets", minStock: 30, expiryDate: "2027-09-15", supplier: "MediSupply SA", lastRestocked: "2026-07-28", status: "In Stock" },
  { id: "M-009", name: "Vitamin D3 1000IU", category: "Supplements", stock: 200, unit: "tablets", minStock: 50, expiryDate: "2028-06-01", supplier: "HealthWest", lastRestocked: "2026-08-18", status: "In Stock" },
  { id: "M-010", name: "Metformin 500mg", category: "Diabetes", stock: 0, unit: "tablets", minStock: 30, expiryDate: "2027-04-20", supplier: "PharmaDakar", lastRestocked: "2026-05-10", status: "Out of Stock" },
  { id: "M-011", name: "Diazepam 5mg", category: "Anxiety", stock: 40, unit: "tablets", minStock: 25, expiryDate: "2027-10-15", supplier: "HealthWest", lastRestocked: "2026-08-01", status: "In Stock" },
  { id: "M-012", name: "Loratadine 10mg", category: "Allergy", stock: 85, unit: "tablets", minStock: 30, expiryDate: "2027-07-20", supplier: "MediSupply SA", lastRestocked: "2026-08-10", status: "In Stock" },
];

export const defaultAppointments: Appointment[] = [
  { id: "A-001", studentId: "ST-1042", studentName: "Amina Diallo", date: "2026-08-20", time: "09:30", type: "Follow-up", reason: "Recurring migraines", status: "Checked In", notes: "Bring latest headache diary" },
  { id: "A-002", studentId: "ST-1188", studentName: "Kofi Mensah", date: "2026-08-20", time: "10:00", type: "Routine", reason: "Annual wellness check", status: "Scheduled", notes: "" },
  { id: "A-003", studentId: "ST-0931", studentName: "Fatou Ndiaye", date: "2026-08-20", time: "10:30", type: "Follow-up", reason: "Asthma review", status: "Scheduled", notes: "Bring inhaler for technique check" },
  { id: "A-004", studentId: "ST-1270", studentName: "Boubacar Sarr", date: "2026-08-20", time: "11:00", type: "Routine", reason: "Sports clearance", status: "Scheduled", notes: "Need completed sports form" },
  { id: "A-005", studentId: "ST-1114", studentName: "Ndeye Fall", date: "2026-08-21", time: "09:00", type: "Follow-up", reason: "Skin irritation follow-up", status: "Scheduled", notes: "Photo updates of affected area" },
  { id: "A-006", studentId: "ST-1042", studentName: "Amina Diallo", date: "2026-08-22", time: "14:00", type: "Consultation", reason: "Lab results review", status: "Scheduled", notes: "" },
  { id: "A-007", studentId: "ST-1305", studentName: "Moussa Sy", date: "2026-08-21", time: "11:00", type: "Follow-up", reason: "Back pain physiotherapy check", status: "Scheduled", notes: "Physiotherapy progress report needed" },
  { id: "A-008", studentId: "ST-0931", studentName: "Fatou Ndiaye", date: "2026-08-15", time: "11:00", type: "Follow-up", reason: "Asthma check", status: "Completed", notes: "Good progress" },
  { id: "A-009", studentId: "ST-1188", studentName: "Kofi Mensah", date: "2026-08-14", time: "09:00", type: "Routine", reason: "Blood work", status: "Completed", notes: "Results pending" },
  { id: "A-010", studentId: "ST-1340", studentName: "Aissatou Ba", date: "2026-08-14", time: "09:15", type: "Routine", reason: "Freshman health screening", status: "Completed", notes: "All clear" },
];

export const defaultDocuments: MedicalDocument[] = [
  { id: "D-001", studentId: "ST-1042", studentName: "Amina Diallo", name: "Migraine History Report", type: "Medical Record", date: "2026-08-20", uploadedBy: "Dr. S. Diop", notes: "Comprehensive migraine history from past 6 months" },
  { id: "D-002", studentId: "ST-1188", studentName: "Kofi Mensah", name: "Annual Blood Panel", type: "Lab Result", date: "2026-08-19", uploadedBy: "Lab Tech", notes: "Complete blood count, metabolic panel, lipid profile" },
  { id: "D-003", studentId: "ST-0931", studentName: "Fatou Ndiaye", name: "Asthma Management Plan", type: "Medical Record", date: "2026-08-13", uploadedBy: "Dr. S. Diop", notes: "Updated action plan with emergency contacts" },
  { id: "D-004", studentId: "ST-1270", studentName: "Boubacar Sarr", name: "Sports Clearance Certificate", type: "Consent Form", date: "2026-08-12", uploadedBy: "Dr. S. Diop", notes: "Cleared for all sports activities" },
  { id: "D-005", studentId: "ST-1114", studentName: "Ndeye Fall", name: "Contact Dermatitis Photos", type: "Medical Record", date: "2026-08-11", uploadedBy: "Ndeye Fall", notes: "Progress photos of skin irritation on forearms" },
  { id: "D-006", studentId: "ST-1042", studentName: "Amina Diallo", name: "Insurance Card Copy", type: "Insurance", date: "2026-08-01", uploadedBy: "Admin", notes: "Valid until Dec 2026" },
  { id: "D-007", studentId: "ST-1188", studentName: "Kofi Mensah", name: "Vaccination Record", type: "Vaccination", date: "2026-07-15", uploadedBy: "Admin", notes: "Up to date on all required vaccinations" },
  { id: "D-008", studentId: "ST-1305", studentName: "Moussa Sy", name: "Physiotherapy Referral", type: "Medical Record", date: "2026-08-10", uploadedBy: "Dr. S. Diop", notes: "Referral for lower back pain physiotherapy" },
  { id: "D-009", studentId: "ST-1340", studentName: "Aissatou Ba", name: "Vaccination Certificate", type: "Vaccination", date: "2026-08-14", uploadedBy: "Admin", notes: "All vaccinations current. Meningitis, Hep B, Tdap verified" },
];

export const defaultFollowUps: FollowUp[] = [
  { id: "FU-001", studentId: "ST-1042", studentName: "Amina Diallo", reason: "Migraine treatment response check", dueDate: "2026-08-27", status: "Pending", priority: "High", notes: "Evaluate sumatriptan effectiveness", createdAt: "2026-08-20" },
  { id: "FU-002", studentId: "ST-0931", studentName: "Fatou Ndiaye", reason: "Asthma peak flow re-check", dueDate: "2026-08-25", status: "Pending", priority: "Medium", notes: "Compare with today's readings", createdAt: "2026-08-13" },
  { id: "FU-003", studentId: "ST-1114", studentName: "Ndeye Fall", reason: "Dermatitis healing progress", dueDate: "2026-08-22", status: "Pending", priority: "Medium", notes: "Assess hydrocortisone response", createdAt: "2026-08-11" },
  { id: "FU-004", studentId: "ST-1188", studentName: "Kofi Mensah", reason: "Blood work results review", dueDate: "2026-08-19", status: "Overdue", priority: "High", notes: "Results should be available", createdAt: "2026-08-14" },
  { id: "FU-005", studentId: "ST-1270", studentName: "Boubacar Sarr", reason: "Post-sports clearance injury check", dueDate: "2026-09-12", status: "Pending", priority: "Low", notes: "Routine 1-month check-in", createdAt: "2026-08-12" },
  { id: "FU-006", studentId: "ST-1042", studentName: "Amina Diallo", reason: "Medication refill - Sumatriptan", dueDate: "2026-09-20", status: "Pending", priority: "Low", notes: "30-day prescription ends", createdAt: "2026-08-20" },
  { id: "FU-007", studentId: "ST-1305", studentName: "Moussa Sy", reason: "Physiotherapy progress review", dueDate: "2026-08-24", status: "Pending", priority: "Medium", notes: "Check if physiotherapy is helping with back pain", createdAt: "2026-08-10" },
];

export const defaultSettings: AppSettings = {
  clinicName: "DAUST Health Center",
  clinicAddress: "Digital Africa University of Science and Technology, Dakar, Senegal",
  clinicPhone: "+221 33 869 0000",
  clinicEmail: "health@daust.sn",
  darkMode: false,
  notificationsEnabled: true,
  appointmentDuration: 30,
  workingHoursStart: "08:00",
  workingHoursEnd: "17:00",
};
