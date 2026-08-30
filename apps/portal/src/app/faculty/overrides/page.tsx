"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  X,
} from "lucide-react";
import {
  type EnrollmentOverrideFailure,
  type EnrollmentOverrideGate,
  type FacultyOverrideRequest,
  type FacultyWaivableGate,
  FACULTY_WAIVABLE_GATES,
  facultyDecideOverride,
  facultyOverrideRequests,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Segmented,
} from "@/components/ui";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  stale: { label: "Stale", tone: "error" },
};

function gateLabel(gate: string): string {
  switch (gate) {
    case "prerequisite":
      return "Prerequisite";
    case "corequisite":
      return "Corequisite";
    case "capacity":
      return "Capacity";
    case "holds":
      return "Hold";
    case "credit_cap":
      return "Credit cap";
    case "standing":
      return "Standing";
    case "major_restriction":
      return "Major restriction";
    case "record_status":
      return "Record status";
    case "add_deadline":
      return "Add deadline";
    default:
      return gate;
  }
}

function gateDetail(f: EnrollmentOverrideFailure): string {
  switch (f.gate) {
    case "prerequisite":
      return f.courses
        .map((c) => `${c.code}${c.minGrade ? ` (min ${c.minGrade})` : ""}`)
        .join(", ");
    case "corequisite":
      return f.courses.join(", ");
    case "capacity":
      return `${f.taken}/${f.capacity} seats`;
    case "credit_cap":
      return `${f.afterAdd}/${f.ceiling} credits`;
    case "standing":
      return `Needs ${f.required}, has year ${f.actual}`;
    case "major_restriction":
      return `Restricted to ${f.required}`;
    case "record_status":
      return `Status: ${f.status}`;
    case "add_deadline":
      return `Closed ${f.closedOn}`;
    case "holds":
      return f.kinds.join(", ");
    default:
      return "";
  }
}

const isWaivable = (gate: string): gate is FacultyWaivableGate =>
  (FACULTY_WAIVABLE_GATES as readonly string[]).includes(gate);

