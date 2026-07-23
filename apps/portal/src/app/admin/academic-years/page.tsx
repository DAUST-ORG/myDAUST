"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { type AcademicYearRow, activateAcademicYear, createAcademicYear, getAcademicYears } from "@/lib/api";
import { Badge, Button, EmptyState, PageHeader, Select } from "@/components/ui";

const STATUS_LABEL: Record<AcademicYearRow["status"], string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};
const STATUS_SUB: Record<AcademicYearRow["status"], string> = {
  active: "Current catalog year",
  draft: "Planning · not yet active",
  archived: "Closed catalog",
};

export default function AcademicYearsPage() {
  const [rows, setRows] = useState<AcademicYearRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusF, setStatusF] = useState("all");

  const load = useCallback(() => {
    getAcademicYears().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  /** Next year label follows the existing convention, e.g. 2026-2027 -> 2027-2028. */
  function nextLabel(): string {
    const last = rows?.[rows.length - 1]?.label ?? "";
    const m = /(\d{4}).*?(\d{4})/.exec(last);
    return m ? `${Number(m[1]) + 1}–${Number(m[2]) + 1}` : "New year";
  }

  async function add() {
    setBusy(true);
    try { await createAcademicYear(nextLabel()); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not add the year."); }
    finally { setBusy(false); }
  }

  async function activate(id: string) {
    setBusy(true);
    try { await activateAcademicYear(id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not activate the year."); }
    finally { setBusy(false); }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const visible = (rows ?? []).filter((y) => statusF === "all" || y.status === statusF);

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic Years"
        subtitle="Catalog years governing curriculum, admissions and requirements."
        actions={
          <>
            <Select
              value={statusF}
              onChange={setStatusF}
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <Button variant="primary" onClick={add} disabled={busy || !rows}>Add academic year</Button>
          </>
        }
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <EmptyState title="No academic years configured" />}
      {rows && rows.length > 0 && visible.length === 0 && <EmptyState title="No academic years match" />}

      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 660 }}>
          {visible.map((y) => (
            <div key={y.id} className="card" style={{ margin: 0, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-tint)", color: "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CalendarClock size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{y.label}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{STATUS_SUB[y.status]} · {y._count.terms} term{y._count.terms === 1 ? "" : "s"}</div>
              </div>
              <Badge tone={y.status === "active" ? "success" : y.status === "draft" ? "warning" : "neutral"}>
                {STATUS_LABEL[y.status]}
              </Badge>
              {y.status !== "active" && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => activate(y.id)}>Set active</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
