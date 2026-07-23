"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Star, StarOff, X } from "lucide-react";
import {
  type FlaggedStudent,
  type StudentSuccess,
  type WarningRow,
  type WatchedStudent,
  getStudentSuccess,
  getWarnings,
  getWatching,
  unwatchStudent,
  warnStudent,
  watchStudent,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, Button, Card, EmptyState, IconButton, PageHeader, SearchInput, Select, Stat } from "@/components/ui";

/** Below the flagging threshold is a warning; these are the harder "at risk" cut-offs. */
const CRITICAL_GPA = 2;
const HEALTHY_ATTENDANCE = 85;

type LevelFilter = "all" | "critical" | "warning";

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

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function LevelBadge({ level }: { level: FlaggedStudent["level"] }) {
  return level === "critical" ? <Badge tone="error">At risk</Badge> : <Badge tone="warning">Watch</Badge>;
}

export default function StudentSuccessPage() {
  const [data, setData] = useState<StudentSuccess | null>(null);
  const [watching, setWatching] = useState<WatchedStudent[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");

  const load = useCallback(() => {
    getStudentSuccess().then(setData).catch((e: Error) => setError(e.message));
    getWatching().then(setWatching).catch((e: Error) => setError(e.message));
    getWarnings().then(setWarnings).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const unwarned = useMemo(() => (data?.flagged ?? []).filter((r) => !r.lastWarnedAt), [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.flagged ?? []).filter((r) => {
      if (level !== "all" && r.level !== level) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle) || r.studentNo.toLowerCase().includes(needle);
    });
  }, [data, q, level]);

  async function warn(studentId: string, reason: string, lvl: FlaggedStudent["level"]) {
    setBusy(studentId);
    try { await warnStudent(studentId, reason, lvl); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not record the warning."); }
    finally { setBusy(null); }
  }

  async function warnAll() {
    setBulkBusy(true);
    try {
      for (const r of unwarned) await warnStudent(r.studentId, r.flags.join("; "), r.level);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send all warnings.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleWatch(r: FlaggedStudent) {
    setBusy(r.studentId);
    try { await (r.watching ? unwatchStudent(r.studentId) : watchStudent(r.studentId)); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update the follow list."); }
    finally { setBusy(null); }
  }

  async function unfollow(studentId: string) {
    setBusy(studentId);
    try { await unwatchStudent(studentId); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update the follow list."); }
    finally { setBusy(null); }
  }

  const flaggedById = useMemo(
    () => new Map((data?.flagged ?? []).map((f) => [f.studentId, f])),
    [data],
  );

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
        <Stat label="Total students" value={data.total} sub="monitored" />
        <Stat label="At risk" value={data.atRisk} sub="critical flags" tone="var(--danger)" />
        <Stat label="Watch list" value={data.watch} sub="early warning" tone="var(--warning-500)" />
        <Stat label="Warnings sent" value={data.warningsSent} sub="this term" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}>Flagged students</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SearchInput value={q} onChange={setQ} placeholder="Filter students…" width={260} />
          <Select
            value={level}
            onChange={(v) => setLevel(v as LevelFilter)}
            options={[
              { value: "all", label: "All levels" },
              { value: "critical", label: "At risk" },
              { value: "warning", label: "Watch" },
            ]}
          />
        </div>
      </div>

      {data.flagged.length === 0 ? (
        <EmptyState title="No students currently flagged" note="Everyone is above both thresholds." />
      ) : (
        <Card pad={false}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th style={{ textAlign: "right" }}>GPA</th>
                <th style={{ textAlign: "right" }}>Attend.</th>
                <th>Flags</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId} className="sis-row">
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.program ?? r.studentNo}</div>
                  </td>
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
                    <LevelBadge level={r.level} />
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.flags.join(" · ")}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      {r.lastWarnedAt ? (
                        <span className="muted" style={{ fontSize: 12 }}>Warned {formatDate(r.lastWarnedAt)}</span>
                      ) : (
                        <Button
                          size="sm"
                          icon={<BellRing size={12} />}
                          disabled={busy === r.studentId || bulkBusy}
                          onClick={() => warn(r.studentId, r.flags.join("; "), r.level)}
                        >
                          {busy === r.studentId ? "Sending…" : "Send warning"}
                        </Button>
                      )}
                      <IconButton
                        label={r.watching ? "Unfollow student" : "Follow student"}
                        disabled={busy === r.studentId}
                        onClick={() => toggleWatch(r)}
                      >
                        {r.watching ? <Star size={16} fill="var(--warning-500)" color="var(--warning-500)" /> : <StarOff size={16} />}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 32 }}>No students match.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Star size={16} /> Following</span>}>
          {watching.length === 0 ? (
            <EmptyState title="Not following anyone yet" note="Star a flagged student to follow their progress here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {watching.map((w) => {
                const f = flaggedById.get(w.studentId);
                const sub = f
                  ? `GPA ${f.gpa.toFixed(2)} · ${f.attendance === null ? "—" : `${f.attendance}%`} · ${f.flags.join(" · ")}`
                  : "No active flags";
                return (
                  <div key={w.studentId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={w.name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{w.name}</div>
                      <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
                    </div>
                    {f && <LevelBadge level={f.level} />}
                    <IconButton label="Unfollow student" disabled={busy === w.studentId} onClick={() => unfollow(w.studentId)}>
                      <X size={15} />
                    </IconButton>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><BellRing size={16} /> Warnings sent</span>}>
          {warnings.length === 0 ? (
            <EmptyState title="No warnings sent yet" note="Send manually or use auto-send." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {warnings.map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{w.name}</span>
                      <Badge tone={w.level === "critical" ? "error" : "warning"}>{w.level === "critical" ? "At risk" : "Watch"}</Badge>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{w.reason}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{relativeTime(w.warnedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
