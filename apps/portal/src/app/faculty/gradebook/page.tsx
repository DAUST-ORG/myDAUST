"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Plus, SlidersHorizontal } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, Select } from "@/components/ui";
import { CourseTabs } from "../CourseTabs";
import {
  type SectionAssignment,
  type TeachingSection,
  createAssignment,
  getAssignmentSubmissions,
  getSectionAssignments,
  getTeaching,
  gradeSubmission,
} from "@/lib/api";
import { getFacultyGradebook } from "@/lib/api-faculty";

/** Assignment types the API accepts, labelled with the design's category names. */
const CATEGORIES = [
  { value: "quiz", label: "Quiz", color: "#1d4a82" },
  { value: "homework", label: "Assignment", color: "#2e7d52" },
  { value: "exam", label: "Exam", color: "#a3291b" },
  { value: "project", label: "Project", color: "#ed8425" },
] as const;

function category(type: string): { label: string; color: string } {
  return CATEGORIES.find((c) => c.value === type) ?? { label: type, color: "var(--daust-steel)" };
}

function letterFor(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 85) return "A-";
  if (pct >= 80) return "B+";
  if (pct >= 75) return "B";
  if (pct >= 70) return "B-";
  if (pct >= 65) return "C+";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function totalTone(pct: number): string {
  if (pct >= 70) return "var(--success-500)";
  if (pct >= 60) return "var(--warning-500)";
  return "var(--error-500)";
}

interface Student {
  enrollmentId: string;
  name: string;
  studentNo: string;
}

/** score + submissionId per assignment, per enrollment. */
type ScoreCell = { submissionId: string | null; score: number | null };
type ScoreMap = Record<string, Record<string, ScoreCell>>;

const BLANK_ITEM = { title: "", type: "quiz", weight: "10", maxPoints: "20", dueDate: "" };

