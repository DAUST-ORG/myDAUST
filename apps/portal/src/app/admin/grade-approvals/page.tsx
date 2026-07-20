"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { type GradeApprovalRow, decideGradeApproval, getGradeApprovals } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

export default function GradeApprovalsPage() {
  const [rows, setRows] = useState<GradeApprovalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getGradeApprovals().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, decision: "approved" | "returned") {
    setBusy(id);
    try { await decideGradeApproval(id, decision); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not record the decision."); }
    finally { setBusy(null); }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const pending = rows?.filter((r) => r.status === "submitted") ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Grade approvals"
        subtitle="Faculty submit a section's final grades; they count toward a transcript only once approved here."
        actions={pending.length > 0 ? <Badge tone="warning">{pending.length} awaiting approval</Badge> : undefined}
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState title="Nothing submitted yet" note="Sections appear here once an instructor submits their grades." />
      )}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr><th>Course</th><th>Term</th><th>Instructor</th><th style={{ textAlign: "right" }}>Students</th><th>Status</th><th>Submitted</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="sis-row">
                  <td><div style={{ fontWeight: 600 }}>{r.course}</div><div className="muted" style={{ fontSize: 12 }}>§{r.sectionCode}</div></td>
                  <td>{r.term}</td>
                  <td>{r.instructor ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.students}</td>
                  <td>
                    <Badge tone={r.status === "approved" ? "success" : r.status === "submitted" ? "warning" : r.status === "returned" ? "error" : "neutral"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td>{r.submittedAt ? formatDate(r.submittedAt) : <span className="muted">—</span>}</td>
                  <td>
                    {r.status === "submitted" && (
                      <span style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" variant="navy" icon={<Check size={12} />} disabled={busy === r.id} onClick={() => decide(r.id, "approved")}>Approve</Button>
                        <Button size="sm" icon={<Undo2 size={12} />} disabled={busy === r.id} onClick={() => decide(r.id, "returned")}>Return</Button>
                      </span>
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
