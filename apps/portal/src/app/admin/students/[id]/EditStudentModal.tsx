"use client";

import { useEffect, useState } from "react";
import {
  type AcademicYearRow,
  type AdminPrograms,
  type AdminStudentDetail,
  type UpdateStudentInput,
  getAcademicYears,
  getAdminPrograms,
  updateStudent,
} from "@/lib/api";
import { Field, Modal, Select } from "@/components/ui";

export type EditSection = "all" | "enrollment" | "personal" | "contact" | "guardian";
const SECTION_TITLE: Record<EditSection, string> = {
  all: "Edit record",
  enrollment: "Edit academic & enrollment",
  personal: "Edit personal details",
  contact: "Edit contact",
  guardian: "Edit emergency & health",
};

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const ENROLLMENT_STATUS = ["Active", "Probation", "Suspended", "Graduated"];

export function EditStudentModal({
  student,
  section = "all",
  onClose,
  onSaved,
}: {
  student: AdminStudentDetail;
  section?: EditSection;
  onClose: () => void;
  onSaved: (updated: AdminStudentDetail) => void;
}) {
  const show = (k: EditSection) => section === "all" || section === k;
  const [programs, setPrograms] = useState<AdminPrograms["programs"]>([]);
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [form, setForm] = useState({
    fullName: student.name,
    email: student.email,
    programCode: student.programCode ?? "",
    dateOfBirth: student.dateOfBirth ?? "",
    gender: student.gender ?? "",
    phone: student.phone ?? "",
    address: student.address ?? "",
    city: student.city ?? "",
    nationality: student.nationality ?? "",
    guardianName: student.guardianName ?? "",
    guardianRelation: student.guardianRelation ?? "",
    guardianPhone: student.guardianPhone ?? "",
    advisor: student.advisor ?? "",
    yearLevel: student.yearLevel != null ? String(student.yearLevel) : "",
    cohort: student.cohort ?? "",
    preferredName: student.preferredName ?? "",
    nationalId: student.nationalId ?? "",
    maritalStatus: student.maritalStatus ?? "",
    personalEmail: student.personalEmail ?? "",
    bloodType: student.bloodType ?? "",
    allergies: student.allergies ?? "",
    insurance: student.insurance ?? "",
    physician: student.physician ?? "",
    emergencyName2: student.emergencyName2 ?? "",
    emergencyPhone2: student.emergencyPhone2 ?? "",
    major: student.major ?? "",
    minor: student.minor ?? "",
    admitTerm: student.admitTerm ?? "",
    expectedGrad: student.expectedGrad ?? "",
    enrollmentStatus: student.enrollmentStatus ?? "",
    catalogYear: student.catalogYear ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAdminPrograms().then((p) => setPrograms(p.programs)).catch(() => {});
    getAcademicYears().then(setYears).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  const norm = (v: string): string | null => (v.trim() === "" ? null : v.trim());

  async function save() {
    setErr(null);
    if (!form.fullName.trim()) {
      setErr("Full name is required.");
      return;
    }
    const input: UpdateStudentInput = {
      fullName: form.fullName.trim(),
      email: form.email.trim() || undefined,
      programCode: form.programCode || null,
      dateOfBirth: norm(form.dateOfBirth),
      gender: norm(form.gender),
      phone: norm(form.phone),
      address: norm(form.address),
      city: norm(form.city),
      nationality: norm(form.nationality),
      guardianName: norm(form.guardianName),
      guardianRelation: norm(form.guardianRelation),
      guardianPhone: norm(form.guardianPhone),
      advisor: norm(form.advisor),
      yearLevel: form.yearLevel.trim() === "" ? null : Number(form.yearLevel),
      cohort: norm(form.cohort),
      preferredName: norm(form.preferredName),
      nationalId: norm(form.nationalId),
      maritalStatus: norm(form.maritalStatus),
      personalEmail: norm(form.personalEmail),
      bloodType: norm(form.bloodType),
      allergies: norm(form.allergies),
      insurance: norm(form.insurance),
      physician: norm(form.physician),
      emergencyName2: norm(form.emergencyName2),
      emergencyPhone2: norm(form.emergencyPhone2),
      major: norm(form.major),
      minor: norm(form.minor),
      admitTerm: norm(form.admitTerm),
      expectedGrad: norm(form.expectedGrad),
      enrollmentStatus: norm(form.enrollmentStatus),
      catalogYear: norm(form.catalogYear),
    };
    setBusy(true);
    try {
      const updated = await updateStudent(student.id, input);
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  const catalogYearOptions = [
    { value: "", label: "—" },
    ...years.map((y) => ({ value: y.label, label: `${y.label}${y.status === "active" ? " (active)" : ""}` })),
  ];
  // Preserve a stored catalogYear value even if it is no longer in the years list.
  if (form.catalogYear && !years.some((y) => y.label === form.catalogYear)) {
    catalogYearOptions.push({ value: form.catalogYear, label: form.catalogYear });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={SECTION_TITLE[section]}
      width={680}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}

        {show("personal") && (
          <Section title="Personal">
            <Field label="Full name"><input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
            <Field label="Preferred name"><input value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} /></Field>
            <Field label="National ID"><input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} /></Field>
            <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(v) => set("gender", v)} options={[{ value: "", label: "—" }, "Female", "Male", "Other"]} />
            </Field>
            <Field label="Blood type">
              <Select value={form.bloodType} onChange={(v) => set("bloodType", v)} options={[{ value: "", label: "—" }, ...BLOOD_TYPES]} />
            </Field>
            <Field label="Nationality"><input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></Field>
            <Field label="Marital status">
              <Select value={form.maritalStatus} onChange={(v) => set("maritalStatus", v)} options={[{ value: "", label: "—" }, ...MARITAL]} />
            </Field>
          </Section>
        )}

        {show("contact") && (
          <Section title="Contact">
            <Field label="Email"><input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Personal email"><input value={form.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} placeholder="name@example.com" /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+221 …" /></Field>
            <Field label="City"><input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          </Section>
        )}

        {show("enrollment") && (
          <Section title="Academic & enrollment">
            <Field label="Program">
              <Select value={form.programCode} onChange={(v) => set("programCode", v)} options={[{ value: "", label: "— None —" }, ...programs.map((p) => ({ value: p.code, label: p.name }))]} />
            </Field>
            <Field label="Year of study"><input type="number" min={1} max={8} value={form.yearLevel} onChange={(e) => set("yearLevel", e.target.value)} /></Field>
            <Field label="Catalog year">
              <Select value={form.catalogYear} onChange={(v) => set("catalogYear", v)} options={catalogYearOptions} />
            </Field>
            <Field label="Enrollment status">
              <Select value={form.enrollmentStatus} onChange={(v) => set("enrollmentStatus", v)} options={[{ value: "", label: "—" }, ...ENROLLMENT_STATUS]} />
            </Field>
            <Field label="Advisor"><input value={form.advisor} onChange={(e) => set("advisor", e.target.value)} placeholder="Dr. Ibrahima Bâ" /></Field>
            <Field label="Cohort"><input value={form.cohort} onChange={(e) => set("cohort", e.target.value)} placeholder="Class of 2028" /></Field>
            <Field label="Major"><input value={form.major} onChange={(e) => set("major", e.target.value)} /></Field>
            <Field label="Minor"><input value={form.minor} onChange={(e) => set("minor", e.target.value)} /></Field>
            <Field label="Admit term"><input value={form.admitTerm} onChange={(e) => set("admitTerm", e.target.value)} placeholder="Fall 2023" /></Field>
            <Field label="Expected graduation"><input value={form.expectedGrad} onChange={(e) => set("expectedGrad", e.target.value)} placeholder="June 2027" /></Field>
          </Section>
        )}

        {show("guardian") && (
          <Section title="Emergency & health">
            <Field label="Guardian name"><input value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></Field>
            <Field label="Guardian relationship"><input value={form.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value)} placeholder="Parent" /></Field>
            <Field label="Guardian phone"><input value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
            <Field label="Secondary contact name"><input value={form.emergencyName2} onChange={(e) => set("emergencyName2", e.target.value)} /></Field>
            <Field label="Secondary contact phone"><input value={form.emergencyPhone2} onChange={(e) => set("emergencyPhone2", e.target.value)} /></Field>
            <Field label="Allergies / conditions"><input value={form.allergies} onChange={(e) => set("allergies", e.target.value)} /></Field>
            <Field label="Health insurance"><input value={form.insurance} onChange={(e) => set("insurance", e.target.value)} /></Field>
            <Field label="Campus physician"><input value={form.physician} onChange={(e) => set("physician", e.target.value)} /></Field>
          </Section>
        )}
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg3)", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>{children}</div>
    </div>
  );
}
