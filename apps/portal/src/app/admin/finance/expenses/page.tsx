"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CostCenter,
  type Expense,
  createExpense,
  deleteExpense,
  getCostCenters,
  getExpenses,
  updateExpense,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";

const CATEGORIES = ["Salary", "Facilities", "Procurement", "IT", "Operations", "Other"];

export default function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    costCenterCode: "1100",
    category: "Salary",
    payee: "",
    description: "",
    amount: 0,
    isEstimate: false,
    incurredOn: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);

  async function remove(id: string) {
    setMsg(null);
    try {
      await deleteExpense(id);
      setMsg("Expense deleted (audit-logged).");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function saveEdit(id: string) {
    setMsg(null);
    try {
      await updateExpense(id, { amount: editAmount });
      setEditingId(null);
      setMsg("Expense updated (audit-logged).");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const load = useCallback(() => {
    getExpenses().then(setRows).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    getCostCenters().then((c) => setCenters(c.filter((x) => x.type !== "group"))).catch(() => {});
  }, [load]);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await createExpense({
        costCenterCode: form.costCenterCode,
        category: form.category,
        payee: form.payee || undefined,
        description: form.description || undefined,
        amount: Number(form.amount),
        isEstimate: form.isEstimate,
        incurredOn: form.incurredOn,
      });
      setMsg("Expense recorded.");
      setForm({ ...form, payee: "", description: "", amount: 0 });
      load();
    } catch (e) {
      const m = (e as Error).message.match(/"message":"([^"]+)"/);
      setMsg(m ? m[1]! : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="eyebrow">Finance</p>
      <h1 className="page-title">Expenses</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Record an expense / salary</p>
        {msg && <p className="muted">{msg}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <select value={form.costCenterCode} onChange={(e) => setForm({ ...form, costCenterCode: e.target.value })}>
            {centers.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Payee (e.g. teacher)" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
          <input placeholder="Amount XOF" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} style={{ width: 130 }} />
          <input type="date" value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={form.isEstimate} onChange={(e) => setForm({ ...form, isEstimate: e.target.checked })} style={{ width: "auto" }} />
            Estimate
          </label>
          <button className="primary" disabled={busy || form.amount <= 0} onClick={submit}>
            {busy ? "…" : "Record"}
          </button>
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Recent expenses</p>
        <table>
          <thead><tr><th>Date</th><th>Cost center</th><th>Category</th><th>Payee / description</th><th>Amount</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.incurredOn)}</td>
                <td>{e.costCenter}</td>
                <td>{e.category}</td>
                <td>{e.payee || e.description}{e.isEstimate && <span className="badge pending" style={{ marginLeft: 6 }}>est.</span>}</td>
                <td>
                  {editingId === e.id ? (
                    <input type="number" value={editAmount} onChange={(ev) => setEditAmount(Number(ev.target.value))} style={{ width: 120 }} />
                  ) : (
                    formatXof(e.amount)
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editingId === e.id ? (
                    <>
                      <button className="primary" onClick={() => saveEdit(e.id)} style={{ fontSize: 12, marginRight: 6 }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ fontSize: 12 }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(e.id); setEditAmount(e.amount); }} style={{ fontSize: 12, marginRight: 6 }}>Edit</button>
                      <button onClick={() => remove(e.id)} style={{ fontSize: 12 }}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
