"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  type MySummary,
  type TranscriptView,
  getMyTranscriptPdf,
  getMyTranscriptView,
  getMySummary,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui";

/** A-range green, B-range navy, C-range amber, everything else neutral. */
function gradeTone(grade: string | null): { bg: string; fg: string } {
  const head = (grade ?? "").charAt(0).toUpperCase();
  if (head === "A") return { bg: "rgba(46,125,82,.12)", fg: "#1f6b42" };
  if (head === "B") return { bg: "rgba(29,74,130,.12)", fg: "#1d4a82" };
  if (head === "C") return { bg: "rgba(237,132,37,.14)", fg: "#a85f16" };
  return { bg: "var(--bg-subtle)", fg: "var(--fg3)" };
}

export default function GradesPage() {
  const [transcript, setTranscript] = useState<TranscriptView | null>(null);
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getMyTranscriptView()
      .then(setTranscript)
      .catch((err: Error) => setError(err.message));
    getMySummary()
      .then(setSummary)
      .catch(() => {});
  }, []);

  async function downloadTranscript() {
    if (!transcript) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await getMyTranscriptPdf();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `unofficial-transcript-${transcript.student.studentNo.replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The transcript could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Grades & Transcript"
        subtitle={`Unofficial academic record${transcript?.student.program ? ` · ${transcript.student.program.code} — ${transcript.student.program.name}` : ""}`}
        actions={
          <Button
            variant="secondary"
            icon={<Download size={15} aria-hidden="true" />}
            disabled={!transcript || downloading}
            onClick={() => void downloadTranscript()}
          >
            {downloading ? "Generating…" : "Download unofficial transcript"}
          </Button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat
          label="Cumulative GPA"
          value={transcript?.totals.gpa?.toFixed(2) ?? "—"}
          sub={transcript?.academicStanding.label ?? "Academic standing"}
          tone="var(--daust-navy)"
        />
        <Stat
          label="Credits earned"
          value={
            transcript
              ? `${transcript.totals.earnedCredits}${transcript.academicProgress.requiredCredits ? ` / ${transcript.academicProgress.requiredCredits}` : ""}`
              : "—"
          }
          sub={
            transcript?.academicProgress.requiredCredits
              ? "earned / programme total"
              : "programme requirements not configured"
          }
        />
        <Stat
          label="Credits in progress"
          value={summary?.credits ?? "—"}
          tone="var(--daust-orange)"
        />
        <Stat
          label="Academic level"
          value={transcript?.academicProgress.level?.code ?? "—"}
          sub={
            transcript?.academicProgress.level?.name ?? "earned-credit level"
          }
          tone="var(--daust-navy)"
        />
      </div>

      {error && (
        <Card>
          <div role="alert" style={{ color: "var(--error-500)" }}>
            {error}
          </div>
        </Card>
      )}

      {transcript && transcript.inProgressCourses.length > 0 && (
        <Card
          title="Courses in progress"
          action={
            <Badge tone="info">
              {transcript.academicProgress.inProgressCredits} credits
            </Badge>
          }
        >
          <div style={{ display: "grid", gap: 0 }}>
            {transcript.inProgressCourses.map((course, index) => (
              <div
                key={course.enrollmentId}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "82px minmax(150px, 1fr) minmax(130px, auto) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: index ? "1px solid var(--divider)" : undefined,
                  fontSize: 12.5,
                }}
              >
                <strong>{course.courseCode}</strong>
                <span>{course.title}</span>
                <span className="muted">
                  {course.term} · {course.sectionCode}
                </span>
                <Badge tone="info">{course.credits} cr · In progress</Badge>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
            In-progress credits do not affect GPA or academic level until the
            registrar approves the final grade.
          </p>
        </Card>
      )}

      {transcript && transcript.semesters.length === 0 ? (
        <EmptyState
          title="No graded courses yet"
          note="Grades appear here after the registrar approves the final results."
        />
      ) : transcript ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {transcript.semesters.map((semester) => (
            <Card key={semester.termId ?? semester.label} pad={false}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "14px 18px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {semester.label}
                </h3>
                <div
                  className="muted"
                  style={{ fontSize: 12.5, display: "flex", gap: 16 }}
                >
                  <span>
                    Semester GPA{" "}
                    <strong style={{ color: "var(--fg1)" }}>
                      {semester.gpa === null ? "—" : semester.gpa.toFixed(2)}
                    </strong>
                  </span>
                  <span>{semester.attemptedCredits} attempted</span>
                  <span>{semester.earnedCredits} earned</span>
                </div>
              </div>

              <div>
                {semester.entries.map((r, i) => {
                  const tone = gradeTone(r.grade);
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "11px 18px",
                        borderBottom:
                          i < semester.entries.length - 1
                            ? "1px solid var(--divider)"
                            : undefined,
                      }}
                    >
                      <span
                        style={{
                          width: 78,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--fg2)",
                        }}
                      >
                        {r.courseCode}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                        {r.title}
                      </span>
                      <span
                        className="muted"
                        style={{
                          width: 56,
                          textAlign: "center",
                          fontSize: 12.5,
                        }}
                      >
                        {r.credits} cr
                      </span>
                      <span
                        style={{
                          minWidth: 42,
                          textAlign: "center",
                          padding: "3px 10px",
                          borderRadius: "var(--radius-pill)",
                          fontSize: 12,
                          fontWeight: 700,
                          background: tone.bg,
                          color: tone.fg,
                        }}
                      >
                        {r.grade}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : !error ? (
        <Card>
          <p className="muted" role="status" style={{ margin: 0 }}>
            Loading transcript…
          </p>
        </Card>
      ) : null}
    </>
  );
}
