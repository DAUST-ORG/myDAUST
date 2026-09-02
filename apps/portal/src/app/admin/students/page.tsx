"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Pencil,
  Search,
  SlidersHorizontal,
  UserPlus,
  X,
} from "lucide-react";
import {
  type AdminStudent,
  type AdminStudentLoginFilter,
  type AdminStudentRosterPage,
  type AdminStudentRosterSort,
  createRegistrarStudent,
  getAdminStudentRoster,
} from "@/lib/api";
import {
  AccountBalanceText,
  AccountStatusLine,
  resolveAccountSummary,
} from "@/components/AccountBalance";
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Select,
  SortTh,
  useSort,
} from "@/components/ui";
import styles from "./students.module.css";

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  probation: "warning",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
};

const STANDING_OPTIONS = [
  { value: "all", label: "All standings" },
  { value: "not_yet_graded", label: "Not yet graded" },
  { value: "academic_probation", label: "Academic probation" },
  { value: "good_standing", label: "Good standing" },
  { value: "deans_list", label: "Dean's list" },
];

const LOGIN_OPTIONS = [
  { value: "all", label: "All login states" },
  { value: "active", label: "Active" },
  { value: "must_change", label: "Must change password" },
  { value: "not_activated", label: "Not activated" },
];

function RosterFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <span className={styles.filterControl}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Filter by ${label.toLowerCase()}`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </label>
  );
}

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa > 0 && gpa < 2) return "var(--danger)";
  return "var(--fg1)";
}
function StudentBalance({ student }: { student: AdminStudent }) {
  const summary = resolveAccountSummary(student.summary, {
    balanceXof: student.balance,
  });
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
  const [programs, setPrograms] = useState<AdminStudentRosterPage["programs"]>(
    [],
  );
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
  const [standing, setStanding] = useState("all");
  const [login, setLogin] = useState<AdminStudentLoginFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<CreatedNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { sort, toggle } = useSort({ key: "name", dir: "asc" });
  const sortKey = (sort?.key ?? "name") as AdminStudentRosterSort;
  const sortDirection = sort?.dir ?? "asc";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await getAdminStudentRoster(
          {
            page,
            pageSize,
            search: debouncedQ || undefined,
            program: prog,
            level,
            gender,
            nationality: country,
            standing,
            login,
            sort: sortKey,
            direction: sortDirection,
          },
          signal,
        );
        if (signal?.aborted) return;
        setRows(result.items);
        setPrograms(result.programs);
        setGenders(result.genders);
        setNationalities(result.nationalities);
        setTotal(result.total);
        setAllTotal(result.allTotal);
        setTotalPages(result.totalPages);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Could not load students.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      debouncedQ,
      page,
      pageSize,
      prog,
      level,
      gender,
      country,
      standing,
      login,
      sortDirection,
      sortKey,
    ],
  );

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

  const programOptions = [
    { value: "all", label: "All programs" },
    ...programs.map((p) => ({ value: p.code, label: p.name })),
  ];
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
    prog !== "all" ||
    level !== "all" ||
    gender !== "all" ||
    country !== "all" ||
    standing !== "all" ||
    login !== "all";
  const activeFilterCount = [
    prog,
    level,
    gender,
    country,
    standing,
    login,
  ].filter((value) => value !== "all").length;
  function clearFilters() {
    setProg("all");
    setLevel("all");
    setGender("all");
    setCountry("all");
    setStanding("all");
    setLogin("all");
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
            <button
              className="primary"
              onClick={() => setAdding(true)}
              style={{ display: "flex", alignItems: "center", gap: 7 }}
            >
              <UserPlus size={15} /> Add student
            </button>
          </div>
        }
      />

      {notice && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: "var(--success-500, #1f9d55)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>
              Account created for {notice.name} · ID {notice.studentNo}.
            </strong>
            <div className="muted">
              No password or setup link was created. The student can activate at
              /activate-student with their Student ID and date of birth.
            </div>
          </div>
          <IconButton label="Dismiss" onClick={() => setNotice(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {error && (
        <div
          className="card"
          style={{ marginBottom: 16, color: "var(--danger)" }}
        >
          Could not load students — {error}
        </div>
      )}

      <section
        className={styles.filterPanel}
        aria-label="Student roster filters"
      >
        <div className={styles.filterHeader}>
          <div className={styles.filterIdentity}>
            <span className={styles.filterIcon}>
              <SlidersHorizontal size={17} aria-hidden="true" />
            </span>
            <span>
              <span className={styles.filterTitle}>Refine roster</span>
              <span className={styles.filterHint}>
                Search identity records and narrow academic or account state.
              </span>
            </span>
          </div>
          <span className={styles.filterCount} aria-live="polite">
            {loading
              ? "Updating…"
              : total === 0
                ? "0 students"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </span>
        </div>

        <div className={styles.filterGrid}>
          <label className={`${styles.filterField} ${styles.searchField}`}>
            <span className={styles.filterLabel}>Search records</span>
            <span className={styles.searchControl}>
              <Search size={16} aria-hidden="true" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Name, Student ID, or email…"
                aria-label="Search students by name, Student ID, or email"
              />
            </span>
          </label>
          <RosterFilterSelect
            label="Program"
            value={prog}
            onChange={(value) => {
              setProg(value);
              setPage(1);
            }}
            options={programOptions}
          />
          <RosterFilterSelect
            label="Academic level"
            value={level}
            onChange={(value) => {
              setLevel(value);
              setPage(1);
            }}
            options={levelOptions}
          />
          <RosterFilterSelect
            label="Standing"
            value={standing}
            onChange={(value) => {
              setStanding(value);
              setPage(1);
            }}
            options={STANDING_OPTIONS}
          />
          <RosterFilterSelect
            label="Login"
            value={login}
            onChange={(value) => {
              setLogin(value as AdminStudentLoginFilter);
              setPage(1);
            }}
            options={LOGIN_OPTIONS}
          />
          <RosterFilterSelect
            label="Gender"
            value={gender}
            onChange={(value) => {
              setGender(value);
              setPage(1);
            }}
            options={genderOptions}
          />
          <RosterFilterSelect
            label="Nationality"
            value={country}
            onChange={(value) => {
              setCountry(value);
              setPage(1);
            }}
            options={nationalityOptions}
          />
        </div>

        <div className={styles.filterFooter}>
          <span className={styles.filterSummary}>
            {activeFilterCount > 0
              ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`
              : "Showing the full registrar roster"}
          </span>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              icon={<X size={14} />}
            >
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <SortTh
                  label="Student"
                  sortKey="name"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortTh
                  label="Program"
                  sortKey="program"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortTh
                  label="Level"
                  sortKey="level"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortTh
                  label="GPA"
                  sortKey="gpa"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortTh
                  label="Balance"
                  sortKey="balance"
                  sort={sort}
                  onSort={changeSort}
                  align="right"
                />
                <SortTh
                  label="Standing"
                  sortKey="status"
                  sort={sort}
                  onSort={changeSort}
                />
                <th style={{ textAlign: "left" }}>Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="muted"
                    style={{ textAlign: "center", padding: 32 }}
                  >
                    Loading student records…
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr
                  key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/admin/students/${s.id}`)}
                >
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Avatar name={s.name} size={32} src={s.photoUrl} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div
                          className="muted"
                          style={{
                            fontSize: 11.5,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {s.studentNo}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone="neutral">{s.program}</Badge>
                  </td>
                  <td>
                    {s.academicLevel ? (
                      <Badge tone="neutral">{s.academicLevel.code}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: gpaColor(s.gpa) }}>
                      {s.gpa > 0 ? s.gpa.toFixed(2) : "—"}
                    </span>
                  </td>
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
                        {s.academicStanding.source === "override"
                          ? " · manual"
                          : ""}
                      </Badge>
                    ) : (
                      <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!s.hasLogin && !s.mustChangePassword ? (
                      <Badge tone="neutral">Not activated</Badge>
                    ) : s.mustChangePassword ? (
                      <Badge tone="warning">Must change</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </td>
                  <td
                    style={{ textAlign: "right" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      label="Open record"
                      onClick={() => router.push(`/admin/students/${s.id}`)}
                    >
                      <Pencil size={15} />
                    </IconButton>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="muted"
                    style={{ textAlign: "center", padding: 32 }}
                  >
                    No students match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
          flexWrap: "wrap",
        }}
        aria-live="polite"
      >
        <label
          className="muted"
          style={{ fontSize: 12.5 }}
          htmlFor="student-page-size"
        >
          Rows per page
        </label>
        <select
          id="student-page-size"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value) as 25 | 50 | 100);
            setPage(1);
          }}
          aria-label="Rows per page"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <Button
          variant="secondary"
          disabled={loading || page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </Button>
        <span style={{ minWidth: 90, textAlign: "center", fontSize: 13 }}>
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={loading || page >= totalPages}
          onClick={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
        >
          Next
        </Button>
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
        dateOfBirth: dob,
        programCode: programCode || null,
      });
      onCreated({
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        studentNo: res.studentNo,
        email: res.email,
      });
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
          <button className="primary" onClick={submit} disabled={busy || !dob}>
            {busy ? "Creating…" : "Create student"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && (
          <div className="badge overdue" style={{ padding: "8px 12px" }}>
            {err}
          </div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Assign a Student ID and date of birth. The student activates their
          account with those details.
        </p>
        <Field label="Student ID" hint="Assigned by the Registrar">
          <input
            value={studentNo}
            onChange={(e) => setStudentNo(e.target.value)}
            placeholder="e.g. DAUST-2026-0001"
          />
        </Field>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <Field label="First name">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Fatou"
            />
          </Field>
          <Field label="Last name">
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Diallo"
            />
          </Field>
        </div>
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@daust.edu"
          />
        </Field>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <Field label="Date of birth">
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </Field>
          <Field label="Program">
            <Select
              value={programCode}
              onChange={setProgramCode}
              options={[
                { value: "", label: "— None —" },
                ...programs.map((p) => ({ value: p.code, label: p.name })),
              ]}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
