"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, FilePlus, Pencil } from "lucide-react";
import {
  type FeePlan,
  type StudentAccountRow,
  addCharge,
  getFeePlan,
  getStudentAccount,
  listStudentAccounts,
  updatePaymentPlan,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
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

function toInt(v: string): number {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
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
}

interface BillingDraft {
  /** Set means edit mode: the student and plan are fixed, only the schedule moves. */
  invoiceId?: string;
  studentId: string;
  plan: string;
  rows: DraftRow[];
}

export default function FinanceAccounts() {
  const [rows, setRows] = useState<StudentAccountRow[] | null>(null);
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("billings");
  const [fBill, setFBill] = useState("");
  const [fBal, setFBal] = useState("");
  const { sort, toggle, apply } = useSort({ key: "balance", dir: "desc" });

  const [draft, setDraft] = useState<BillingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    listStudentAccounts().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    getFeePlan().then(setPlan).catch(() => setPlan(null));
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
    const matched = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.studentNo.toLowerCase().includes(needle) ||
            (r.program ?? "").toLowerCase().includes(needle),
        )
      : rows;
    return apply(matched, {
      name: (r) => r.name,
      program: (r) => r.program,
      balance: (r) => r.balance,
    });
  }, [rows, fBal, apply]);

  const studentOptions = useMemo(
    () => [
      { value: "", label: "— Select student —" },
      ...(rows ?? []).map((r) => ({ value: r.id, label: `${r.name} · ${r.studentNo}` })),
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
    setDraft({ studentId: "", plan: "full", rows: seedRows("full") });
  }

  async function openEdit(row: StudentAccountRow) {
    if (!row.invoiceId) return;
    setNote(null);
    setError(null);
    setBusy(true);
    try {
      const account = await getStudentAccount(row.id);
      const invoice = account.invoices.find((i) => i.id === row.invoiceId);
      if (!invoice) throw new Error("That billing no longer exists.");
      setDraft({
        invoiceId: invoice.id,
        studentId: row.id,
        plan: invoice.description === planLabel("tuition") ? "tuition" : "full",
        rows: invoice.installments.map((i) => ({
          id: i.id,
          label: i.label ?? `Installment ${i.sequence}`,
          dueDate: toDateInput(i.dueDate),
          amountXof: i.amountDue,
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
      d ? { ...d, rows: d.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) } : d,
    );
  }

  const total = draft?.rows.reduce((sum, r) => sum + r.amountXof, 0) ?? 0;
  const valid =
    draft !== null &&
    draft.studentId !== "" &&
    draft.rows.length > 0 &&
    draft.rows.every((r) => r.dueDate !== "" && r.amountXof > 0) &&
    total > 0;

  async function save() {
    if (!draft || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.invoiceId) {
        await updatePaymentPlan(
          draft.invoiceId,
          draft.rows
            .filter((r): r is DraftRow & { id: string } => !!r.id)
            .map((r) => ({ id: r.id, dueDate: r.dueDate, amountDue: r.amountXof, label: r.label })),
        );
        setNote("Billing updated.");
      } else {
        await addCharge({
          studentIds: [draft.studentId],
          description: planLabel(draft.plan),
          amountXof: total,
          installments: draft.rows.map((r) => ({ dueDate: r.dueDate, amountXof: r.amountXof, label: r.label })),
        });
        setNote("Billing created.");
      }
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the billing.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader
        title="Student Accounts"
        subtitle={`Billing status across all students${year ? ` · ${year}` : ""}`}
        actions={
          <Button variant="primary" icon={<FilePlus size={15} />} onClick={openCreate}>
            New billing
          </Button>
        }
      />

      {note && <p className="card" style={{ color: "var(--success-500)" }}>{note}</p>}
      {error && rows && <p className="card" style={{ color: "var(--danger)" }}>{error}</p>}

      <Tabs tabs={TABS} active={tab} onChange={(v) => setTab(v as TabKey)} />

      {!rows && <p className="muted">Loading…</p>}

      {rows && tab === "billings" && (
        <Card
          title="Billings"
          action={<SearchInput value={fBill} onChange={setFBill} placeholder="Filter billings…" width={260} />}
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
                  <th style={{ textAlign: "right", width: 140 }}>Total</th>
                  <th style={{ textAlign: "right", width: 56 }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {billings.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--daust-navy)" }}>
                      {r.billingNumber ?? (r.invoiceId ?? "").slice(0, 8)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontSize: 12.5, color: "var(--fg2)" }}>{r.billingDescription ?? "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {formatXof(r.billed)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <IconButton label={`Edit billing for ${r.name}`} onClick={() => openEdit(r)}>
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
          action={<SearchInput value={fBal} onChange={setFBal} placeholder="Filter students…" width={260} />}
        >
          {balances.length === 0 ? (
            <EmptyState title="No accounts match that search" />
          ) : (
            <table>
              <thead>
                <tr>
                  <SortTh label="Student" sortKey="name" sort={sort} onSort={toggle} />
                  <SortTh label="Program" sortKey="program" sort={sort} onSort={toggle} />
                  <SortTh label="Balance" sortKey="balance" sort={sort} onSort={toggle} align="right" />
                  <th style={{ textAlign: "right", width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar name={r.name} size={34} src={r.photoUrl} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 600 }}>{r.name}</span>
                          <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--fg3)" }}>
                            {r.studentNo}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--fg2)" }}>{r.program ?? "—"}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: r.balance > 0 ? "var(--danger)" : "var(--success-500)",
                      }}
                    >
                      {r.balance > 0 ? formatXof(r.balance) : "Settled"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.balance > 0 ? (
                        <Badge tone="error">Outstanding</Badge>
                      ) : (
                        <Badge tone="success">Paid in full</Badge>
                      )}
                    </td>
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
          title={draft.invoiceId ? "Edit Billing" : "New Billing"}
          width={560}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" icon={<Check size={15} />} disabled={busy || !valid} onClick={save}>
                {busy ? "Saving…" : draft.invoiceId ? "Save changes" : "Create billing"}
              </Button>
            </>
          }
        >
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
            Set up billing for a student · invoices generate automatically on each due date
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
            <CalendarClock size={16} style={{ color: "var(--daust-navy)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, color: "var(--fg3)" }}>
              Academic year
            </span>
            <strong style={{ fontSize: 13.5 }}>{year || "—"}</strong>
            <span style={{ flex: 1 }} />
            <Badge tone="neutral">Auto-filled · active</Badge>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Student *">
              {draft.invoiceId ? (
                <Input value={studentOptions.find((o) => o.value === draft.studentId)?.label ?? ""} onChange={() => {}} disabled />
              ) : (
                <Select
                  value={draft.studentId}
                  onChange={(v) => editDraft({ studentId: v })}
                  options={studentOptions}
                />
              )}
            </Field>

            <Field label="Tuition plan">
              {draft.invoiceId ? (
                <Input value={planLabel(draft.plan)} onChange={() => {}} disabled />
              ) : (
                <Select
                  value={draft.plan}
                  onChange={(v) => editDraft({ plan: v, rows: seedRows(v) })}
                  options={PLAN_OPTIONS}
                />
              )}
            </Field>

            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, color: "var(--daust-navy)" }}>
                  Installments
                </span>
                <span className="muted" style={{ fontSize: 12 }}>Editable · customize for this student</span>
              </div>

              {draft.rows.length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                  No fee schedule for the active year — seed the institution fee plan first.
                </p>
              )}

              {draft.rows.map((r, i) => (
                <div
                  key={r.id ?? i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 150px 150px", gap: 10, alignItems: "center", marginBottom: 8 }}
                >
                  <Input value={r.label} onChange={(v) => editRow(i, { label: v })} placeholder={`Installment ${i + 1}`} />
                  <Input type="date" value={r.dueDate} onChange={(v) => editRow(i, { dueDate: v })} />
                  <Input
                    value={r.amountXof}
                    onChange={(v) => editRow(i, { amountXof: toInt(v) })}
                    align="right"
                    inputMode="numeric"
                  />
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
                <span className="muted" style={{ fontSize: 12.5 }}>Billing total</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatXof(total)}</strong>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
