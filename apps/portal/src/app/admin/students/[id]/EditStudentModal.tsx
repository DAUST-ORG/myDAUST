"use client";

import { useEffect, useState } from "react";
import {
  type AdminPrograms,
  type AdminStudentDetail,
  type UpdateStudentInput,
  getAdminPrograms,
  updateStudent,
} from "@/lib/api";
import { Field, Modal, Select } from "@/components/ui";

export type EditSection = "all" | "enrollment" | "personal" | "contact" | "guardian";
const SECTION_TITLE: Record<EditSection, string> = {
  all: "Edit record",
  enrollment: "Edit enrollment",
  personal: "Edit personal details",
  contact: "Edit contact",
  guardian: "Edit guardian / emergency",
};

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
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAdminPrograms().then((p) => setPrograms(p.programs)).catch(() => {});
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

  return (
    <Modal
      open
      onClose={onClose}
      title={SECTION_TITLE[section]}
      width={640}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}

        {show("enrollment") && (
          <Section title="Identity & enrollment">
            <Field label="Full name"><input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Program">
              <Select value={form.programCode} onChange={(v) => set("programCode", v)} options={[{ value: "", label: "— None —" }, ...programs.map((p) => ({ value: p.code, label: p.name }))]} />
            </Field>
            <Field label="Year of study"><input type="number" min={1} max={8} value={form.yearLevel} onChange={(e) => set("yearLevel", e.target.value)} /></Field>
            <Field label="Cohort"><input value={form.cohort} onChange={(e) => set("cohort", e.target.value)} placeholder="Class of 2028" /></Field>
            <Field label="Advisor"><input value={form.advisor} onChange={(e) => set("advisor", e.target.value)} placeholder="Dr. Ibrahima Bâ" /></Field>
          </Section>
        )}

        {show("personal") && (
          <Section title="Personal">
            <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(v) => set("gender", v)} options={[{ value: "", label: "—" }, "Female", "Male", "Other"]} />
            </Field>
            <Field label="Nationality"><input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></Field>
          </Section>
        )}

        {show("contact") && (
          <Section title="Contact">
            <Field label="Phone"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+221 …" /></Field>
            <Field label="City"><input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          </Section>
        )}

        {show("guardian") && (
          <Section title="Guardian / emergency">
            <Field label="Name"><input value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></Field>
            <Field label="Relationship"><input value={form.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value)} placeholder="Parent" /></Field>
            <Field label="Phone"><input value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
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
