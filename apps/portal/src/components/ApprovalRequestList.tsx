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
import { formatDate, formatXof, formatXofCompact } from "@/lib/format";
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
  management_actual: "Management actual",
  student_enrollment_override: "Enrollment override",
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

type SnapshotMetric = {
  label: string;
  before: string;
  after: string;
};

const INCOME_CATEGORY_KEYS = new Set([
  "bursar",
  "research_grants",
  "service_contracts",
  "donations_sponsorships",
  "scholarships",
  "others",
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function amount(record: Record<string, unknown> | null): number | null {
  if (!record) return null;
  const raw = record.amountXof ?? record.amount;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function amountText(value: number | null): string {
  return value === null ? "—" : formatXof(value);
}

function budgetSnapshot(value: unknown): Record<string, unknown> | null {
  const root = object(value);
  return object(root?.draft) ?? root;
}

function budgetLines(snapshot: Record<string, unknown> | null) {
  return Array.isArray(snapshot?.lines)
    ? snapshot.lines
        .map(object)
        .filter((line): line is Record<string, unknown> => line !== null)
    : [];
}

function budgetTotal(
  snapshot: Record<string, unknown> | null,
  kind: "income" | "expense",
): number {
  return budgetLines(snapshot).reduce((total, line) => {
    const key = typeof line.categoryKey === "string" ? line.categoryKey : "";
    const lineKind = INCOME_CATEGORY_KEYS.has(key) ? "income" : "expense";
    const value = typeof line.amountXof === "number" ? line.amountXof : 0;
    return lineKind === kind ? total + value : total;
  }, 0);
}

function changedBudgetCells(before: unknown, after: unknown): number {
  const map = (value: unknown) =>
    new Map(
      budgetLines(budgetSnapshot(value)).map((line) => [
        `${line.categoryKey}:${line.month ?? line.monthIndex}`,
        line.amountXof,
      ]),
    );
  const left = map(before);
  const right = map(after);
  return [...new Set([...left.keys(), ...right.keys()])].filter(
    (key) => left.get(key) !== right.get(key),
  ).length;
}

function requestMetrics(request: ApprovalRequestRow): SnapshotMetric[] | null {
  if (request.kind === "academic_catalog") {
    const before = object(request.beforeJson);
    const after = object(request.afterJson);
    const defaultLevels = Array.isArray(after?.defaultLevels)
      ? after.defaultLevels.length
      : 0;
    const programs = Array.isArray(after?.programs) ? after.programs : [];
    const custom = programs.filter(
      (program) => object(program)?.progressionMode === "custom",
    ).length;
    return [
      {
        label: "Catalog label",
        before: text(before?.yearLabel),
        after: text(after?.yearLabel),
      },
      {
        label: "Revision",
        before: text(before?.revision),
        after: text(after?.revision),
      },
      { label: "Default levels", before: "—", after: String(defaultLevels) },
      {
        label: "Programme configurations",
        before: "—",
        after: `${programs.length} total · ${custom} custom`,
      },
    ];
  }
  if (request.kind === "operating_budget") {
    const before = budgetSnapshot(request.beforeJson);
    const after = budgetSnapshot(request.afterJson);
    return [
      {
        label: "Opening balance",
        before: amountText(
          typeof before?.openingBalanceXof === "number"
            ? before.openingBalanceXof
            : null,
        ),
        after: amountText(
          typeof after?.openingBalanceXof === "number"
            ? after.openingBalanceXof
            : null,
        ),
      },
      {
        label: "Planned income",
        before: amountText(before ? budgetTotal(before, "income") : null),
        after: amountText(after ? budgetTotal(after, "income") : null),
      },
      {
        label: "Planned expenses",
        before: amountText(before ? budgetTotal(before, "expense") : null),
        after: amountText(after ? budgetTotal(after, "expense") : null),
      },
      {
        label: "Monthly cells changed",
        before: "—",
        after: String(
          changedBudgetCells(request.beforeJson, request.afterJson),
        ),
      },
    ];
  }

  if (request.kind === "management_actual") {
    const before = object(request.beforeJson);
    const after = object(request.afterJson);
    const mode = typeof after?.mode === "string" ? after.mode : "change";
    if (mode === "void_expense" || mode === "void_entry") {
      return [
        {
          label: "Entry amount",
          before: amountText(amount(before)),
          after: "Void entry",
        },
        {
          label: "Category",
          before: text(before?.categoryLabel ?? before?.categoryKey),
          after: "Removed from management actuals",
        },
      ];
    }
    const isAdjustment = mode === "adjustment";
    return [
      {
        label: isAdjustment ? "Reported actual" : "Amount",
        before: amountText(
          isAdjustment && typeof after?.baseActualXof === "number"
            ? after.baseActualXof
            : amount(before),
        ),
        after: amountText(
          isAdjustment && typeof after?.targetActualXof === "number"
            ? after.targetActualXof
            : amount(after),
        ),
      },
      {
        label: "Category",
        before: text(before?.categoryLabel ?? before?.categoryKey),
        after: text(after?.categoryLabel ?? after?.categoryKey),
      },
      {
        label: "Cost center",
        before: text(before?.costCenterCode),
        after: text(after?.costCenterCode),
      },
      {
        label: isAdjustment ? "Adjustment month" : "Occurred on",
        before: text(before?.occurredOn),
        after: text(after?.month ?? after?.occurredOn),
      },
    ];
  }
  return null;
}

function requestPreview(request: ApprovalRequestRow): string | null {
  if (request.kind === "academic_catalog") {
    const after = object(request.afterJson);
    const programmes = Array.isArray(after?.programs)
      ? after.programs.length
      : 0;
    return `${text(after?.yearLabel)} · revision ${text(after?.revision)} · ${programmes} programmes`;
  }
  if (request.kind === "operating_budget") {
    const after = budgetSnapshot(request.afterJson);
    if (!after) return null;
    return `${formatXofCompact(budgetTotal(after, "income"))} planned income · ${formatXofCompact(budgetTotal(after, "expense"))} planned expenses`;
  }
  if (request.kind === "management_actual") {
    const after = object(request.afterJson);
    const before = object(request.beforeJson);
    const mode = typeof after?.mode === "string" ? after.mode : "";
    if (mode.startsWith("void"))
      return `${amountText(amount(before))} entry · void requested`;
    const shown =
      typeof after?.targetActualXof === "number"
        ? after.targetActualXof
        : amount(after);
    return `${amountText(shown)} · ${text(after?.categoryLabel ?? after?.categoryKey)}`;
  }
  return null;
}

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
    if (next === "approve" && selected?.kind === "student_enrollment_override") {
      const failures = (selected.afterJson as { failures?: { gate: string }[] } | null)
        ?.failures;
      setWaivedGates(Array.isArray(failures) ? failures.map((f) => f.gate) : []);
    } else {
      setWaivedGates([]);
    }
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
            ? await approveApprovalRequest(selected.id, note.trim() || undefined)
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
                ? "Academic and Finance changes requiring administrator review will appear here."
                : "Protected changes you submit for administrator approval will appear here."
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
  const metrics = requestMetrics(request);
  const visibleRows = metrics ? rows.slice(0, 120) : rows;
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
      {metrics && (
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
            Decision summary
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 9,
            }}
          >
            {metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  padding: 11,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface)",
                }}
              >
                <div
                  className="muted"
                  style={{ fontSize: 10.5, fontWeight: 650 }}
                >
                  {metric.label}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 7,
                    fontSize: 11.5,
                  }}
                >
                  <span
                    style={{ color: "var(--fg3)", overflowWrap: "anywhere" }}
                  >
                    {metric.before}
                  </span>
                  <span
                    aria-label="changes to"
                    style={{ color: "var(--fg-faint)" }}
                  >
                    →
                  </span>
                  <strong style={{ overflowWrap: "anywhere" }}>
                    {metric.after}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No value changes. Approval records an explicit administrator review
            of the current values.
          </p>
        ) : (
          <details open={!metrics}>
            <summary
              style={{
                cursor: "pointer",
                color: "var(--fg2)",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 0 10px",
              }}
            >
              {metrics ? "Technical field changes" : "Proposed changes only"}
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.path} style={{ background: "var(--accent-bg)" }}>
                    <td style={{ fontSize: 11.5, overflowWrap: "anywhere" }}>
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
            {visibleRows.length < rows.length && (
              <p className="muted" style={{ fontSize: 11.5 }}>
                Showing the first {visibleRows.length} of {rows.length}{" "}
                technical field changes. The summary above contains the full
                totals used for this decision.
              </p>
            )}
          </details>
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
