"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Card, EmptyState } from "@/components/ui";
import { CourseTabs, courseTitle } from "../CourseTabs";
import { type TeachingSection, getTeaching, submitGrades } from "@/lib/api";
import {
  type FacultyGradebook,
  type GradeSubmissionStatus,
  getFacultyGradebook,
} from "@/lib/api-faculty";

const GRADE_OPTIONS = ["", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

const STATUS_STYLE: Record<GradeSubmissionStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "var(--bg-subtle)", fg: "var(--fg3)" },
  submitted: { label: "Submitted", bg: "rgba(237,132,37,.14)", fg: "#a85f16" },
  approved: { label: "Approved", bg: "rgba(46,125,82,.12)", fg: "#1f6b42" },
  returned: { label: "Returned", bg: "rgba(192,57,43,.12)", fg: "#a3291b" },
};

const SUBMIT_LABEL: Record<GradeSubmissionStatus, string> = {
  draft: "Submit for approval",
  returned: "Submit for approval",
  submitted: "Awaiting approval",
  approved: "Approved by registrar",
};

export default function FacultyGradeEntry() {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [gb, setGb] = useState<FacultyGradebook | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, []);

  const load = useCallback(() => {
    if (!sectionId) return;
    getFacultyGradebook(sectionId)
      .then((g) => {
        setGb(g);
        setDraft(Object.fromEntries(g.students.map((s) => [s.enrollmentId, s.grade ?? ""])));
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [sectionId]);
  useEffect(load, [load]);

  const section = sections?.find((s) => s.id === sectionId);
  const status: GradeSubmissionStatus = gb?.status ?? "draft";
  const locked = status === "submitted" || status === "approved";
  const allGraded =
    !!gb && gb.students.length > 0 && gb.students.every((s) => (draft[s.enrollmentId] ?? "") !== "");

  async function save(finalize: boolean) {
    if (!gb) return;
    setBusy(true);
    setMsg(null);
    try {
      const grades = Object.entries(draft).map(([enrollmentId, grade]) => ({ enrollmentId, grade: grade || null }));
      await submitGrades(sectionId, grades, finalize);
      setMsg({ kind: "ok", text: finalize ? "Grades submitted for registrar approval." : "Draft saved." });
      load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Grade Entry</h1>
      <p className="muted" style={{ margin: "2px 0 22px", fontSize: 14 }}>
        Enter final grades and submit for registrar approval
      </p>

      {msg && (
        <p className="card" style={{ color: msg.kind === "ok" ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>
      )}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <>
          <CourseTabs sections={sections} value={sectionId} onChange={setSectionId} />

          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
                  {section ? courseTitle(section) : "—"}
                </h3>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
                  {section?.term} · final grades
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: STATUS_STYLE[status].bg,
                    color: STATUS_STYLE[status].fg,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "var(--radius-pill)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_STYLE[status].label}
                </span>
                {!locked && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(false)}>
                    Save draft
                  </Button>
                )}
                <Button variant="navy" disabled={!allGraded || locked || busy} onClick={() => save(true)}>
                  {SUBMIT_LABEL[status]}
                </Button>
              </div>
            </div>

            {status === "returned" && gb?.statusNote && (
              <p style={{ fontSize: 12.5, color: "#a3291b", marginBottom: 14 }}>
                Returned by the registrar: {gb.statusNote}
              </p>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "2px solid var(--border)",
                padding: "0 8px 8px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              <span style={{ flex: 1 }}>Student</span>
              <span style={{ width: 160, textAlign: "right" }}>Final grade</span>
            </div>

            {gb?.students.map((s) => (
              <div
                key={s.enrollmentId}
                className="sis-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "11px 8px",
                  borderBottom: "1px solid var(--divider)",
                  borderRadius: 8,
                }}
              >
                <Avatar name={s.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.studentNo}</div>
                </div>
                <div style={{ width: 160, display: "flex", justifyContent: "flex-end" }}>
                  <select
                    value={draft[s.enrollmentId] ?? ""}
                    disabled={locked}
                    onChange={(e) => setDraft({ ...draft, [s.enrollmentId]: e.target.value })}
                    style={{ width: 120 }}
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g || "—"}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            {gb && gb.students.length === 0 && <EmptyState title="No students enrolled in this section" />}
          </Card>
        </>
      )}
    </>
  );
}
