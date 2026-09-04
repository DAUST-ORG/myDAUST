"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Search, X } from "lucide-react";
import {
  type ApprovalRequestRow,
  approveApprovalRequest,
  approveEnrollmentOverride,
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
  academic_catalog: "Academic catalog",
  global_fee_schedule: "Fees & payment schedule",
  custom_charge: "Custom charge",
  charge_removal: "Charge removal",
  payment_plan: "Student payment plan",
  discount: "Discount",
  scholarship: "Scholarship",
  operating_budget: "Operating budget",
  management_actual: "Budget income or expense",
  student_enrollment_override: "Enrollment override",
  billing_profile: "Annual billing profile",
  billing_catalog: "Billing catalog",
};

const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "neutral",
  stale: "error",
} as const;

const ENROLLMENT_GATE_LABEL: Record<string, string> = {
  prerequisite: "Prerequisite",
  corequisite: "Corequisite",
  capacity: "Section capacity",
  holds: "Student hold",
  credit_cap: "Credit limit",
  standing: "Academic standing",
  major_restriction: "Programme restriction",
  record_status: "Student record status",
  add_deadline: "Add deadline",
};

const BLOCKED_PRESENTATION: ApprovalRequestRow["presentation"] = {
  subject: "Approval request",
  summary: "This request cannot be reviewed safely.",
  changes: [],
  canApprove: false,
  blockingMessage:
    "The human-readable review details are unavailable. Reload after the API rollout completes or contact IT; approval is disabled.",
};

function presentationFor(
  request: ApprovalRequestRow,
): ApprovalRequestRow["presentation"] {
  const candidate = (request as { presentation?: unknown }).presentation;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("subject" in candidate) ||
    typeof candidate.subject !== "string" ||
    !("summary" in candidate) ||
    typeof candidate.summary !== "string" ||
    !("canApprove" in candidate) ||
    typeof candidate.canApprove !== "boolean" ||
    !("changes" in candidate) ||
    !Array.isArray(candidate.changes)
  ) {
    return BLOCKED_PRESENTATION;
  }
  return candidate as ApprovalRequestRow["presentation"];
}

function requestPreview(request: ApprovalRequestRow): string | null {
  return presentationFor(request).summary || null;
}

