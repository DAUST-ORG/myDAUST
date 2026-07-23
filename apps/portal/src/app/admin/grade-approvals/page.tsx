"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { type GradeApprovalRow, decideGradeApproval, getGradeApprovals } from "@/lib/api";
import { Badge, EmptyState, PageHeader, SearchInput, Select } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  returned: "Returned",
};

export default function GradeApprovalsPage() {
  const [rows, setRows] = useState<GradeApprovalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");

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
  const needle = q.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) =>
      (statusF === "all" || r.status === statusF) &&
      (!needle || r.course.toLowerCase().includes(needle) || r.sectionCode.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Grade Approvals"
        subtitle={`${pending.length} submission(s) awaiting approval`}
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Filter by course…" width={240} />
            <Select
              value={statusF}
              onChange={setStatusF}
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "submitted", label: "Submitted" },
                { value: "approved", label: "Approved" },
                { value: "returned", label: "Returned" },
              ]}
            />
          </>
        }
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState title="Nothing submitted yet" note="Sections appear here once an instructor submits their grades." />
      )}
      {rows && rows.length > 0 && visible.length === 0 && <EmptyState title="No submissions match" />}

      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((r) => (
            <div key={r.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: "var(--daust-navy)" }}>{r.course} · §{r.sectionCode}</span>
                <Badge tone={r.status === "approved" ? "success" : r.status === "submitted" ? "warning" : r.status === "returned" ? "error" : "neutral"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.term}</span>
                <span style={{ flex: 1 }} />
                <span className="muted" style={{ fontSize: 12.5 }}>{r.instructor ?? "—"} · {r.graded}/{r.students} graded</span>
                {r.status === "submitted" && (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => decide(r.id, "returned")}
                      disabled={busy === r.id}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, background: "#fff", color: "#a3291b", border: "1px solid #f1c9c1", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      <Undo2 size={13} /> Return
                    </button>
                    <button
                      onClick={() => decide(r.id, "approved")}
                      disabled={busy === r.id}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, background: "var(--success-500, #1f9d55)", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      <Check size={13} /> Approve
                    </button>
                  </span>
                )}
              </div>
              <div style={{ borderTop: "1px solid var(--divider)", marginTop: 12, paddingTop: 12 }}>
                {r.grades.length === 0 ? (
                  <span className="muted" style={{ fontSize: 12.5 }}>No students enrolled.</span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {r.grades.map((g) => (
                      <span key={g.name} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 6px 4px 12px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12.5 }}>
                        {g.name}
                        <Badge tone={g.grade ? "navy" : "neutral"}>{g.grade ?? "—"}</Badge>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
