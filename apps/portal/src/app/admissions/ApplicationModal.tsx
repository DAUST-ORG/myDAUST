"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { COUNTRIES, referralDetailKind } from "@mydaust/shared";
import {
  type ApplicantInput,
  createApplicant,
  updateApplicant,
} from "@/lib/api";
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
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  allergies?: string | null;
  source?: string | null;
  sourceDetail?: string | null;
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
  school: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  allergies: string;
  source: string;
  sourceDetail: string;
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
    school: s(i?.school),
    parentName: s(i?.parentName),
    parentPhone: s(i?.parentPhone),
    parentEmail: s(i?.parentEmail),
    allergies: s(i?.allergies),
    source: s(i?.source),
    sourceDetail: s(i?.sourceDetail),
    essay: s(i?.essay),
  };
}

const sanitizeEmail = (v: string) => v.trim().toLowerCase();

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
    parentName: nn(f.parentName),
    parentPhone: nn(f.parentPhone),
    parentEmail:
      f.parentEmail.trim() === "" ? null : sanitizeEmail(f.parentEmail),
    allergies: nn(f.allergies),
    source: nn(f.source),
    sourceDetail: nn(f.sourceDetail),
    essay: nn(f.essay),
    term: nn(f.term),
  };
}

/**
 * Only the fields the operator actually changed. The API treats an absent key as "leave
 * it alone" and an explicit null as "clear it", so sending the whole form made every
 * unseeded field a deliberate-looking wipe.
 */
function changedOnly<T extends Record<string, unknown>>(
  next: T,
  before: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (next[key] !== before[key]) out[key] = next[key];
  }
  return out;
}

