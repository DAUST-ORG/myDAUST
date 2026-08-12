"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Search, X } from "lucide-react";
import {
  type ApprovalRequestRow,
  approveApprovalRequest,
  cancelApprovalRequest,
  listApprovalRequests,
  rejectApprovalRequest,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Segmented,
} from "@/components/ui";

const KIND_LABEL: Record<ApprovalRequestRow["kind"], string> = {
  global_fee_schedule: "Global fee schedule",
  custom_charge: "Custom charge",
  charge_removal: "Charge removal",
  payment_plan: "Student payment plan",
  discount: "Discount",
  scholarship: "Scholarship",
};

const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "neutral",
  stale: "error",
} as const;

type FlatRow = {
  path: string;
  before: string;
  after: string;
  changed: boolean;
};

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (entry: unknown, path: string) => {
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      if (entry.length === 0) out.set(path || "value", "[]");
      return;
    }
    if (entry && typeof entry === "object") {
      const pairs = Object.entries(entry as Record<string, unknown>);
      pairs.forEach(([key, item]) =>
        visit(item, path ? `${path}.${key}` : key),
      );
      if (pairs.length === 0) out.set(path || "value", "{}");
      return;
    }
    out.set(
      path || "value",
      entry === null || entry === undefined ? "—" : String(entry),
    );
  };
  visit(value, prefix);
  return out;
}

function comparison(request: ApprovalRequestRow): FlatRow[] {
  const before = flatten(request.beforeJson);
  const after = flatten(request.afterJson);
  const normalize = (value: string) =>
    /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value)
      ? value.slice(0, 10)
      : value;

  // The stored "before" snapshot intentionally contains immutable database
  // metadata that is not part of the requested mutation. Compare only proposed
  // fields so an omitted id/timestamp is never presented as a deletion.
  return [...after.keys()]
    .sort()
    .map((path) => {
      const oldValue = normalize(before.get(path) ?? "—");
      const newValue = normalize(after.get(path) ?? "—");
      return {
        path,
        before: oldValue,
        after: newValue,
        changed: oldValue !== newValue,
      };
    })
    .filter((row) => row.changed);
}

