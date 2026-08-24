"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { type ApplicantInput, createApplicant, updateApplicant } from "@/lib/api";
import { Field, Modal, Select } from "@/components/ui";

export interface ProgramOption {
  code: string;
  name: string;
}

/** Prefill values for edit mode; only the fields the detail endpoint returns are ever populated. */
export interface ApplicationInitial {
  firstName?: string;
  lastName?: string;
  email?: string;
  programCode?: string | null;
  score?: number | null;
  country?: string | null;
  term?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  city?: string | null;
  origin?: "high-school" | "transfer" | null;
  school?: string | null;
  priorGpa?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  allergies?: string | null;
  source?: string | null;
  essay?: string | null;
}

interface Props {
  mode: "create" | "edit";
  applicantId?: string;
  initial?: ApplicationInitial;
  programs: ProgramOption[];
  onClose: () => void;
  onSaved: (id: string) => void;
}

const TERM_OPTIONS = ["Fall 2026", "Spring 2027", "Fall 2027"];
const GENDER_OPTIONS = ["Female", "Male", "Other"];
const SOURCE_OPTIONS = [
  "Website",
  "Social media",
  "School counselor",
  "Alumni referral",
  "DAUST open day",
  "Friend / family",
  "Other",
];

interface FormState {
  term: string;
  programCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  city: string;
  country: string;
  origin: "" | "high-school" | "transfer";
  score: string;
  priorGpa: string;
  school: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  allergies: string;
  source: string;
  essay: string;
}

function initialForm(i?: ApplicationInitial): FormState {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    term: s(i?.term),
    programCode: s(i?.programCode),
    firstName: s(i?.firstName),
    lastName: s(i?.lastName),
    email: s(i?.email),
    phone: s(i?.phone),
    dateOfBirth: s(i?.dateOfBirth),
    gender: s(i?.gender),
    nationality: s(i?.nationality),
    city: s(i?.city),
    country: s(i?.country),
    origin: i?.origin ?? "",
    score: i?.score != null ? String(i.score) : "",
    priorGpa: s(i?.priorGpa),
    school: s(i?.school),
    parentName: s(i?.parentName),
    parentPhone: s(i?.parentPhone),
    parentEmail: s(i?.parentEmail),
    allergies: s(i?.allergies),
    source: s(i?.source),
    essay: s(i?.essay),
  };
}

function buildInput(f: FormState): ApplicantInput {
  const nn = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    programCode: nn(f.programCode),
    country: nn(f.country),
    score: f.score.trim() === "" ? null : Number(f.score),
    phone: nn(f.phone),
    dateOfBirth: nn(f.dateOfBirth),
    gender: nn(f.gender),
    nationality: nn(f.nationality),
    city: nn(f.city),
    origin: f.origin === "" ? null : f.origin,
    school: nn(f.school),
    priorGpa: nn(f.priorGpa),
    parentName: nn(f.parentName),
    parentPhone: nn(f.parentPhone),
    parentEmail: nn(f.parentEmail),
    allergies: nn(f.allergies),
    source: nn(f.source),
    essay: nn(f.essay),
    term: nn(f.term),
  };
}

export function ApplicationModal({ mode, applicantId, initial, programs, onClose, onSaved }: Props) {
  const [f, setF] = useState<FormState>(() => initialForm(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((p) => ({ ...p, [key]: value }));

  const schoolLabel = f.origin === "transfer" ? "Previous university" : "High school name";
  const submitLabel = mode === "edit" ? "Save changes" : "Submit application";

  async function submit() {
    setErr(null);
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim()) {
      setErr("First name, last name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const base = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim() };
      const input = { ...buildInput(f), ...base };
      const res =
        mode === "edit" && applicantId
          ? await updateApplicant(applicantId, input)
          : await createApplicant(input);
      onSaved(res.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the application.");
      setBusy(false);
    }
  }

  const programOptions = [
    { value: "", label: "— Select a program —" },
    ...programs.map((p) => ({ value: p.code, label: p.name })),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? "Edit Application" : "New Application"}
      width={680}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Check size={15} /> {busy ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          DAUST undergraduate application · only name and email are required to open an entry.
        </p>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}

        <Section label="Admission">
          <Grid cols={2}>
            <Field label="Admission term">
              <Select value={f.term} onChange={(v) => set("term", v)} options={[{ value: "", label: "—" }, ...TERM_OPTIONS.map((t) => ({ value: t, label: t }))]} />
            </Field>
            <Field label="Program of choice">
              <Select value={f.programCode} onChange={(v) => set("programCode", v)} options={programOptions} />
            </Field>
          </Grid>
        </Section>

        <Section label="Personal information">
          <Grid cols={2}>
            <Field label="First name*"><input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
            <Field label="Last name*"><input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Email*"><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Date of birth"><input type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
            <Field label="Gender">
              <Select value={f.gender} onChange={(v) => set("gender", v)} options={[{ value: "", label: "—" }, ...GENDER_OPTIONS.map((g) => ({ value: g, label: g }))]} />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Nationality"><input value={f.nationality} onChange={(e) => set("nationality", e.target.value)} /></Field>
            <Field label="City of residence"><input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
          </Grid>
          <Field label="Country"><input value={f.country} onChange={(e) => set("country", e.target.value)} /></Field>
        </Section>

        <Section label="Academic background">
          <Grid cols={2}>
            <Field label="Applying from">
              <Select
                value={f.origin}
                onChange={(v) => set("origin", v as FormState["origin"])}
                options={[
                  { value: "", label: "—" },
                  { value: "high-school", label: "High school" },
                  { value: "transfer", label: "University transfer" },
                ]}
              />
            </Field>
            <Field label="Entrance score" hint="0–20, optional">
              <input type="number" min={0} max={20} step="0.01" value={f.score} onChange={(e) => set("score", e.target.value)} />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field label="GPA / average" hint="e.g. 17/20 or 3.6/4"><input value={f.priorGpa} onChange={(e) => set("priorGpa", e.target.value)} /></Field>
            <Field label={schoolLabel}><input value={f.school} onChange={(e) => set("school", e.target.value)} /></Field>
          </Grid>
        </Section>

        <Section label="Parent / guardian">
          <Grid cols={2}>
            <Field label="Name"><input value={f.parentName} onChange={(e) => set("parentName", e.target.value)} /></Field>
            <Field label="Phone"><input value={f.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} /></Field>
          </Grid>
          <Field label="Email"><input type="email" value={f.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} /></Field>
        </Section>

        <Section label="Additional">
          <Grid cols={2}>
            <Field label="Allergies / medical"><input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} /></Field>
            <Field label="How did you learn about DAUST?">
              <Select value={f.source} onChange={(v) => set("source", v)} options={[{ value: "", label: "—" }, ...SOURCE_OPTIONS.map((o) => ({ value: o, label: o }))]} />
            </Field>
          </Grid>
          <Field label="Statement of purpose">
            <textarea rows={4} value={f.essay} onChange={(e) => set("essay", e.target.value)} style={{ resize: "vertical" }} />
          </Field>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{label}</span>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>{children}</div>;
}