export default function FacultyOverrides() {
  const [view, setView] = useState<"pending" | "history">("pending");
  const [rows, setRows] = useState<FacultyOverrideRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FacultyOverrideRequest | null>(null);
  const [waivedGates, setWaivedGates] = useState<EnrollmentOverrideGate[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    facultyOverrideRequests()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    return rows.filter((r) =>
      view === "pending" ? r.status === "pending" : r.status !== "pending",
    );
  }, [rows, view]);

  const counts = useMemo(
    () => ({
      pending: rows?.filter((r) => r.status === "pending").length ?? 0,
    }),
    [rows],
  );

  function openReview(req: FacultyOverrideRequest) {
    setSelected(req);
    const failures = req.afterJson?.failures ?? [];
    // Pre-check only waivable gates.
    setWaivedGates(
      failures.filter((f) => isWaivable(f.gate)).map((f) => f.gate),
    );
    setNote("");
    setResult(null);
  }

  async function submitDecision(waive: boolean) {
    if (!selected) return;
    if (waive && waivedGates.length === 0) {
      setResult("Pick at least one gate to waive.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      await facultyDecideOverride(selected.id, {
        waive,
        waivedGates: waive ? waivedGates : undefined,
        note: note.trim() || undefined,
      });
      setResult(
        waive ? "Override approved and student enrolled." : "Request rejected.",
      );
      setSelected(null);
      await load();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleGate(gate: EnrollmentOverrideGate) {
    setWaivedGates((prev) =>
      prev.includes(gate) ? prev.filter((g) => g !== gate) : [...prev, gate],
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="Override Requests"
        subtitle="Enrollment override requests from students in your sections."
      />

      {error && (
        <div
          className="card"
          style={{ color: "var(--error-500)", marginBottom: 14 }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{
            color: result.includes("approved") || result.includes("enrolled")
              ? "var(--success)"
              : "var(--danger)",
            marginBottom: 14,
          }}
        >
          {result}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Segmented
          value={view}
          onChange={(v) => setView(v as typeof view)}
          options={[
            {
              value: "pending",
              label: `Pending${counts.pending ? ` (${counts.pending})` : ""}`,
            },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      {filtered === null && <p className="muted">Loading requests...</p>}

      {filtered && filtered.length === 0 && (
        <EmptyState
          title={
            view === "pending" ? "No pending requests" : "No decision history"
          }
          note={
            view === "pending"
              ? "When students request overrides for your sections, they will appear here."
              : "Past override decisions will appear here."
          }
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered?.map((req) => {
          const meta = STATUS_META[req.status] ?? { label: req.status, tone: "neutral" as const };
          const failures = req.afterJson?.failures ?? [];
          const studentNo = req.requestedBy?.student?.studentNo ?? "";
          return (
            <article
              key={req.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 15,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <strong style={{ fontFamily: "var(--font-display)" }}>
                    {req.requestedBy
                      ? `${req.requestedBy.firstName} ${req.requestedBy.lastName}`
                      : "Unknown"}
                  </strong>
                  {studentNo && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {studentNo}
                    </span>
                  )}
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 13,
                    color: "var(--fg2)",
                  }}
                >
                  {req.reason}
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 5,
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  {failures.map((f) => (
                    <Badge
                      key={f.gate}
                      tone={isWaivable(f.gate) ? "neutral" : "error"}
                    >
                      {gateLabel(f.gate)}
                    </Badge>
                  ))}
                </div>
                <p
                  className="muted"
                  style={{ margin: "5px 0 0", fontSize: 11.5 }}
                >
                  {formatDate(req.createdAt)}
                </p>
              </div>
              <Button
                size="sm"
                icon={<Eye size={14} />}
                onClick={() => openReview(req)}
              >
                Review
              </Button>
            </article>
          );
        })}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Review override request"
        width={600}
        footer={
          selected?.status === "pending" ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Button
                variant="danger"
                icon={<X size={15} />}
                disabled={busy}
                onClick={() => submitDecision(false)}
              >
                {busy ? "Saving..." : "Reject"}
              </Button>
              <Button
                variant="primary"
                icon={<Check size={15} />}
                disabled={busy || waivedGates.length === 0}
                onClick={() => submitDecision(true)}
              >
                {busy ? "Saving..." : "Approve & enroll"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          )
        }
      >
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  background: "var(--bg-subtle)",
                  borderRadius: 4,
                  padding: 10,
                }}
              >
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Student
                </div>
                <div style={{ marginTop: 3, fontWeight: 700, fontSize: 13 }}>
                  {selected.requestedBy
                    ? `${selected.requestedBy.firstName} ${selected.requestedBy.lastName}`
                    : "Unknown"}
                  {selected.requestedBy?.student?.studentNo
                    ? ` (${selected.requestedBy.student.studentNo})`
                    : ""}
                </div>
              </div>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  borderRadius: 4,
                  padding: 10,
                }}
              >
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Submitted
                </div>
                <div style={{ marginTop: 3, fontWeight: 700, fontSize: 13 }}>
                  {formatDate(selected.createdAt)}
                </div>
              </div>
            </div>

            <div>
              <div
                className="muted"
                style={{
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Student reason
              </div>
              <p style={{ margin: 0, fontSize: 13.5 }}>{selected.reason}</p>
            </div>

            {selected.afterJson?.failures &&
              selected.afterJson.failures.length > 0 && (
                <div>
                  <div
                    className="muted"
                    style={{
                      fontSize: 11.5,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Gate failures — tick the gates you will waive
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {selected.afterJson.failures.map((f) => {
                      const waivable = isWaivable(f.gate);
                      const checked = waivedGates.includes(f.gate);
                      return (
                        <label
                          key={f.gate}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: "var(--radius-md)",
                            border: `1px solid ${checked ? "rgba(46,125,82,.4)" : "var(--border)"}`,
                            background: checked
                              ? "rgba(46,125,82,.06)"
                              : "var(--surface)",
                            cursor: waivable ? "pointer" : "default",
                            opacity: waivable ? 1 : 0.55,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!waivable || selected.status !== "pending"}
                            onChange={() => waivable && toggleGate(f.gate)}
                            style={{ marginTop: 2 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 13,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {gateLabel(f.gate)}
                              {!waivable && (
                                <Badge tone="error">
                                  Admin only
                                </Badge>
                              )}
                            </div>
                            <div
                              className="muted"
                              style={{ fontSize: 12, marginTop: 2 }}
                            >
                              {gateDetail(f)}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

            {selected.decisionNote && (
              <div
                style={{
                  borderLeft: "3px solid var(--daust-navy)",
                  paddingLeft: 12,
                }}
              >
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Decision note
                </div>
                <p style={{ margin: "4px 0 0" }}>{selected.decisionNote}</p>
              </div>
            )}

            {selected.status === "pending" && (
              <label style={{ fontSize: 12.5, color: "var(--fg3)" }}>
                Note (optional)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Optional note to the student..."
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "9px 11px",
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                  }}
                />
              </label>
            )}

            {result && (
              <p
                role="alert"
                style={{
                  color: result.includes("approved") || result.includes("enrolled")
                    ? "#1f6b42"
                    : "var(--danger)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {result}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
