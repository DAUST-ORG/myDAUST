"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, FilePlus, Pencil } from "lucide-react";
import {
  type AccountInvoice,
  type FeePlan,
  type StudentAccountRow,
  assignStandardPackage,
  getFeePlan,
  getStudentAccount,
  listStudentAccounts,
  restoreStandardPaymentPlan,
  updatePaymentPlan,
} from "@/lib/api";
import { InvoiceComponentManager } from "@/components/InvoiceComponentManager";
import { formatXof } from "@/lib/format";
import {
  AccountBalanceText,
  AccountStandingBadge,
  AccountStatusLine,
  resolveAccountSummary,
} from "@/components/AccountBalance";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  SortTh,
  Tabs,
  useSort,
} from "@/components/ui";

type TabKey = "billings" | "balances";

/** Design order: Billings is the landing tab, Account balances second. */
const TABS = [
  { value: "billings", label: "Billings" },
  { value: "balances", label: "Account balances" },
];

const PLAN_OPTIONS = [
  { value: "full", label: "Tuition + cafeteria + housing" },
  { value: "tuition", label: "Tuition only" },
];

function planLabel(value: string): string {
  return PLAN_OPTIONS.find((p) => p.value === value)?.label ?? value;
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

interface DraftRow {
  /** Present only when editing an existing billing — the installment being updated. */
  id?: string;
  label: string;
  dueDate: string;
  amountXof: number;
  /** Approved plans cannot reduce an installment below cash already settled. */
  amountPaid?: number;
}

interface BillingDraft {
  /** Set means edit mode: the student and plan are fixed, only the schedule moves. */
  invoiceId?: string;
  studentId: string;
  plan: string;
  planType?: StudentAccountRow["planType"];
  invoice?: AccountInvoice;
  rows: DraftRow[];
}

function BalanceCells({ row }: { row: StudentAccountRow }) {
  const summary = resolveAccountSummary(row.summary, {
    balanceXof: row.remaining ?? row.remainingXof ?? row.balance,
    billedXof: row.billed,
  });
  return (
    <>
      <td
        style={{
          textAlign: "right",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {formatXof(row.billed)}
      </td>
      <td style={{ textAlign: "right" }}>
        <span style={{ display: "grid", gap: 2, justifyItems: "end" }}>
          <AccountBalanceText summary={summary} style={{ fontWeight: 700 }} />
          {summary.standing === "overdue" && (
            <AccountStatusLine summary={summary} />
          )}
        </span>
      </td>
      <td style={{ textAlign: "right" }}>
        <AccountStandingBadge summary={summary} />
      </td>
    </>
  );
}

export default function FinanceAccounts() {
  const [rows, setRows] = useState<StudentAccountRow[] | null>(null);
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("billings");
  const [fBill, setFBill] = useState("");
  const [fBal, setFBal] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const { sort, toggle, apply } = useSort({ key: "balance", dir: "desc" });

  const [draft, setDraft] = useState<BillingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState("");

  const load = useCallback(() => {
    listStudentAccounts()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    getFeePlan()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  const year = plan?.academicYearLabel ?? "";
  const feeRows = useMemo(
    () => [...(plan?.rows ?? [])].sort((a, b) => a.sequence - b.sequence),
    [plan],
  );

  const billings = useMemo(() => {
    if (!rows) return [];
    const needle = fBill.trim().toLowerCase();
    const withBilling = rows.filter((r) => r.invoiceId && r.billed > 0);
    if (!needle) return withBilling;
    return withBilling.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.studentNo.toLowerCase().includes(needle) ||
        (r.billingNumber ?? "").toLowerCase().includes(needle) ||
        (r.billingDescription ?? "").toLowerCase().includes(needle) ||
        (r.invoiceId ?? "").toLowerCase().includes(needle),
    );
  }, [rows, fBill]);

  const balances = useMemo(() => {
    if (!rows) return [];
    const needle = fBal.trim().toLowerCase();
    const searched = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.studentNo.toLowerCase().includes(needle) ||
            (r.program ?? "").toLowerCase().includes(needle),
        )
      : rows;
    const matched = searched.filter((row) => {
      if (balanceFilter === "all") return true;
      if (balanceFilter === "hold") return !!row.hasActiveHold;
      if (balanceFilter === "special") return !!row.specialAccount?.isSpecial;
      return (
        resolveAccountSummary(row.summary, {
          balanceXof: row.balance,
          billedXof: row.billed,
        }).standing === balanceFilter
      );
    });
    return apply(matched, {
      name: (r) => r.name,
      program: (r) => r.program,
      billed: (r) => r.billed,
      balance: (r) => r.remaining ?? r.remainingXof ?? r.balance,
    });
  }, [rows, fBal, balanceFilter, apply]);

  const studentOptions = useMemo(
    () => [
      { value: "", label: "— Select student —" },
      ...(rows ?? []).map((r) => ({
        value: r.id,
        label: `${r.name} · ${r.studentNo}`,
      })),
    ],
    [rows],
  );

  /** Seed the schedule from the institution fee plan for the chosen tuition plan. */
  const seedRows = useCallback(
    (which: string): DraftRow[] =>
      feeRows.map((r) => ({
        label: r.label,
        dueDate: toDateInput(r.dueOn),
        amountXof: which === "tuition" ? r.amountTuitionXof : r.amountFullXof,
      })),
    [feeRows],
  );

  function openCreate() {
    setNote(null);
    setError(null);
    setRequestReason("");
    setDraft({ studentId: "", plan: "full", rows: seedRows("full") });
  }

  async function openEdit(row: StudentAccountRow) {
    if (!row.invoiceId) return;
    setNote(null);
    setError(null);
    setBusy(true);
    setRequestReason("");
    try {
      const account = await getStudentAccount(row.id);
      const invoice = account.invoices.find((i) => i.id === row.invoiceId);
      if (!invoice) throw new Error("That billing no longer exists.");
      if (invoice.hasPendingPlanChange) {
        throw new Error(
          "A payment-plan change for this billing is already awaiting administrator approval.",
        );
      }
      setDraft({
        invoiceId: invoice.id,
        studentId: row.id,
        plan: invoice.description === planLabel("tuition") ? "tuition" : "full",
        planType: invoice.planType,
        invoice,
        rows: invoice.installments.map((i) => ({
          id: i.id,
          label: i.label ?? `Installment ${i.sequence}`,
          dueDate: toDateInput(i.dueDate),
          amountXof: i.amountDue,
          amountPaid: i.amountPaid,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that billing.");
    } finally {
      setBusy(false);
    }
  }

  function editDraft(patch: Partial<BillingDraft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function editRow(index: number, patch: Partial<DraftRow>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            rows: d.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
          }
        : d,
    );
  }

  const total = draft?.rows.reduce((sum, r) => sum + r.amountXof, 0) ?? 0;
  const valid =
    draft !== null &&
    draft.studentId !== "" &&
    draft.rows.length > 0 &&
    draft.rows.every(
      (r) =>
        r.dueDate !== "" &&
        r.amountXof > 0 &&
        r.amountXof >= (r.amountPaid ?? 0),
    ) &&
    total > 0 &&
    (!draft.invoiceId || requestReason.trim().length > 0);

  async function save() {
    if (!draft || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.invoiceId) {
        const result = await updatePaymentPlan(
          draft.invoiceId,
          draft.rows
            .filter((r): r is DraftRow & { id: string } => !!r.id)
            .map((r) => ({
              id: r.id,
              dueDate: r.dueDate,
              amountDue: r.amountXof,
              label: r.label,
            })),
          requestReason.trim(),
        );
        setNote(
          result.applied
            ? "Payment-plan change approved and applied."
            : "Payment-plan change submitted for administrator approval.",
        );
      } else {
        const result = await assignStandardPackage(draft.studentId);
        setNote(
          result.created
            ? "The approved full annual package was assigned."
            : "This student already has the approved full annual package.",
        );
      }
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the billing.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreStandard() {
    if (!draft?.invoiceId || !requestReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreStandardPaymentPlan(
        draft.invoiceId,
        requestReason.trim(),
      );
      setNote(
        result.applied
          ? "The approved standard plan was restored."
          : "Restore-to-standard request submitted for administrator approval.",
      );
      setDraft(null);
      load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not request a standard-plan restoration.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );

  return (
    <>
      <PageHeader
        title="Student Accounts"
        subtitle={`Billing status across all students${year ? ` · ${year}` : ""}`}
        actions={
          <Button
            variant="primary"
            icon={<FilePlus size={15} />}
            onClick={openCreate}
          >
            New billing
          </Button>
        }
      />

      {note && (
        <p className="card" style={{ color: "var(--success-500)" }}>
          {note}
        </p>
      )}
      {error && rows && (
        <p className="card" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <Tabs tabs={TABS} active={tab} onChange={(v) => setTab(v as TabKey)} />

      {!rows && <p className="muted">Loading…</p>}

      {rows && tab === "billings" && (
        <Card
          title="Billings"
          action={
            <SearchInput
              value={fBill}
              onChange={setFBill}
              placeholder="Filter billings…"
              width={260}
            />
          }
        >
          {billings.length === 0 ? (
            <EmptyState
              icon={<FilePlus size={22} />}
              title="No billings yet"
              note="Create a billing to charge a student. Invoices generate automatically on each due date."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Billing</th>
                  <th>Student</th>
                  <th style={{ width: 230 }}>Plan</th>
                  <th style={{ textAlign: "right", width: 140 }}>Billed</th>
                  <th style={{ textAlign: "right", width: 140 }}>Remaining</th>
                  <th style={{ textAlign: "right", width: 56 }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {billings.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--daust-navy)",
                      }}
                    >
                      {r.billingNumber ?? (r.invoiceId ?? "").slice(0, 8)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontSize: 12.5, color: "var(--fg2)" }}>
                      <span style={{ display: "grid", gap: 2 }}>
                        <span>{r.billingDescription ?? "—"}</span>
                        {r.planType === "individual_override" ? (
                          <span
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <Badge tone="warning">Individual plan</Badge>
                            {r.specialAccount?.hasPendingPlanChange && (
                              <Badge tone="info">Approval pending</Badge>
                            )}
                          </span>
                        ) : r.packageType === "standard_full" ? (
                          <span
                            style={{
                              color: "var(--fg3)",
                              fontSize: 11.5,
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>
                              Global schedule
                              {r.feeScheduleRevision
                                ? ` · revision ${r.feeScheduleRevision}`
                                : ""}
                            </span>
                            {r.specialAccount?.hasPendingPlanChange && (
                              <Badge tone="info">Approval pending</Badge>
                            )}
                          </span>
                        ) : r.specialAccount?.isSpecial ? (
                          <Badge tone="warning">Special account</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatXof(r.billed)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <AccountBalanceText
                        summary={resolveAccountSummary(r.summary, {
                          balanceXof: r.remaining ?? r.balance,
                          billedXof: r.billed,
                        })}
                        style={{ fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <IconButton
                        label={`Manage annual charges and payment dates for ${r.name}`}
                        disabled={
                          busy || r.specialAccount?.hasPendingPlanChange
                        }
                        onClick={() => openEdit(r)}
                      >
                        <Pencil size={15} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {rows && tab === "balances" && (
        <Card
          title="Account balances"
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SearchInput
                value={fBal}
                onChange={setFBal}
                placeholder="Filter students…"
                width={240}
              />
              <Select
                ariaLabel="Filter by account standing"
                value={balanceFilter}
                onChange={setBalanceFilter}
                style={{ minWidth: 160 }}
                options={[
                  { value: "all", label: "All standings" },
                  { value: "on_time", label: "On time" },
                  { value: "overdue", label: "Overdue" },
                  { value: "cleared", label: "Cleared" },
                  { value: "credit", label: "In credit" },
                  { value: "unscheduled", label: "Needs a schedule" },
                  { value: "special", label: "Special accounts" },
                  { value: "hold", label: "Active hold" },
                ]}
              />
            </div>
          }
        >
          {balances.length === 0 ? (
            <EmptyState title="No accounts match that search" />
          ) : (
            <table>
              <thead>
                <tr>
                  <SortTh
                    label="Student"
                    sortKey="name"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortTh
                    label="Program"
                    sortKey="program"
                    sort={sort}
                    onSort={toggle}
                  />
                  <SortTh
                    label="Billed"
                    sortKey="billed"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                  />
                  <SortTh
                    label="Remaining"
                    sortKey="balance"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                  />
                  <th style={{ textAlign: "right", width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                        }}
                      >
                        <Avatar name={r.name} size={34} src={r.photoUrl} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 600 }}>
                            {r.name}
                          </span>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontFamily: "var(--font-mono)",
                              color: "var(--fg3)",
                            }}
                          >
                            {r.studentNo}
                          </span>
                          {r.specialAccount?.isSpecial && (
                            <span
                              style={{
                                display: "flex",
                                gap: 5,
                                marginTop: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              <Badge tone="warning">
                                {r.specialAccount.hasIndividualPlan
                                  ? "Individual plan"
                                  : "Special account"}
                              </Badge>
                              {r.specialAccount.hasPendingPlanChange && (
                                <Badge tone="info">Approval pending</Badge>
                              )}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--fg2)" }}>
                      {r.program ?? "—"}
                    </td>
                    <BalanceCells row={r} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {draft && (
        <Modal
          open
          onClose={() => setDraft(null)}
          title={draft.invoiceId ? "Edit student billing" : "New Billing"}
          width={560}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Check size={15} />}
                disabled={busy || !valid}
                onClick={save}
              >
                {busy
                  ? "Saving…"
                  : draft.invoiceId
                    ? "Submit change"
                    : "Assign full package"}
              </Button>
            </>
          }
        >
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
            {draft.invoiceId
              ? "Annual charges set this student’s total. Approved component exceptions remain selected while later global fee amounts continue to apply; payment-date exceptions use an individual schedule."
              : "Assign the administrator-approved tuition, housing, and cafeteria package."}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              marginBottom: 16,
              borderRadius: "var(--radius-md)",
              background: "var(--accent-bg)",
            }}
          >
            <CalendarClock
              size={16}
              style={{ color: "var(--daust-navy)", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--fg3)",
              }}
            >
              Academic year
            </span>
            <strong style={{ fontSize: 13.5 }}>{year || "—"}</strong>
            <span style={{ flex: 1 }} />
            <Badge tone="neutral">Auto-filled · active</Badge>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Student *">
              {draft.invoiceId ? (
                <Input
                  value={
                    studentOptions.find((o) => o.value === draft.studentId)
                      ?.label ?? ""
                  }
                  onChange={() => {}}
                  disabled
                />
              ) : (
                <Select
                  value={draft.studentId}
                  onChange={(v) => editDraft({ studentId: v })}
                  options={studentOptions}
                />
              )}
            </Field>

            <Field label="Billing package">
              <Input
                value={
                  draft.invoiceId
                    ? planLabel(draft.plan)
                    : "Tuition + cafeteria + housing"
                }
                onChange={() => {}}
                disabled
              />
            </Field>

            {draft.invoice?.packageType === "standard_full" && (
              <InvoiceComponentManager
                invoice={draft.invoice}
                onSubmitted={(message) => {
                  setDraft(null);
                  setNote(message);
                  load();
                }}
              />
            )}

            {draft.planType === "individual_override" && (
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--warning-400)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                }}
              >
                <strong style={{ display: "block", fontSize: 13 }}>
                  Individual plan override
                </strong>
                <p
                  className="muted"
                  style={{ margin: "4px 0 9px", fontSize: 12 }}
                >
                  Use the reason below to request the current approved global
                  dates and amounts for this student.
                </p>
                <Button
                  variant="ghost"
                  disabled={busy || !requestReason.trim()}
                  onClick={restoreStandard}
                >
                  Restore approved standard plan
                </Button>
              </div>
            )}

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: "var(--daust-navy)",
                  }}
                >
                  Payment dates
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {draft.invoiceId
                    ? "Amounts are calculated from annual charges"
                    : "From the approved global revision"}
                </span>
              </div>

              {draft.rows.length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                  No fee schedule for the active year — seed the institution fee
                  plan first.
                </p>
              )}

              {draft.rows.map((r, i) => (
                <div
                  key={r.id ?? i}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(min(145px, 100%), 1fr))",
                    gap: 10,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Input
                    value={r.label}
                    onChange={(v) => editRow(i, { label: v })}
                    disabled={!draft.invoiceId}
                    placeholder={`Installment ${i + 1}`}
                  />
                  <Input
                    type="date"
                    value={r.dueDate}
                    onChange={(v) => editRow(i, { dueDate: v })}
                    disabled={!draft.invoiceId}
                  />
                  <span style={{ display: "grid", gap: 3 }}>
                    <Input
                      value={r.amountXof}
                      onChange={() => {}}
                      disabled
                      invalid={r.amountXof < (r.amountPaid ?? 0)}
                      align="right"
                      inputMode="numeric"
                    />
                    {(r.amountPaid ?? 0) > 0 && (
                      <span className="muted" style={{ fontSize: 10.5 }}>
                        {formatXof(r.amountPaid ?? 0)} already paid
                      </span>
                    )}
                  </span>
                </div>
              ))}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  marginTop: 12,
                  paddingTop: 10,
                }}
              >
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Annual charge total
                </span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatXof(total)}
                </strong>
              </div>
            </div>
            {draft.invoiceId && (
              <Field
                label="Reason for change"
                hint="Required for payment-date changes. Charge changes have their own approval reason above."
              >
                <textarea
                  value={requestReason}
                  onChange={(event) => setRequestReason(event.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
