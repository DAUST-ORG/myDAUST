"use client";

import { useCallback, useEffect, useState } from "react";
import { type AcademicYearRow, activateAcademicYear, createAcademicYear, getAcademicYears } from "@/lib/api";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

export default function AcademicYearsPage() {
  const [rows, setRows] = useState<AcademicYearRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic years"
        subtitle="Catalogue years. Exactly one is active; activating another archives the current one."
        actions={<Button variant="primary" onClick={add} disabled={busy || !rows}>Add year</Button>}
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <EmptyState title="No academic years configured" />}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <table>
            <thead><tr><th>Year</th><th>Status</th><th style={{ textAlign: "right" }}>Terms</th><th /></tr></thead>
            <tbody>
              {rows.map((y) => (
                <tr key={y.id} className="sis-row">
                  <td style={{ fontWeight: 700 }}>{y.label}</td>
                  <td>
                    <Badge tone={y.status === "active" ? "success" : y.status === "draft" ? "warning" : "neutral"}>
                      {y.status}
                    </Badge>
                  </td>
                  <td style={{ textAlign: "right" }}>{y._count.terms}</td>
                  <td>
                    {y.status !== "active" && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => activate(y.id)}>
                        Make active
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
