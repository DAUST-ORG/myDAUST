"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  type AdminStudent,
  type PaymentLinkRow,
  cancelPaymentLink,
  createPaymentLink,
  getAdminStudents,
  getPaymentLinks,
  markPaymentLinkPaid,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = { active: "pending", paid: "completed", cancelled: "overdue", expired: "overdue" };

export default function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLinkRow[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ payeeName: "", payeeMeta: "", studentId: "", amountXof: "", purpose: "Tuition payment", costCenterCode: "9100", dueDate: "", expiresAt: "" });

  const load = useCallback(() => {
    getPaymentLinks().then(setLinks).catch(() => {});
    getAdminStudents().then(setStudents).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  function pickStudent(id: string) {
    const s = students.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      studentId: id,
      payeeName: s ? s.name : f.payeeName,
      payeeMeta: s ? `${s.studentNo}${s.program ? ` · ${s.program}` : ""}` : f.payeeMeta,
    }));
  }

  async function create() {
    setErr(null);
    try {
      const link = await createPaymentLink({
        payeeName: form.payeeName,
        payeeMeta: form.payeeMeta || undefined,
        studentId: form.studentId || undefined,
        amountXof: Number(form.amountXof),
        purpose: form.purpose,
        costCenterCode: form.costCenterCode || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      });
      await navigator.clipboard.writeText(link.url).catch(() => {});
      setCopied(link.id);
      setForm({ payeeName: "", payeeMeta: "", studentId: "", amountXof: "", purpose: "Tuition payment", costCenterCode: "9100", dueDate: "", expiresAt: "" });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function copy(l: PaymentLinkRow) {
    await navigator.clipboard.writeText(l.url).catch(() => {});
    setCopied(l.id);
    setTimeout(() => setCopied(null), 1500);
  }

  const input: React.CSSProperties = { width: "100%" };

  return (
    <>
      <p className="eyebrow">Finance</p>
      <h1 className="page-title">Payment links</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>New payment link</p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          Any amount, any reason — tuition top-up, event fee, replacement ID, a parent paying remotely. The link opens a branded pay page (Wave / Orange Money / card / bank transfer), no account needed.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Student (optional)</span>
            <select style={input} value={form.studentId} onChange={(e) => pickStudent(e.target.value)}>
              <option value="">— none / external payee —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.studentNo})</option>)}
            </select>
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Payee name *</span>
            <input style={input} value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Payee detail</span>
            <input style={input} value={form.payeeMeta} placeholder="DA24003 · Computer Science" onChange={(e) => setForm({ ...form, payeeMeta: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Amount (FCFA) *</span>
            <input style={input} type="number" min={1} value={form.amountXof} onChange={(e) => setForm({ ...form, amountXof: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Purpose *</span>
            <input style={input} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Cost center</span>
            <input style={input} value={form.costCenterCode} onChange={(e) => setForm({ ...form, costCenterCode: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Due date</span>
            <input style={input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </label>
          <label>
            <span className="muted" style={{ fontSize: 12 }}>Link expires</span>
            <input style={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
        </div>
        {err && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{err}</p>}
        <button className="primary" style={{ marginTop: 12 }} disabled={!form.payeeName || !form.amountXof || !form.purpose} onClick={create}>
          <Link2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          Create link (copies URL)
        </button>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>All links</p>
        {links.length === 0 ? (
          <p className="muted">No payment links yet.</p>
        ) : (
          <table>
            <thead><tr><th>Created</th><th>Payee</th><th>Purpose</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {links.map((l) => {
                const status = l.expired ? "expired" : l.status;
                return (
                  <tr key={l.id}>
                    <td>{formatDate(l.createdAt)}</td>
                    <td>{l.payeeName}{l.payeeMeta && <br />}{l.payeeMeta && <span className="muted" style={{ fontSize: 12 }}>{l.payeeMeta}</span>}</td>
                    <td>{l.purpose}<br /><span className="muted" style={{ fontSize: 11.5 }}>CC {l.costCenterCode}{l.method ? ` · paid via ${l.method}` : ""}</span></td>
                    <td><strong>{formatXof(l.amountXof)}</strong></td>
                    <td><span className={`badge ${STATUS_BADGE[status]}`}>{status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button onClick={() => copy(l)} style={{ fontSize: 12, marginRight: 6 }}>
                        {copied === l.id ? <Check size={12} /> : <Copy size={12} />} Copy
                      </button>
                      {status === "active" && (
                        <>
                          <button onClick={() => markPaymentLinkPaid(l.id).then(load)} style={{ fontSize: 12, marginRight: 6 }} title="Bank transfer verified out of band">Mark paid</button>
                          <button onClick={() => cancelPaymentLink(l.id).then(load)} style={{ fontSize: 12 }}>Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
