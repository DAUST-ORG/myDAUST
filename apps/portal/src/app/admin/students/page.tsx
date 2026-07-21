"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Upload, UserPlus } from "lucide-react";
import { type AdminPrograms, type AdminStudent, createStudent, getAdminPrograms, getAdminStudents } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Avatar, Badge, type BadgeTone, Field, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", probation: "warning" };
const STATUS_LABEL: Record<string, string> = { active: "Active", probation: "Probation" };

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa > 0 && gpa < 2) return "var(--danger)";
  return "var(--fg1)";
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminStudent[]>([]);
  const [programs, setPrograms] = useState<AdminPrograms["programs"]>([]);
  const [q, setQ] = useState("");
  const [prog, setProg] = useState("all");
  const [enroll, setEnroll] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { sort, toggle, apply } = useSort({ key: "name", dir: "asc" });

  function load() {
    getAdminStudents().then(setRows).catch(() => {});
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
      credits: (s) => s.completedCredits,
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
          <>
            <button onClick={() => setImportOpen(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Upload size={15} /> Import
            </button>
            <button className="primary" onClick={() => setEnroll(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <UserPlus size={15} /> Enroll student
            </button>
          </>
        }
      />

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
                <SortTh label="Credits" sortKey="credits" sort={sort} onSort={toggle} />
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
                  <td>{s.completedCredits}</td>
                  <td style={{ textAlign: "right", fontWeight: s.balance > 0 ? 600 : 400, color: s.balance > 0 ? "var(--danger)" : s.balance < 0 ? "var(--success)" : "var(--fg3)" }}>
                    {s.balance > 0 ? formatXof(s.balance) : s.balance < 0 ? `Credit ${formatXof(-s.balance)}` : "Cleared"}
                  </td>
                  <td><Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</Badge></td>
                  <td style={{ textAlign: "right" }}><ChevronRight size={16} color="var(--fg3)" /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>No students match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {enroll && (
        <EnrollModal
          programs={programs}
          onClose={() => setEnroll(false)}
          onCreated={(id) => {
            setEnroll(false);
            router.push(`/admin/students/${id}`);
          }}
        />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
    </>
  );
}

function EnrollModal({ programs, onClose, onCreated }: { programs: AdminPrograms["programs"]; onClose: () => void; onCreated: (id: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [billTuition, setBillTuition] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!fullName.trim() || !dob) {
      setErr("Full name and date of birth are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createStudent({
        fullName: fullName.trim(),
        dateOfBirth: dob,
        studentNo: studentNo.trim() || undefined,
        email: email.trim() || undefined,
        programCode: programCode || undefined,
        billTuition,
      });
      onCreated(res.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create student.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Enroll student"
      width={480}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Enrolling…" : "Enroll student"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <Field label="Full name"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Fatou Diallo" /></Field>
        <Field label="Date of birth"><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
        <Field label="Program" hint="Optional">
          <Select value={programCode} onChange={setProgramCode} options={[{ value: "", label: "— None —" }, ...programs.map((p) => ({ value: p.code, label: p.name }))]} />
        </Field>
        <Field label="Student ID" hint="Leave blank to auto-generate"><input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder="DAUST-2026-0299" /></Field>
        <Field label="Email" hint="Leave blank to synthesize"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@daust.edu" /></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={billTuition} onChange={(e) => setBillTuition(e.target.checked)} style={{ width: 16, height: 16 }} />
          Bill standard tuition (2,975,000 FCFA, 4 installments)
        </label>
      </div>
    </Modal>
  );
}

interface ImportRow {
  fullName: string;
  dateOfBirth: string;
  studentNo?: string;
  programCode?: string;
}
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null);

  function parse(): ImportRow[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^full ?name/i.test(l))
      .map((l) => {
        const [fullName, dateOfBirth, studentNo, programCode] = l.split(",").map((c) => c.trim());
        return { fullName: fullName ?? "", dateOfBirth: dateOfBirth ?? "", studentNo: studentNo || undefined, programCode: programCode || undefined };
      });
  }

  async function run() {
    const parsed = parse();
    if (!parsed.length) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const r of parsed) {
      if (!r.fullName || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateOfBirth)) {
        failed.push(`${r.fullName || "(blank)"} — bad name/DOB`);
        continue;
      }
      try {
        await createStudent({ fullName: r.fullName, dateOfBirth: r.dateOfBirth, studentNo: r.studentNo, programCode: r.programCode, billTuition: true });
        ok += 1;
      } catch (e) {
        failed.push(`${r.fullName} — ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setResult({ ok, failed });
    setBusy(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Import students"
      width={560}
      footer={
        result ? (
          <button className="primary" onClick={onDone}>Done</button>
        ) : (
          <>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={run} disabled={busy || !text.trim()}>{busy ? "Importing…" : "Import"}</button>
          </>
        )
      }
    >
      {result ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="badge paid" style={{ padding: "8px 12px", width: "fit-content" }}>{result.ok} student{result.ok === 1 ? "" : "s"} imported</div>
          {result.failed.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{result.failed.length} skipped</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--fg3)" }}>
                {result.failed.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            One student per line as <code>Full name, YYYY-MM-DD, Student ID (optional), Program code (optional)</code>. Each is billed standard tuition.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"Fatou Diallo, 2005-03-11, , CS\nMoussa Sow, 2004-11-02"}
            style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 13, padding: 12, borderRadius: 10, border: "1px solid var(--border)", resize: "vertical" }}
          />
        </div>
      )}
    </Modal>
  );
}
