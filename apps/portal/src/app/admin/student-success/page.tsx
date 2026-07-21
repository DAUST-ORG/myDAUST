"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { type StudentSuccess, getStudentSuccess, warnStudent } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, Stat } from "@/components/ui";

/** Below the flagging threshold is a warning; these are the harder "at risk" cut-offs. */
const CRITICAL_GPA = 2;
const HEALTHY_ATTENDANCE = 85;

function gpaColor(gpa: number, minGpa: number): string {
  if (gpa < CRITICAL_GPA) return "var(--danger)";
  if (gpa < minGpa) return "var(--warning-500)";
  return "var(--fg1)";
}

function attendanceColor(attendance: number, minAttendance: number): string {
  if (attendance < minAttendance) return "var(--danger)";
  if (attendance < HEALTHY_ATTENDANCE) return "var(--warning-500)";
  return "var(--success-500)";
}

export default function StudentSuccessPage() {
  const [data, setData] = useState<StudentSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    getStudentSuccess().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const unwarned = useMemo(() => (data?.flagged ?? []).filter((r) => !r.lastWarnedAt), [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data?.flagged ?? [];
    return (data?.flagged ?? []).filter(
      (r) => r.name.toLowerCase().includes(needle) || r.studentNo.toLowerCase().includes(needle),
    );
  }, [data, q]);

  async function warn(studentId: string, reason: string) {
    setBusy(studentId);
    try { await warnStudent(studentId, reason); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not record the warning."); }
    finally { setBusy(null); }
  }

  async function warnAll() {
    setBulkBusy(true);
    try {
      for (const r of unwarned) await warnStudent(r.studentId, r.flags.join("; "));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send all warnings.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Student success"
        subtitle={`Early-alert monitoring · flags at GPA < ${data.thresholds.minGpa.toFixed(2)} or attendance < ${data.thresholds.minAttendance}%`}
        actions={
          <Button
            variant="primary"
            icon={<BellRing size={14} />}
            disabled={bulkBusy || unwarned.length === 0}
            onClick={warnAll}
          >
            {bulkBusy ? "Sending…" : `Auto-send warnings (${unwarned.length})`}
          </Button>
        }
      />

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <Stat label="Flagged" value={data.flagged.length} sub={`of ${data.total} students`} tone={data.flagged.length > 0 ? "var(--danger)" : "var(--success-500)"} icon={<AlertTriangle size={16} />} />
        <Stat label="GPA threshold" value={data.thresholds.minGpa.toFixed(2)} sub="below this is flagged" />
        <Stat label="Attendance threshold" value={`${data.thresholds.minAttendance}%`} sub="below this is flagged" />
      </div>

      {data.flagged.length === 0 ? (
        <EmptyState title="No students currently flagged" note="Everyone is above both thresholds." />
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Filter students…" width={280} />
          </div>

          <Card pad={false}>
            <table>
              <thead>
                <tr><th>Student</th><th>Programme</th><th style={{ textAlign: "right" }}>GPA</th><th style={{ textAlign: "right" }}>Attend.</th><th>Flags</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="sis-row">
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.studentNo}</div>
                    </td>
                    <td>{r.program ?? "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: gpaColor(r.gpa, data.thresholds.minGpa) }}>
                      {r.gpa.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {r.attendance === null ? (
                        <span className="muted" style={{ fontWeight: 400 }}>—</span>
                      ) : (
                        <span style={{ color: attendanceColor(r.attendance, data.thresholds.minAttendance) }}>{r.attendance}%</span>
                      )}
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
                          disabled={busy === r.studentId || bulkBusy}
                          onClick={() => warn(r.studentId, r.flags.join("; "))}
                        >
                          {busy === r.studentId ? "Sending…" : "Send warning"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 32 }}>No students match.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
