"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { type StudentSuccess, getStudentSuccess, warnStudent } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader, Stat } from "@/components/ui";

export default function StudentSuccessPage() {
  const [data, setData] = useState<StudentSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getStudentSuccess().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function warn(studentId: string, reason: string) {
    setBusy(studentId);
    try { await warnStudent(studentId, reason); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not record the warning."); }
    finally { setBusy(null); }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Student success"
        subtitle="Students below the GPA or attendance threshold. Recomputed live from current grades and attendance."
      />

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <Stat label="Flagged" value={data.flagged.length} sub={`of ${data.total} students`} tone={data.flagged.length > 0 ? "var(--danger)" : "var(--success-500)"} icon={<AlertTriangle size={16} />} />
        <Stat label="GPA threshold" value={data.thresholds.minGpa.toFixed(2)} sub="below this is flagged" />
        <Stat label="Attendance threshold" value={`${data.thresholds.minAttendance}%`} sub="below this is flagged" />
      </div>

      {data.flagged.length === 0 ? (
        <EmptyState title="No students currently flagged" note="Everyone is above both thresholds." />
      ) : (
        <Card pad={false}>
          <table>
            <thead>
              <tr><th>Student</th><th>Programme</th><th style={{ textAlign: "right" }}>GPA</th><th style={{ textAlign: "right" }}>Attendance</th><th>Why</th><th /></tr>
            </thead>
            <tbody>
              {data.flagged.map((r) => (
                <tr key={r.studentId} className="sis-row">
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.studentNo}</div>
                  </td>
                  <td>{r.program ?? "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.gpa.toFixed(2)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.attendance === null ? <span className="muted">—</span> : `${r.attendance}%`}
                  </td>
                  <td>
                    {r.flags.map((f) => (
                      <div key={f} style={{ fontSize: 12 }}><Badge tone="warning">{f}</Badge></div>
                    ))}
                  </td>
                  <td>
                    {r.lastWarnedAt ? (
                      <span className="muted" style={{ fontSize: 12 }}>Warned {formatDate(r.lastWarnedAt)}</span>
                    ) : (
                      <Button
                        size="sm"
                        icon={<BellRing size={12} />}
                        disabled={busy === r.studentId}
                        onClick={() => warn(r.studentId, r.flags.join("; "))}
                      >
                        {busy === r.studentId ? "Sending…" : "Warn"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
