"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, UserPlus, X } from "lucide-react";
import {
  type AdminStudent,
  type AdminStudentRosterPage,
  type AdminStudentRosterSort,
  createRegistrarStudent,
  getAdminStudentRoster,
  type ProvisionedLogin,
  provisionAllStudentLogins,
  provisionStudentLogin,
} from "@/lib/api";
import { AccountBalanceText, AccountStatusLine, resolveAccountSummary } from "@/components/AccountBalance";
import { Avatar, Badge, type BadgeTone, Button, Field, IconButton, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", probation: "warning" };
const STATUS_LABEL: Record<string, string> = { active: "Active", probation: "Probation" };

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa > 0 && gpa < 2) return "var(--danger)";
  return "var(--fg1)";
}
function StudentBalance({ student }: { student: AdminStudent }) {
  const summary = resolveAccountSummary(student.summary, { balanceXof: student.balance });
  return (
    <td style={{ textAlign: "right" }}>
      <span style={{ display: "grid", gap: 2, justifyItems: "end" }}>
        <AccountBalanceText summary={summary} style={{ fontWeight: 600 }} />
        {(summary.standing === "overdue" ||
          summary.standing === "unscheduled" ||
          summary.dueTodayXof > 0) && <AccountStatusLine summary={summary} />}
      </span>
    </td>
  );
}

