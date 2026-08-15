"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type TranscriptView, getMyTranscriptView } from "@/lib/api";

export default function TranscriptPage() {
  const [transcript, setTranscript] = useState<TranscriptView | null>(null);

  useEffect(() => {
    getMyTranscriptView()
      .then(setTranscript)
      .catch(() => {});
  }, []);

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } .doc-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; } body { background: #fff !important; } }`}</style>

      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Link href="/student/documents" className="eyebrow">
          ← Documents
        </Link>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div
        className="doc-sheet card"
        style={{ maxWidth: 820, margin: "0 auto", padding: 40 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "2px solid var(--daust-navy)",
            paddingBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 26,
                color: "var(--daust-navy)",
                letterSpacing: ".04em",
              }}
            >
              DAUST
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Dakar American University of Science & Technology
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              Unofficial Academic Record
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Generated {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, margin: "20px 0" }}>
          <div>
            <div
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Student
            </div>
            <div style={{ fontWeight: 600 }}>
              {transcript?.student.name ?? "—"}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {transcript?.student.email}
            </div>
          </div>
          <div>
            <div
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Cumulative GPA
            </div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: "var(--font-display)",
                fontSize: 20,
              }}
            >
              {transcript?.totals.gpa?.toFixed(2) ?? "—"}
            </div>
          </div>
          <div>
            <div
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Credits earned
            </div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: "var(--font-display)",
                fontSize: 20,
              }}
            >
              {transcript?.totals.earnedCredits ?? 0}
              {transcript?.academicProgress.requiredCredits
                ? ` / ${transcript.academicProgress.requiredCredits}`
                : ""}
            </div>
          </div>
          <div>
            <div
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Academic level
            </div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: "var(--font-display)",
                fontSize: 20,
              }}
            >
              {transcript?.academicProgress.level?.code ?? "—"}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Term</th>
              <th>Credits</th>
              <th>Grade</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {transcript?.semesters.flatMap((semester) =>
              semester.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.courseCode}</strong> — {entry.title}
                  </td>
                  <td>{entry.term}</td>
                  <td>{entry.credits}</td>
                  <td>{entry.grade}</td>
                  <td>{entry.points?.toFixed(1) ?? "—"}</td>
                </tr>
              )),
            )}
            {transcript?.semesters.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No completed courses on record.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {transcript && transcript.inProgressCourses.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>
              Courses in progress
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Term</th>
                  <th>Credits</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transcript.inProgressCourses.map((course) => (
                  <tr key={course.enrollmentId}>
                    <td>
                      <strong>{course.courseCode}</strong> — {course.title}
                    </td>
                    <td>{course.term}</td>
                    <td>{course.credits}</td>
                    <td>In progress</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="muted"
          style={{
            fontSize: 11,
            marginTop: 28,
            borderTop: "1px solid var(--divider)",
            paddingTop: 12,
          }}
        >
          This student-generated copy is not an official transcript. Request an
          official sealed copy from the Office of the Registrar.
        </div>
      </div>
    </>
  );
}
