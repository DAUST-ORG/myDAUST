"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import {
  type AdminStudent,
  type GuardianRow,
  createGuardian,
  getAdminStudents,
  getGuardians,
  resendGuardianInvite,
} from "@/lib/api";
import {
  Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput,
} from "@/components/ui";

export default function ParentsPage() {
  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", relation: "", studentIds: [] as string[] });
  const [childQuery, setChildQuery] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getGuardians().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    getAdminStudents().then(setStudents).catch(() => setStudents([]));
  }, [load]);

  const childOptions = useMemo(() => {
    const q = childQuery.trim().toLowerCase();
    const list = q
      ? students.filter((s) => s.name.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q))
      : students;
    return list.slice(0, 40);
  }, [students, childQuery]);

  const visible = useMemo(() => {
    const needle = listQuery.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        g.email.toLowerCase().includes(needle) ||
        g.children.some((c) => c.name.toLowerCase().includes(needle) || c.studentNo.toLowerCase().includes(needle)),
    );
  }, [rows, listQuery]);

  const valid = form.fullName.trim() && form.email.trim() && form.studentIds.length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await createGuardian({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        studentIds: form.studentIds,
        relation: form.relation.trim() || undefined,
      });
      setNote(
        `Parent account created for ${form.fullName.trim()}. A password-setup email has been sent to ${form.email.trim()}.`,
      );
      setAdding(false);
      setForm({ fullName: "", email: "", relation: "", studentIds: [] });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the parent account.");
    } finally {
      setBusy(false);
    }
  }

  async function resend(id: string, email: string) {
    try {
      await resendGuardianInvite(id);
      setNote(`Invitation re-sent to ${email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the invitation.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Parents"
        subtitle="Guardian accounts and the students each may follow. Guardians never self-register."
        actions={
          <>
            <SearchInput value={listQuery} onChange={setListQuery} placeholder="Filter parents or students…" width={260} />
            <Button variant="primary" onClick={() => setAdding(true)}>New parent</Button>
          </>
        }
      />

      {error && <p className="card" style={{ color: "var(--danger)" }}>{error}</p>}
      {note && <p className="card" style={{ color: "var(--success-500)" }}>{note}</p>}

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState title="No parent accounts yet" note="Create one to give a guardian read access to their child's record." />
      )}

      {rows && rows.length > 0 && visible.length === 0 && <EmptyState title="No parents match" />}

      {visible.length > 0 && (
        <Card pad={false}>
          <table>
            <thead><tr><th>Parent</th><th>Email</th><th>Status</th><th>Assigned students</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.id} className="sis-row">
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600 }}>
                      <Avatar name={g.name} size={28} />
                      {g.name}
                    </span>
                  </td>
                  <td className="muted">{g.email}</td>
                  <td>
                    <Badge tone={g.status === "active" ? "success" : g.status === "invited" ? "warning" : "error"}>
                      {g.status}
                    </Badge>
                  </td>
                  <td>
                    {g.children.map((c) => (
                      <div key={c.studentId} style={{ fontSize: 12.5 }}>
                        {c.name} <span className="muted">({c.studentNo})</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    {g.status !== "active" && (
                      <Button size="sm" icon={<Mail size={12} />} onClick={() => resend(g.id, g.email)}>
                        Resend invite
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {adding && (
        <Modal
          open
          onClose={() => setAdding(false)}
          title="New parent account"
          width={560}
          footer={
            <>
              <Button onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={submit} disabled={busy || !valid}>
                {busy ? "Creating…" : "Create & send invite"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Full name"><Input value={form.fullName} onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} /></Field>
            <Field label="Email" hint="The password-setup link is sent here.">
              <Input value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
            </Field>
            <Field label="Relationship" hint="Optional, e.g. Father, Mother, Guardian.">
              <Input value={form.relation} onChange={(v) => setForm((f) => ({ ...f, relation: v }))} />
            </Field>
            <Field label={`Children (${form.studentIds.length} selected)`}>
              <SearchInput value={childQuery} onChange={setChildQuery} placeholder="Filter students…" />
            </Field>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              {childOptions.length === 0 && <p className="muted" style={{ padding: 12, margin: 0, fontSize: 13 }}>No students match.</p>}
              {childOptions.map((s) => {
                const checked = form.studentIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
                      borderBottom: "1px solid var(--divider)", cursor: "pointer",
                      background: checked ? "var(--accent-bg)" : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          studentIds: checked ? f.studentIds.filter((x) => x !== s.id) : [...f.studentIds, s.id],
                        }))
                      }
                    />
                    <span style={{ fontSize: 13 }}>{s.name}</span>
                    <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{s.studentNo}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