interface CreatedNotice {
  name: string;
  studentNo: string;
  email: string;
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminStudent[]>([]);
  const [programs, setPrograms] = useState<AdminStudentRosterPage["programs"]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [prog, setProg] = useState("all");
  // Academic level filter. Levels are derived per-row from the student's catalog
  // (S1, S2, …), so the server returns the *result of derivation* across all
  // students — we only need to know which codes are possible. We seed the
  // Select from the static range; the API will simply return zero rows when a
  // code is selected that no student is currently in.
  const [level, setLevel] = useState("all");
  const [gender, setGender] = useState("all");
  const [country, setCountry] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [missingLogins, setMissingLogins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<CreatedNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<ProvisionedLogin[] | null>(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const { sort, toggle } = useSort({ key: "name", dir: "asc" });
  const sortKey = (sort?.key ?? "name") as AdminStudentRosterSort;
  const sortDirection = sort?.dir ?? "asc";

  async function provisionOne(id: string) {
    setError(null);
    try {
      const c = await provisionStudentLogin(id);
      setCreds([c]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not provision login.");
    } finally {
      setProvisioning(null);
    }
  }

  async function provisionAll() {
    setProvisioning("all");
    setError(null);
    try {
      const res = await provisionAllStudentLogins();
      setCreds(res.credentials);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not provision logins.");
    } finally {
      setProvisioning(null);
    }
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await getAdminStudentRoster({
        page,
        pageSize,
        search: debouncedQ || undefined,
        program: prog,
        level,
        gender,
        nationality: country,
        sort: sortKey,
        direction: sortDirection,
      }, signal);
      if (signal?.aborted) return;
      setRows(result.items);
      setPrograms(result.programs);
      setGenders(result.genders);
      setNationalities(result.nationalities);
      setTotal(result.total);
      setAllTotal(result.allTotal);
      setTotalPages(result.totalPages);
      setMissingLogins(result.missingLoginCount);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Could not load students.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedQ, page, pageSize, prog, level, gender, country, sortDirection, sortKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQ(q.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function changeSort(key: string) {
    setPage(1);
    toggle(key);
  }

  const programOptions = [{ value: "all", label: "All programs" }, ...programs.map((p) => ({ value: p.code, label: p.name }))];
  // Level options cover all known catalog progression codes (the engineering
  // catalog reaches S10 per the shared test fixtures). The API will simply
  // return zero rows for codes no student is currently in.
  const levelOptions = [
    { value: "all", label: "All levels" },
    ...Array.from({ length: 10 }, (_, index) => ({
      value: `S${index + 1}`,
      label: `S${index + 1}`,
    })),
  ];
  const genderOptions = [
    { value: "all", label: "All genders" },
    ...genders.map((value) => ({ value, label: value })),
  ];
  const nationalityOptions = [
    { value: "all", label: "All nationalities" },
    ...nationalities.map((value) => ({ value, label: value })),
  ];
  const hasActiveFilter =
    prog !== "all" || level !== "all" || gender !== "all" || country !== "all";
  function clearFilters() {
    setProg("all");
    setLevel("all");
    setGender("all");
    setCountry("all");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Student Records"
        title="Students"
        subtitle={`${allTotal.toLocaleString()} student records across ${programs.length} programs.`}
        actions={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {missingLogins > 0 && (
              <Button variant="secondary" icon={<KeyRound size={15} />} onClick={provisionAll} disabled={provisioning !== null}>
                {provisioning === "all" ? "Generating…" : `Generate ${missingLogins} logins`}
              </Button>
            )}
            <button className="primary" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <UserPlus size={15} /> Add student
            </button>
          </div>
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
        <Select
          value={prog}
          onChange={(value) => { setProg(value); setPage(1); }}
          options={programOptions}
          ariaLabel="Filter by program"
        />
        <Select
          value={level}
          onChange={(value) => { setLevel(value); setPage(1); }}
          options={levelOptions}
          ariaLabel="Filter by academic level"
        />
        <Select
          value={gender}
          onChange={(value) => { setGender(value); setPage(1); }}
          options={genderOptions}
          ariaLabel="Filter by gender"
        />
        <Select
          value={country}
          onChange={(value) => { setCountry(value); setPage(1); }}
          options={nationalityOptions}
          ariaLabel="Filter by nationality"
        />
        {hasActiveFilter && (
          <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          {loading ? "Loading…" : total === 0 ? "0 students" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <SortTh label="Student" sortKey="name" sort={sort} onSort={changeSort} />
                <SortTh label="Program" sortKey="program" sort={sort} onSort={changeSort} />
                <SortTh label="Level" sortKey="level" sort={sort} onSort={changeSort} />
                <SortTh label="GPA" sortKey="gpa" sort={sort} onSort={changeSort} />
                <SortTh label="Balance" sortKey="balance" sort={sort} onSort={changeSort} align="right" />
                <SortTh label="Standing" sortKey="status" sort={sort} onSort={changeSort} />
                <th style={{ textAlign: "left" }}>Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>Loading student records…</td></tr>
              )}
              {rows.map((s) => (
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
                  <td>{s.academicLevel ? <Badge tone="neutral">{s.academicLevel.code}</Badge> : "—"}</td>
                  <td><span style={{ fontWeight: 700, color: gpaColor(s.gpa) }}>{s.gpa > 0 ? s.gpa.toFixed(2) : "—"}</span></td>
                  <StudentBalance student={s} />
                  <td>
                    {s.status === "archived" ? (
                      <Badge tone="neutral">Archived</Badge>
                    ) : s.academicStanding ? (
                      <Badge
                        tone={
                          s.academicStanding.tone === "warning"
                            ? "warning"
                            : s.academicStanding.tone === "success"
                              ? "success"
                              : s.academicStanding.tone === "honor"
                                ? "navy"
                                : "neutral"
                        }
                      >
                        {s.academicStanding.label}
                        {s.academicStanding.source === "override" ? " · manual" : ""}
                      </Badge>
                    ) : (
                      <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!s.hasLogin ? (
                      <button className="link-btn" onClick={() => provisionOne(s.id)} disabled={provisioning !== null} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer" }}>
                        <KeyRound size={13} /> {provisioning === s.id ? "…" : "Generate login"}
                      </button>
                    ) : s.mustChangePassword ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge tone="warning">Must change</Badge>
                        <button className="link-btn" onClick={() => provisionOne(s.id)} disabled={provisioning !== null} style={{ fontSize: 12, color: "var(--fg3)", background: "none", border: "none", cursor: "pointer" }}>Reset</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge tone="success">Active</Badge>
                        <button className="link-btn" onClick={() => provisionOne(s.id)} disabled={provisioning !== null} style={{ fontSize: 12, color: "var(--fg3)", background: "none", border: "none", cursor: "pointer" }}>Reset</button>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Open record" onClick={() => router.push(`/admin/students/${s.id}`)}><Pencil size={15} /></IconButton>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>No students match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }} aria-live="polite">
        <label className="muted" style={{ fontSize: 12.5 }} htmlFor="student-page-size">Rows per page</label>
        <select
          id="student-page-size"
          value={pageSize}
          onChange={(event) => { setPageSize(Number(event.target.value) as 25 | 50 | 100); setPage(1); }}
          aria-label="Rows per page"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
        <span style={{ minWidth: 90, textAlign: "center", fontSize: 13 }}>Page {page} of {totalPages}</span>
        <Button variant="secondary" disabled={loading || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
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

      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
    </>
  );
}

function CredentialsModal({ creds, onClose }: { creds: ProvisionedLogin[]; onClose: () => void }) {
  const bulk = creds.length > 1;
  function downloadCsv() {
    const header = "studentNo,name,email,tempPassword";
    const body = creds.map((c) => [c.studentNo, c.name, c.email, c.tempPassword].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daust-logins-${creds.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={bulk ? `${creds.length} logins generated` : "Login generated"}
      width={bulk ? 640 : 460}
      footer={
        <>
          {bulk && <button onClick={downloadCsv}>Download CSV</button>}
          <button className="primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="badge overdue" style={{ padding: "8px 12px", fontSize: 12.5 }}>
          Copy these now — passwords are shown once and are never stored or emailed. Each student must change it on first login.
        </div>
        {bulk ? (
          <div style={{ maxHeight: 340, overflowY: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
            {creds.map((c) => (
              <div key={c.studentId} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--divider)" }}>
                <span>{c.studentNo}</span><span>{c.email}</span><strong>{c.tempPassword}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <Field label="Name"><div>{creds[0]!.name}</div></Field>
            <Field label="Email (login)"><div style={{ fontFamily: "ui-monospace, monospace" }}>{creds[0]!.email}</div></Field>
            <Field label="Temporary password"><div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 16 }}>{creds[0]!.tempPassword}</div></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddStudentModal({
  programs,
  onClose,
  onCreated,
}: {
  programs: AdminStudentRosterPage["programs"];
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