export default function FacultyGradebook() {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [columns, setColumns] = useState<SectionAssignment[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [showCols, setShowCols] = useState(false);
  const [newItem, setNewItem] = useState(BLANK_ITEM);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setMsg(e.message));
  }, []);

  const load = useCallback(() => {
    if (!sectionId) return;
    Promise.all([getFacultyGradebook(sectionId), getSectionAssignments(sectionId)])
      .then(async ([gb, sa]) => {
        setStudents(gb.students.map((s) => ({ enrollmentId: s.enrollmentId, name: s.name, studentNo: s.studentNo })));
        setColumns(sa.assignments);
        const sheets = await Promise.all(sa.assignments.map((a) => getAssignmentSubmissions(a.id)));
        const next: ScoreMap = {};
        sheets.forEach((sheet, i) => {
          const assignmentId = sa.assignments[i]!.id;
          next[assignmentId] = Object.fromEntries(
            sheet.submissions.map((s) => [s.enrollmentId, { submissionId: s.submissionId, score: s.score }]),
          );
        });
        setScores(next);
      })
      .catch((e: Error) => setMsg(e.message));
  }, [sectionId]);
  useEffect(load, [load]);

  const weightTotal = columns.reduce((sum, c) => sum + c.weight, 0);

  async function saveScore(assignmentId: string, enrollmentId: string, raw: string) {
    const cell = scores[assignmentId]?.[enrollmentId];
    if (!cell?.submissionId) return;
    const score = raw === "" ? null : Number(raw);
    if (score === null || Number.isNaN(score)) return;
    setMsg(null);
    try {
      await gradeSubmission(cell.submissionId, score);
      setScores((prev) => ({
        ...prev,
        [assignmentId]: { ...prev[assignmentId], [enrollmentId]: { ...cell, score } },
      }));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function addColumn() {
    if (!newItem.title || !newItem.dueDate) {
      setMsg("An assessment item needs a name and a due date.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await createAssignment(sectionId, {
        title: newItem.title,
        type: newItem.type,
        maxPoints: Number(newItem.maxPoints) || 100,
        weight: Number(newItem.weight) || 0,
        dueDate: new Date(newItem.dueDate).toISOString(),
      });
      setNewItem(BLANK_ITEM);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Weighted total re-normalises over graded items only: a student with just the
   * midterm entered shows their midterm percentage, not a fraction of 100.
   */
  function rowTotal(enrollmentId: string): { pct: number | null; letter: string } {
    let weighted = 0;
    let weightSum = 0;
    for (const col of columns) {
      const score = scores[col.id]?.[enrollmentId]?.score;
      if (score === null || score === undefined || col.maxPoints === 0) continue;
      weighted += (score / col.maxPoints) * col.weight;
      weightSum += col.weight;
    }
    if (weightSum === 0) return { pct: null, letter: "—" };
    const pct = Math.round((weighted / weightSum) * 100);
    return { pct, letter: letterFor(pct) };
  }

  return (
    <>
      <h1 className="page-title">Gradebook</h1>
      <p className="muted" style={{ margin: "2px 0 22px", fontSize: 14 }}>
        Continuous assessment · quizzes, assignments, exams and projects · weighted totals compute automatically
      </p>

      {msg && <p className="card" style={{ color: "var(--danger)" }}>{msg}</p>}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <>
          <CourseTabs sections={sections} value={sectionId} onChange={setSectionId} />

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <span key={c.value} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color }} />
                  {c.label}
                </span>
              ))}
            </div>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 12.5,
                fontWeight: 600,
                color: weightTotal === 100 ? "var(--success-500)" : "var(--daust-orange)",
              }}
            >
              Total weight: {weightTotal}%
            </span>
            <Button variant="navy" size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => setShowCols(true)}>
              Manage columns
            </Button>
          </div>

          <Card>
            {columns.length === 0 ? (
              <EmptyState
                title="No assessment items yet"
                note="Add quizzes, assignments, exams or projects to start recording continuous assessment."
                action={<Button variant="navy" icon={<Plus size={14} />} onClick={() => setShowCols(true)}>Add assessment item</Button>}
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 720 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      borderBottom: "2px solid var(--border)",
                      paddingBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 180,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: "var(--fg-faint)",
                      }}
                    >
                      Student
                    </span>
                    {columns.map((c) => {
                      const cat = category(c.type);
                      return (
                        <span key={c.id} style={{ width: 104, textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
                            {c.title}
                          </span>
                          <span style={{ display: "block", fontSize: 10, color: "var(--fg-faint)", marginTop: 2 }}>
                            {cat.label} · {c.weight}% · /{c.maxPoints}
                          </span>
                        </span>
                      );
                    })}
                    <span
                      style={{
                        width: 96,
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: "var(--daust-navy)",
                      }}
                    >
                      Total
                    </span>
                  </div>

                  {students.map((s) => {
                    const { pct, letter } = rowTotal(s.enrollmentId);
                    return (
                      <div
                        key={s.enrollmentId}
                        className="sis-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid var(--divider)",
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 12 }}>
                          <Avatar name={s.name} size={32} />
                          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                        </span>
                        {columns.map((c) => {
                          const cell = scores[c.id]?.[s.enrollmentId];
                          const gradable = !!cell?.submissionId;
                          return (
                            <span key={c.id} style={{ width: 104, textAlign: "center" }}>
                              <input
                                type="number"
                                defaultValue={cell?.score ?? ""}
                                disabled={!gradable}
                                title={gradable ? undefined : "This student has not submitted yet, so there is no submission to score."}
                                onBlur={(e) => saveScore(c.id, s.enrollmentId, e.target.value)}
                                style={{
                                  width: 64,
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border)",
                                  background: gradable ? "var(--surface)" : "var(--surface-2)",
                                  fontSize: 13,
                                }}
                              />
                            </span>
                          );
                        })}
                        <span style={{ width: 96, textAlign: "center" }}>
                          <span
                            style={{
                              display: "block",
                              fontFamily: "var(--font-display)",
                              fontWeight: 800,
                              fontSize: 15,
                              color: pct === null ? "var(--fg-faint)" : totalTone(pct),
                            }}
                          >
                            {pct === null ? "—" : `${pct}%`}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--fg3)" }}>{letter}</span>
                        </span>
                      </div>
                    );
                  })}

                  {students.length === 0 && <EmptyState title="No students enrolled in this section" />}
                </div>
              </div>
            )}
          </Card>

          <p style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 12 }}>
            Weighted total = Σ (score ÷ max × weight) across entered items. Blank items are excluded until graded.
          </p>
        </>
      )}

      <Modal
        open={showCols}
        onClose={() => setShowCols(false)}
        width={680}
        title="Assessment categories"
        footer={<Button variant="navy" icon={<Check size={14} />} onClick={() => setShowCols(false)}>Done</Button>}
      >
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Add graded items and set each item&apos;s weight toward the final grade.
        </p>

        {columns.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderBottom: "1px solid var(--divider)",
            }}
          >
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{c.title}</span>
            <span style={{ width: 130, fontSize: 12.5, color: "var(--fg3)" }}>{category(c.type).label}</span>
            <span style={{ width: 78, textAlign: "center", fontSize: 12.5 }}>{c.weight}%</span>
            <span style={{ width: 70, textAlign: "center", fontSize: 12.5 }}>/{c.maxPoints}</span>
          </div>
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "16px 0" }}>
          <Field label="Item name">
            <Input value={newItem.title} onChange={(v) => setNewItem({ ...newItem, title: v })} placeholder="Midterm" />
          </Field>
          <Field label="Category">
            <Select
              value={newItem.type}
              onChange={(v) => setNewItem({ ...newItem, type: v })}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            />
          </Field>
          <Field label="Weight %">
            <Input value={newItem.weight} onChange={(v) => setNewItem({ ...newItem, weight: v })} type="number" />
          </Field>
          <Field label="Max points">
            <Input value={newItem.maxPoints} onChange={(v) => setNewItem({ ...newItem, maxPoints: v })} type="number" />
          </Field>
          <Field label="Due date">
            <Input value={newItem.dueDate} onChange={(v) => setNewItem({ ...newItem, dueDate: v })} type="date" />
          </Field>
        </div>

        <Button variant="secondary" icon={<Plus size={14} />} disabled={busy} onClick={addColumn} full>
          Add assessment item
        </Button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "12px 14px",
            borderRadius: 10,
            marginTop: 16,
            background: weightTotal === 100 ? "rgba(46,125,82,.10)" : "rgba(237,132,37,.12)",
            color: weightTotal === 100 ? "var(--success-500)" : "var(--daust-orange)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {weightTotal === 100 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          Total weight: {weightTotal}%{" "}
          {weightTotal === 100 ? "· weights balanced" : weightTotal < 100 ? "· should total 100%" : "· over 100%, reduce weights"}
        </div>
      </Modal>
    </>
  );
}
