"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { type GradeApprovalRow, decideGradeApproval, getGradeApprovals } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, Select } from "@/components/ui";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    getGradeApprovals().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        title="Grade approvals"
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
        <Card pad={false}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Course</th><th>Term</th><th>Instructor</th><th style={{ textAlign: "right" }}>Graded</th><th>Status</th><th>Submitted</th><th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const open = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className="sis-row">
                      <td>
                        <button
                          type="button"
                          aria-label={open ? "Collapse students" : "Expand students"}
                          aria-expanded={open}
                          onClick={() => toggle(r.id)}
                          className="sis-btn"
                          style={{ width: 28, height: 28, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", background: "transparent", border: "none", color: "var(--fg3)", cursor: "pointer" }}
                        >
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td><div style={{ fontWeight: 600 }}>{r.course}</div><div className="muted" style={{ fontSize: 12 }}>§{r.sectionCode}</div></td>
                      <td>{r.term}</td>
                      <td>{r.instructor ?? "—"}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.graded}/{r.students} graded</td>
                      <td>
                        <Badge tone={r.status === "approved" ? "success" : r.status === "submitted" ? "warning" : r.status === "returned" ? "error" : "neutral"}>
                          {STATUS_LABEL[r.status] ?? r.status}
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
                    {open && (
                      <tr>
                        <td />
                        <td colSpan={7} style={{ paddingTop: 4, paddingBottom: 14 }}>
                          {r.grades.length === 0 ? (
                            <span className="muted" style={{ fontSize: 12.5 }}>No students enrolled.</span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {r.grades.map((g) => (
                                <span
                                  key={g.name}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "4px 6px 4px 12px",
                                    borderRadius: "var(--radius-pill)",
                                    border: "1px solid var(--border)",
                                    background: "var(--surface)",
                                    fontSize: 12.5,
                                  }}
                                >
                                  {g.name}
                                  <Badge tone={g.grade ? "navy" : "neutral"}>{g.grade ?? "—"}</Badge>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
