"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, FilePlus } from "lucide-react";
import { type StudentAccountRow, addCharge, getFeePlan, listStudentAccounts } from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
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

const TABS = [
  { value: "balances", label: "Account balances" },
  { value: "billings", label: "Billings" },
];

function toInt(v: string): number {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
}

export default function FinanceAccounts() {
  const [rows, setRows] = useState<StudentAccountRow[] | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("balances");
  const [fBill, setFBill] = useState("");
  const [fBal, setFBal] = useState("");
  const { sort, toggle, apply } = useSort({ key: "balance", dir: "desc" });

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({ studentId: "", description: "", amount: 0, dueDate: "" });

  const load = useCallback(() => {
    listStudentAccounts().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    getFeePlan().then((p) => setYear(p.academicYearLabel)).catch(() => setYear(null));
  }, []);

  const billings = useMemo(() => {
    if (!rows) return [];
    const needle = fBill.trim().toLowerCase();
    const withBilling = rows.filter((r) => r.invoiceId && r.billed > 0);
    if (!needle) return withBilling;
    return withBilling.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.studentNo.toLowerCase().includes(needle) ||
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

  const valid = form.studentId !== "" && form.description.trim() !== "" && form.amount > 0;

  function openModal() {
    setForm({ studentId: "", description: "", amount: 0, dueDate: "" });
    setNote(null);
    setOpen(true);
  }

  async function saveBilling() {
    if (!valid) return;
    setBusy(true);
    try {
      await addCharge({
        studentIds: [form.studentId],
        description: form.description.trim(),
        amountXof: form.amount,
        dueDate: form.dueDate || undefined,
      });
      setOpen(false);
      setNote("Billing created.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the billing.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader
        title="Student Accounts"
        subtitle={`Billing status across all students${year ? ` · ${year}` : ""}`}
        actions={
          <Button variant="primary" icon={<FilePlus size={15} />} onClick={openModal}>
            New billing
          </Button>
        }
      />

      {note && <p className="card" style={{ color: "var(--success-500)" }}>{note}</p>}

      <Tabs tabs={TABS} active={tab} onChange={(v) => setTab(v as TabKey)} />

      {!rows && <p className="muted">Loading…</p>}

      {rows && tab === "billings" && (
        <Card
          title="Billings"
          action={
            <SearchInput value={fBill} onChange={setFBill} placeholder="Filter billings…" width={260} />
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
                  <th style={{ width: 220 }}>Billing</th>
                  <th>Student</th>
                  <th style={{ textAlign: "right", width: 140 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {billings.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--daust-navy)" }}>
                      {/* Invoices have no human-readable number yet; show a short handle
                          rather than a full uuid until one is added to the model. */}
                      {(r.invoiceId ?? "").slice(0, 8)}
                    </td>
                    <td>
                      <Link href={`/admin/finance/students/${r.id}`} style={{ fontWeight: 600 }}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {formatXof(r.billed)}
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
            <SearchInput value={fBal} onChange={setFBal} placeholder="Filter students…" width={260} />
          }
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
                      <Link
                        href={`/admin/finance/students/${r.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 9 }}
                      >
                        <Avatar name={r.name} size={34} src={r.photoUrl} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 600 }}>{r.name}</span>
                          <span
                            style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--fg3)" }}
                          >
                            {r.studentNo}
                          </span>
                        </span>
                      </Link>
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Billing"
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="navy"
              icon={<Check size={15} />}
              disabled={busy || !valid}
              onClick={saveBilling}
            >
              Create billing
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
          Set up billing for a student{year ? ` · ${year}` : ""}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Student *">
            <Select
              value={form.studentId}
              onChange={(v) => setForm((f) => ({ ...f, studentId: v }))}
              options={studentOptions}
            />
          </Field>
          <Field label="Description *">
            <Input
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder="Inscription — Fall"
            />
          </Field>
          <Field label="Amount *" hint="FCFA">
            <Input
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: toInt(v) }))}
              align="right"
              inputMode="numeric"
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