export function ApplicationModal({
  mode,
  applicantId,
  initial,
  programs,
  onClose,
  onSaved,
}: Props) {
  const [f, setF] = useState<FormState>(() => initialForm(initial));
  // What the record looked like when the modal opened. Edits are sent as a diff against
  // this, so a field the caller forgot to seed is simply not sent rather than nulled.
  const [baseline] = useState(() => {
    const form = initialForm(initial);
    return {
      ...buildInput(form),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: sanitizeEmail(form.email),
    };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((p) => ({ ...p, [key]: value }));

  const schoolLabel =
    f.origin === "transfer" ? "Previous university" : "High school name";
  const submitLabel = mode === "edit" ? "Save changes" : "Submit application";
  const detailKind = referralDetailKind(f.source.trim() === "" ? null : f.source);

  async function submit() {
    setErr(null);
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim()) {
      setErr("First name, last name and email are required.");
      return;
    }
    const phoneOk = (v: string) =>
      v.trim() === "" || /^\+\d[\d\s\-.()]{5,38}$/.test(v.trim());
    if (!phoneOk(f.phone) || !phoneOk(f.parentPhone)) {
      setErr("Phone numbers must include the country code, e.g. +221 77 123 45 67.");
      return;
    }
    if (f.dateOfBirth !== "" && f.dateOfBirth > todayKey()) {
      setErr("Date of birth cannot be in the future.");
      return;
    }
    if (
      (detailKind === "person" || detailKind === "online") &&
      f.sourceDetail.trim() === ""
    ) {
      setErr(
        detailKind === "person"
          ? "Please give the name of the person who referred you."
          : "Please tell us which site or page led you to DAUST.",
      );
      return;
    }
    setBusy(true);
    try {
      const base = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        email: sanitizeEmail(f.email),
      };
      const input = { ...buildInput(f), ...base };
      const res =
        mode === "edit" && applicantId
          ? await updateApplicant(applicantId, changedOnly(input, baseline))
          : await createApplicant(input);
      onSaved(res.id);
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not save the application.",
      );
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
          <button
            className="primary"
            onClick={submit}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <Check size={15} /> {busy ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          DAUST undergraduate application · only name and email are required to
          open an entry.
        </p>
        {err && (
          <div className="badge overdue" style={{ padding: "8px 12px" }}>
            {err}
          </div>
        )}

        <Section label="Admission">
          <Grid cols={2}>
            <Field label="Admission term">
              <Select
                value={f.term}
                onChange={(v) => set("term", v)}
                options={[
                  { value: "", label: "—" },
                  ...TERM_OPTIONS.map((t) => ({ value: t, label: t })),
                ]}
              />
            </Field>
            <Field label="Program of choice">
              <Select
                value={f.programCode}
                onChange={(v) => set("programCode", v)}
                options={programOptions}
              />
            </Field>
          </Grid>
        </Section>

        <Section label="Personal information">
          <Grid cols={2}>
            <Field label="First name*">
              <input
                value={f.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </Field>
            <Field label="Last name*">
              <input
                value={f.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Email*">
              <input
                type="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Phone" hint="country code required, e.g. +221">
              <input
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+221 77 123 45 67"
              />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Date of birth">
              <DobPicker
                value={f.dateOfBirth}
                onChange={(v) => set("dateOfBirth", v)}
              />
            </Field>
            <Field label="Gender">
              <Select
                value={f.gender}
                onChange={(v) => set("gender", v)}
                options={[
                  { value: "", label: "—" },
                  ...GENDER_OPTIONS.map((g) => ({ value: g, label: g })),
                ]}
              />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field label="Nationality">
              <Select
                value={f.nationality}
                onChange={(v) => set("nationality", v)}
                options={countryOptions(f.nationality)}
              />
            </Field>
            <Field label="City of residence">
              <input
                value={f.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
          </Grid>
          <Field label="Country">
            <Select
              value={f.country}
              onChange={(v) => set("country", v)}
              options={countryOptions(f.country)}
            />
          </Field>
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
            <Field label="Entrance / BAC score" hint="0–20, optional">
              <input
                type="number"
                min={0}
                max={20}
                step="0.01"
                value={f.score}
                onChange={(e) => set("score", e.target.value)}
              />
            </Field>
          </Grid>
          <Field label={schoolLabel}>
            <input
              value={f.school}
              onChange={(e) => set("school", e.target.value)}
            />
          </Field>
        </Section>

        <Section label="Parent / guardian">
          <Grid cols={2}>
            <Field label="Name">
              <input
                value={f.parentName}
                onChange={(e) => set("parentName", e.target.value)}
              />
            </Field>
            <Field label="Phone" hint="country code required, e.g. +221">
              <input
                value={f.parentPhone}
                onChange={(e) => set("parentPhone", e.target.value)}
                placeholder="+221 77 123 45 67"
              />
            </Field>
          </Grid>
          <Field label="Email">
            <input
              type="email"
              value={f.parentEmail}
              onChange={(e) => set("parentEmail", e.target.value)}
            />
          </Field>
        </Section>

        <Section label="Additional">
          <Grid cols={2}>
            <Field label="Allergies / medical">
              <input
                value={f.allergies}
                onChange={(e) => set("allergies", e.target.value)}
              />
            </Field>
            <Field label="How did you learn about DAUST?">
              <Select
                value={f.source}
                onChange={(v) => {
                  set("source", v);
                  if (referralDetailKind(v.trim() === "" ? null : v) === null)
                    set("sourceDetail", "");
                }}
                options={[
                  { value: "", label: "—" },
                  ...SOURCE_OPTIONS.map((o) => ({ value: o, label: o })),
                ]}
              />
            </Field>
          </Grid>
          {detailKind === "person" && (
            <Field label="Name of the person who referred you*">
              <input
                value={f.sourceDetail}
                onChange={(e) => set("sourceDetail", e.target.value)}
                placeholder="Full name"
                maxLength={120}
              />
            </Field>
          )}
          {detailKind === "online" && (
            <Field label="Which site or page?*">
              <input
                value={f.sourceDetail}
                onChange={(e) => set("sourceDetail", e.target.value)}
                placeholder="e.g. Instagram, Google search"
                maxLength={120}
              />
            </Field>
          )}
          {detailKind === "other" && (
            <Field label="Tell us more (optional)">
              <input
                value={f.sourceDetail}
                onChange={(e) => set("sourceDetail", e.target.value)}
                maxLength={120}
              />
            </Field>
          )}
          <Field label="Statement of purpose">
            <textarea
              rows={4}
              value={f.essay}
              onChange={(e) => set("essay", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </Field>
        </Section>
      </div>
    </Modal>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--daust-orange)",
        }}
      >
        {label}
      </span>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

/** Stored value is always the English name; a legacy free-text value is kept selectable. */
function countryOptions(current: string) {
  const opts = [
    { value: "", label: "—" },
    ...COUNTRIES.map((c) => ({ value: c.en, label: c.en })),
  ];
  if (current !== "" && !COUNTRIES.some((c) => c.en === current)) {
    opts.splice(1, 0, { value: current, label: current });
  }
  return opts;
}

function todayKey(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Year → month → day dropdowns composing YYYY-MM-DD. Native date inputs bury year
 * navigation, which is the whole interaction for a birth date; a future date can
 * never be composed (max year is this year, and submit rejects a future day).
 */
function DobPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= thisYear - 60; y--) years.push(y);
  // Parts stay local so a half-picked date (year only) is kept on screen while
  // the form value remains "" — the API takes a full date or nothing.
  const [parts, setParts] = useState(() => {
    const [y, m, d] = value === "" ? ["", "", ""] : value.split("-");
    return { y: y ?? "", m: m ?? "", d: d ?? "" };
  });
  const daysInMonth =
    parts.y !== "" && parts.m !== ""
      ? new Date(Number(parts.y), Number(parts.m), 0).getDate()
      : 31;

  function pick(ny: string, nm: string, nd: string) {
    setParts({ y: ny, m: nm, d: nd });
    if (ny === "" || nm === "" || nd === "") {
      onChange("");
      return;
    }
    const dd = Math.min(Number(nd), new Date(Number(ny), Number(nm), 0).getDate());
    onChange(`${ny}-${nm.padStart(2, "0")}-${`${dd}`.padStart(2, "0")}`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      <Select
        ariaLabel="Birth year"
        value={parts.y}
        onChange={(v) => pick(v, parts.m, parts.d)}
        options={[
          { value: "", label: "Year" },
          ...years.map((yr) => ({ value: `${yr}`, label: `${yr}` })),
        ]}
      />
      <Select
        ariaLabel="Birth month"
        value={parts.m !== "" ? `${Number(parts.m)}` : ""}
        onChange={(v) => pick(parts.y, v, parts.d)}
        options={[
          { value: "", label: "Month" },
          ...Array.from({ length: 12 }, (_, i) => ({
            value: `${i + 1}`,
            label: new Date(2000, i, 1).toLocaleString("en", { month: "short" }),
          })),
        ]}
      />
      <Select
        ariaLabel="Birth day"
        value={parts.d !== "" ? `${Number(parts.d)}` : ""}
        onChange={(v) => pick(parts.y, parts.m, v)}
        options={[
          { value: "", label: "Day" },
          ...Array.from({ length: daysInMonth }, (_, i) => ({
            value: `${i + 1}`,
            label: `${i + 1}`,
          })),
        ]}
      />
    </div>
  );
}