export function ApprovalRequestList({
  mode,
}: {
  mode: "director" | "requester";
}) {
  const [view, setView] = useState<"pending" | "history" | "mine">(
    mode === "director" ? "pending" : "mine",
  );
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ApprovalRequestRow[] | null>(null);
  const [selected, setSelected] = useState<ApprovalRequestRow | null>(null);
  const [decision, setDecision] = useState<
    "approve" | "reject" | "cancel" | null
  >(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listApprovalRequests(view, search));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load approval requests.",
      );
    }
  }, [search, view]);

  useEffect(() => {
    const timer = window.setTimeout(load, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(
    () => ({
      pending: rows?.filter((row) => row.status === "pending").length ?? 0,
    }),
    [rows],
  );

  function start(next: "approve" | "reject" | "cancel") {
    setNote("");
    setError(null);
    setDecision(next);
  }

  async function submitDecision() {
    if (!selected || !decision) return;
    if (decision === "reject" && !note.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        decision === "approve"
          ? await approveApprovalRequest(selected.id, note.trim() || undefined)
          : decision === "reject"
            ? await rejectApprovalRequest(selected.id, note.trim())
            : await cancelApprovalRequest(
                selected.id,
                note.trim() || undefined,
              );
      const staleReason =
        "reason" in result && typeof result.reason === "string"
          ? result.reason
          : "The request is stale and was not applied.";
      setMessage(
        result.status === "stale" ? staleReason : `Request ${result.status}.`,
      );
      setDecision(null);
      setSelected(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the request.",
      );
    } finally {
      setBusy(false);
    }
  }

  const options =
    mode === "director"
      ? [
          {
            value: "pending",
            label: `Pending${counts.pending ? ` (${counts.pending})` : ""}`,
          },
          { value: "history", label: "Decision history" },
        ]
      : [
          { value: "mine", label: "All my requests" },
          { value: "pending", label: "Pending" },
          { value: "history", label: "History" },
        ];

  return (
    <>
      {message && (
        <div
          className="card"
          role="status"
          style={{ color: "var(--success)", marginBottom: 16 }}
        >
          {message}
        </div>
      )}
      {error && !decision && (
        <div
          className="card"
          role="alert"
          style={{ color: "var(--danger)", marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <Segmented
            value={view}
            onChange={(value) => setView(value as typeof view)}
            options={options}
          />
          <label
            style={{
              position: "relative",
              display: "block",
              flex: "0 1 300px",
            }}
          >
            <span
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
              }}
            >
              Search approval requests
            </span>
            <Search
              size={15}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 11,
                top: 11,
                color: "var(--fg3)",
              }}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search requests…"
              style={{ width: "100%", paddingLeft: 34 }}
            />
          </label>
        </div>

        {rows === null ? (
          <p className="muted" style={{ margin: 0 }}>
            Loading approval requests…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              view === "pending" ? "No pending requests" : "No approval history"
            }
            note={
              mode === "director"
                ? "Finance changes requiring administrator review will appear here."
                : "Changes you submit for administrator approval will appear here."
            }
          />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((request) => (
              <article
                key={request.id}
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
                    <strong>{KIND_LABEL[request.kind]}</strong>
                    <Badge tone={STATUS_TONE[request.status]}>
                      {request.status}
                    </Badge>
                  </div>
                  <p style={{ margin: "7px 0 0", fontSize: 13.5 }}>
                    {request.reason}
                  </p>
                  <p
                    className="muted"
                    style={{ margin: "5px 0 0", fontSize: 12 }}
                  >
                    {request.requester?.name ??
                      request.requester?.email ??
                      "Unknown requester"}{" "}
                    · {formatDate(request.createdAt)}
                    {request.academicYearLabel
                      ? ` · ${request.academicYearLabel}`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<Eye size={14} />}
                  onClick={() => setSelected(request)}
                >
                  Review
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={selected !== null && decision === null}
        onClose={() => setSelected(null)}
        title={selected ? KIND_LABEL[selected.kind] : "Approval request"}
        width={760}
        footer={
          selected ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
              {selected.status === "pending" && mode === "requester" && (
                <Button variant="danger" onClick={() => start("cancel")}>
                  Cancel request
                </Button>
              )}
              {selected.status === "pending" && mode === "director" && (
                <>
                  <Button
                    variant="danger"
                    icon={<X size={15} />}
                    onClick={() => start("reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    icon={<Check size={15} />}
                    onClick={() => start("approve")}
                  >
                    Approve &amp; apply
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      >
        {selected && <RequestDetails request={selected} />}
      </Modal>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={
          decision === "approve"
            ? "Approve and apply change"
            : decision === "reject"
              ? "Reject change"
              : "Cancel request"
        }
        width={500}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Back
            </Button>
            <Button
              variant={decision === "approve" ? "primary" : "danger"}
              disabled={busy}
              onClick={submitDecision}
            >
              {busy
                ? "Saving…"
                : decision === "approve"
                  ? "Approve & apply"
                  : decision === "reject"
                    ? "Reject request"
                    : "Cancel request"}
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          {decision === "approve"
            ? "The change is applied transactionally only if the underlying record still matches this request."
            : "This decision is permanent and remains in the audit history."}
        </p>
        <Field
          label={decision === "reject" ? "Reason (required)" : "Decision note"}
        >
          <textarea
            aria-label={
              decision === "reject" ? "Reason (required)" : "Decision note"
            }
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={1000}
          />
        </Field>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}

function RequestDetails({ request }: { request: ApprovalRequestRow }) {
  const rows = comparison(request);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
        }}
      >
        <Detail label="Status" value={request.status} />
        <Detail
          label="Requester"
          value={request.requester?.name ?? request.requester?.email ?? "—"}
        />
        <Detail label="Submitted" value={formatDate(request.createdAt)} />
        <Detail label="Base revision" value={String(request.baseRevision)} />
      </div>
      <div>
        <div
          className="muted"
          style={{
            fontSize: 11.5,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            fontWeight: 700,
          }}
        >
          Reason
        </div>
        <p style={{ margin: "6px 0 0" }}>{request.reason}</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No value changes. Approval records an explicit administrator review
            of the current values.
          </p>
        ) : (
          <table>
            <caption
              style={{ textAlign: "left", paddingBottom: 8, fontWeight: 700 }}
            >
              Proposed changes only
            </caption>
            <thead>
              <tr>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path} style={{ background: "var(--accent-bg)" }}>
                  <td
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 11.5,
                    }}
                  >
                    {row.path}
                  </td>
                  <td style={{ maxWidth: 240, overflowWrap: "anywhere" }}>
                    {row.before}
                  </td>
                  <td
                    style={{
                      maxWidth: 240,
                      overflowWrap: "anywhere",
                      fontWeight: 700,
                    }}
                  >
                    {row.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {request.decisionNote && (
        <div
          style={{ borderLeft: "3px solid var(--daust-navy)", paddingLeft: 12 }}
        >
          <div className="muted" style={{ fontSize: 11.5 }}>
            Decision note
          </div>
          <p style={{ margin: "4px 0 0" }}>{request.decisionNote}</p>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ background: "var(--bg-subtle)", borderRadius: 4, padding: 10 }}
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontWeight: 700, fontSize: 13 }}>{value}</div>
    </div>
  );
}
