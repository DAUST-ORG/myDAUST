"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Pencil, UserPlus, X } from "lucide-react";
import {
  type AdminPrograms,
  type AdminStudent,
  createRegistrarStudent,
  getAdminPrograms,
  getAdminStudents,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Avatar, Badge, type BadgeTone, Field, IconButton, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", probation: "warning" };
const STATUS_LABEL: Record<string, string> = { active: "Active", probation: "Probation" };

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa > 0 && gpa < 2) return "var(--danger)";
  return "var(--fg1)";
}

interface CreatedNotice {
  name: string;
  studentNo: string;
  email: string;
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminStudent[]>([]);
  const [programs, setPrograms] = useState<AdminPrograms["programs"]>([]);
  const [q, setQ] = useState("");
  const [prog, setProg] = useState("all");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<CreatedNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { sort, toggle, apply } = useSort({ key: "name", dir: "asc" });

  function load() {
    getAdminStudents().then(setRows).catch((e: Error) => setError(e.message));
  }
  useEffect(() => {
    load();
    getAdminPrograms().then((p) => setPrograms(p.programs)).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows.filter(
      (s) =>
        (prog === "all" || s.program === prog) &&
        (!needle || s.name.toLowerCase().includes(needle) || s.studentNo.toLowerCase().includes(needle)),
    );
    return apply(base, {
      name: (s) => s.name,
      program: (s) => s.program,
      year: (s) => s.yearLevel ?? 0,
      gpa: (s) => s.gpa,
      balance: (s) => s.balance,
      status: (s) => s.status,
    });
  }, [rows, q, prog, apply]);

  const programOptions = [{ value: "all", label: "All programs" }, ...programs.map((p) => ({ value: p.code, label: p.name }))];

  return (
    <>
      <PageHeader
        eyebrow="Student Records"
        title="Students"
        subtitle={`${rows.length.toLocaleString()} enrolled across ${programs.length} programs.`}
        actions={
          <button className="primary" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <UserPlus size={15} /> Add student
          </button>
        }
      />

      {notice && (
        <div
          className="card"
          style={{ marginBottom: 16, borderColor: "var(--success-500, #1f9d55)", display: "flex", alignItems: "flex-start", gap: 12 }}
        >
          <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>Account created for {notice.name} · ID {notice.studentNo}.</strong>
            <div className="muted">A password-setup email has been sent to {notice.email} to complete registration on the platform.</div>
          </div>
          <IconButton label="Dismiss" onClick={() => setNotice(null)}><X size={15} /></IconButton>
        </div>
      )}
      {error && <div className="card" style={{ marginBottom: 16, color: "var(--danger)" }}>Could not load students — {error}</div>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search by name or ID…" width={280} />
        <Select value={prog} onChange={setProg} options={programOptions} />
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} of {rows.length} shown
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <SortTh label="Student" sortKey="name" sort={sort} onSort={toggle} />
                <SortTh label="Program" sortKey="program" sort={sort} onSort={toggle} />
                <SortTh label="Year" sortKey="year" sort={sort} onSort={toggle} />
                <SortTh label="GPA" sortKey="gpa" sort={sort} onSort={toggle} />
                <SortTh label="Balance" sortKey="balance" sort={sort} onSort={toggle} align="right" />
                <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/students/${s.id}`)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={s.name} size={32} src={s.photoUrl} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="muted" style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}>{s.studentNo}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone="neutral">{s.program}</Badge></td>
                  <td>{s.yearLevel ? `Year ${s.yearLevel}` : "—"}</td>
                  <td><span style={{ fontWeight: 700, color: gpaColor(s.gpa) }}>{s.gpa > 0 ? s.gpa.toFixed(2) : "—"}</span></td>
                  <td style={{ textAlign: "right", fontWeight: s.balance > 0 ? 600 : 400, color: s.balance > 0 ? "var(--danger)" : s.balance < 0 ? "var(--success)" : "var(--fg3)" }}>
                    {s.balance > 0 ? formatXof(s.balance) : s.balance < 0 ? `Credit ${formatXof(-s.balance)}` : "Cleared"}
                  </td>
                  <td><Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</Badge></td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Open record" onClick={() => router.push(`/admin/students/${s.id}`)}><Pencil size={15} /></IconButton>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>No students match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddStudentModal
          programs={programs}
          onClose={() => setAdding(false)}
          onCreated={(n) => {
            setAdding(false);
            setNotice(n);
            load();
          }}
        />
      )}
    </>
  );
}

function AddStudentModal({
  programs,
  onClose,
  onCreated,
}: {
  programs: AdminPrograms["programs"];
  onClose: () => void;
  onCreated: (notice: CreatedNotice) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!firstName.trim() || !studentNo.trim() || !email.trim()) {
      setErr("Student ID, first name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createRegistrarStudent({
        studentNo: studentNo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        dateOfBirth: dob || null,
        programCode: programCode || null,
      });
      onCreated({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), studentNo: res.studentNo, email: res.email });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create student.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Student"
      width={520}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create student"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Assign a Student ID · account &amp; a password-setup email are created on save.
        </p>
        <Field label="Student ID" hint="Assigned by the Registrar">
          <input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder="e.g. DAUST-2026-0001" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="First name"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Fatou" /></Field>
          <Field label="Last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Diallo" /></Field>
        </div>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@daust.edu" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Date of birth"><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          <Field label="Program">
            <Select value={programCode} onChange={setProgramCode} options={[{ value: "", label: "— None —" }, ...programs.map((p) => ({ value: p.code, label: p.name }))]} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