function enrollmentGateOptions(request: ApprovalRequestRow | null) {
  if (!request || request.kind !== "student_enrollment_override") return [];
  const failures = (
    request.afterJson as { failures?: { gate?: unknown }[] } | null
  )?.failures;
  if (!Array.isArray(failures)) return [];
  const facts = presentationFor(request).changes.filter((change) =>
    change.label.startsWith("Rule failure "),
  );
  return failures.flatMap((failure, index) => {
    const gate = typeof failure.gate === "string" ? failure.gate : "";
    const label = ENROLLMENT_GATE_LABEL[gate];
    if (!gate || !label) return [];
    return [{ gate, label, fact: facts[index]?.proposed ?? label }];
  });
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
  const [waivedGates, setWaivedGates] = useState<string[]>([]);
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
    if (
      next === "approve" &&
      selected?.kind === "student_enrollment_override"
    ) {
      const failures = (
        selected.afterJson as { failures?: { gate: string }[] } | null
      )?.failures;
      const requested = (
        selected.afterJson as { requestedWaivers?: unknown[] } | null
      )?.requestedWaivers;
      const actual = new Set(
        Array.isArray(failures) ? failures.map((failure) => failure.gate) : [],
      );
      setWaivedGates(
        Array.isArray(requested)
          ? requested.filter(
              (gate): gate is string =>
                typeof gate === "string" && actual.has(gate),
            )
          : [],
      );
    } else {
      setWaivedGates([]);
    }
    setDecision(next);
  }

  async function submitDecision() {
    if (!selected || !decision) return;
    if (decision === "approve" && !presentationFor(selected).canApprove) {
      setError(
        presentationFor(selected).blockingMessage ??
          "A clear review summary is required before approval.",
      );
      return;
    }
    if (decision === "reject" && !note.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let result;
      if (
        decision === "approve" &&
        selected.kind === "student_enrollment_override"
      ) {
        if (waivedGates.length === 0) {
          setError("Pick at least one gate to waive, or reject the request.");
          return;
        }
        result = await approveEnrollmentOverride(selected.id, {
          waivedGates,
          note: note.trim() || undefined,
        });
      } else {
        result =
          decision === "approve"
            ? await approveApprovalRequest(
                selected.id,
                note.trim() || undefined,
              )
            : decision === "reject"
              ? await rejectApprovalRequest(selected.id, note.trim())
              : await cancelApprovalRequest(
                  selected.id,
                  note.trim() || undefined,
                );
      }
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
  const enrollmentOptions = enrollmentGateOptions(selected);

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
                ? "Academic and Finance changes requiring Director review will appear here."
                : "Protected changes you submit for Director approval will appear here."
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
                  {requestPreview(request) && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "var(--daust-navy-700)",
                        fontSize: 11.5,
                        fontWeight: 650,
                      }}
                    >
                      {requestPreview(request)}
                    </p>
                  )}
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
                    disabled={!presentationFor(selected).canApprove}
                    title={
                      presentationFor(selected).canApprove
                        ? undefined
                        : (presentationFor(selected).blockingMessage ??
                          "A clear review summary is required before approval.")
                    }
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
              disabled={
                busy ||
                (decision === "approve" &&
                  selected?.kind === "student_enrollment_override" &&
                  waivedGates.length === 0)
              }
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
            ? "The change is applied only if the approved record still matches this request."
            : "This decision is permanent and remains in the audit history."}
        </p>
        {decision === "approve" &&
          selected?.kind === "student_enrollment_override" && (
            <fieldset
              style={{
                display: "grid",
                gap: 9,
                margin: "0 0 16px",
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <legend style={{ padding: "0 5px", fontWeight: 750 }}>
                Exceptions to approve
              </legend>
              {enrollmentOptions.map((option) => (
                <label
                  key={option.gate}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px 1fr",
                    gap: 9,
                    alignItems: "start",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={waivedGates.includes(option.gate)}
                    onChange={(event) =>
                      setWaivedGates((current) =>
                        event.target.checked
                          ? [...new Set([...current, option.gate])]
                          : current.filter((gate) => gate !== option.gate),
                      )
                    }
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong style={{ display: "block", fontSize: 13 }}>
                      {option.label}
                    </strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {option.fact}
                    </span>
                  </span>
                </label>
              ))}
              {enrollmentOptions.length === 0 && (
                <p role="alert" style={{ margin: 0, color: "var(--danger)" }}>
                  No reviewable enrollment exceptions were found. Approval is
                  disabled.
                </p>
              )}
            </fieldset>
          )}
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
  const presentation = presentationFor(request);
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
        {request.academicYearLabel && (
          <Detail label="Academic year" value={request.academicYearLabel} />
        )}
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
          Applies to
        </div>
        <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
          {presentation.subject}
        </p>
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
      <section aria-labelledby="approval-summary-title">
        <div
          id="approval-summary-title"
          className="muted"
          style={{
            marginBottom: 8,
            fontSize: 11.5,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            fontWeight: 700,
          }}
        >
          Proposed change
        </div>
        <p style={{ margin: "0 0 10px", fontWeight: 700 }}>
          {presentation.summary}
        </p>
        {!presentation.canApprove && (
          <p
            role="alert"
            style={{
              margin: "0 0 10px",
              color: "var(--danger)",
              background:
                "color-mix(in srgb, var(--danger) 7%, var(--surface))",
              borderRadius: "var(--radius-md)",
              padding: 11,
            }}
          >
            {presentation.blockingMessage ??
              "A clear review summary is required before approval."}
          </p>
        )}
        <div style={{ display: "grid", gap: 9 }}>
          {presentation.changes.map((change, index) => (
            <div
              key={`${change.label}:${index}`}
              style={{
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 750 }}>
                {change.label}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 7,
                  fontSize: 13,
                }}
              >
                {change.type === "create" ? (
                  <>
                    <Badge tone="info">New</Badge>
                    <ins style={{ textDecoration: "none", fontWeight: 750 }}>
                      {change.proposed ?? "Added"}
                    </ins>
                  </>
                ) : change.type === "remove" ? (
                  <>
                    <span className="muted">Previous:</span>
                    <del>{change.previous ?? "Existing value"}</del>
                    <span aria-label="changes to">→</span>
                    <span className="muted">Proposed:</span>
                    <ins style={{ textDecoration: "none", fontWeight: 750 }}>
                      {change.proposed ?? "Removed"}
                    </ins>
                  </>
                ) : change.type === "unchanged" ? (
                  <>
                    <Badge tone="neutral">No change</Badge>
                    <strong>
                      {change.proposed ?? change.previous ?? "Unchanged"}
                    </strong>
                  </>
                ) : (
                  <>
                    <span className="muted">Previous:</span>
                    <del>{change.previous ?? "Not set"}</del>
                    <span aria-label="changes to">→</span>
                    <span className="muted">Proposed:</span>
                    <ins style={{ textDecoration: "none", fontWeight: 750 }}>
                      {change.proposed ?? "Not set"}
                    </ins>
                  </>
                )}
              </div>
              {change.detail && (
                <p
                  className="muted"
                  style={{ margin: "6px 0 0", fontSize: 11.5 }}
                >
                  {change.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
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
