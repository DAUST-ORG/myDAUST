"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Pencil, Trash2, X } from "lucide-react";
import {
  type AdminStudent,
  type GuardianRow,
  createGuardian,
  deleteGuardian,
  getAdminStudents,
  getGuardians,
  resendGuardianInvite,
  setGuardianChildren,
  updateGuardian,
} from "@/lib/api";
import {
  Avatar, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, SearchInput,
} from "@/components/ui";

export default function ParentsPage() {
  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", relation: "", studentIds: [] as string[] });
  const [editing, setEditing] = useState<{ id: string; fullName: string; email: string; studentIds: string[] } | null>(null);
  const [removing, setRemoving] = useState<GuardianRow | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getGuardians().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    getAdminStudents().then(setStudents).catch(() => setStudents([]));
  }, [load]);

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

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
      const created = await createGuardian({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        studentIds: form.studentIds,
        relation: form.relation.trim() || undefined,
      });
      setNote(
        `Parent account created for ${form.fullName.trim()} · ID ${created.id}. A password-setup email has been sent to ${form.email.trim()}.`,
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

  async function saveEdit() {
    if (!editing || !editing.fullName.trim() || !editing.email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateGuardian(editing.id, { fullName: editing.fullName.trim(), email: editing.email.trim() });
      await setGuardianChildren(editing.id, editing.studentIds);
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the parent account.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await deleteGuardian(removing.id);
      setRemoving(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the parent account.");
      setRemoving(null);
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
      {note && (
        <div
          className="card"
          style={{ color: "var(--success-500)", display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}
        >
          <span>{note}</span>
          <IconButton label="Dismiss notice" onClick={() => setNote(null)}><X size={15} /></IconButton>
        </div>
      )}

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
                    <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={g.name} size={28} />
                      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                        <span style={{ fontWeight: 600 }}>{g.name}</span>
                        <span className="muted" style={{ fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" }}>{g.id}</span>
                      </span>
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
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {g.status !== "active" && (
                        <Button size="sm" icon={<Mail size={12} />} onClick={() => resend(g.id, g.email)}>
                          Resend invite
                        </Button>
                      )}
                      <IconButton
                        label="Edit parent"
                        onClick={() => setEditing({ id: g.id, fullName: g.name, email: g.email, studentIds: g.children.map((c) => c.studentId) })}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton label="Delete parent" tone="danger" onClick={() => setRemoving(g)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </span>
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
            <ChildChecklist
              students={students}
              selected={form.studentIds}
              onToggle={(id) => setForm((f) => ({ ...f, studentIds: toggleId(f.studentIds, id) }))}
            />
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Edit parent"
          width={560}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button
                variant="navy"
                onClick={saveEdit}
                disabled={busy || !editing.fullName.trim() || !editing.email.trim()}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Full name">
              <Input value={editing.fullName} onChange={(v) => setEditing((e) => (e ? { ...e, fullName: v } : e))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={editing.email} onChange={(v) => setEditing((e) => (e ? { ...e, email: v } : e))} />
            </Field>
            <ChildChecklist
              students={students}
              selected={editing.studentIds}
              onToggle={(id) => setEditing((e) => (e ? { ...e, studentIds: toggleId(e.studentIds, id) } : e))}
            />
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          open
          onClose={() => setRemoving(null)}
          title="Delete parent"
          width={480}
          footer={
            <>
              <Button onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={remove} disabled={busy}>
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Delete the guardian account for <strong>{removing.name}</strong> ({removing.email})? This revokes their access
            to the assigned student record(s). This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}

function ChildChecklist({
  students,
  selected,
  onToggle,
}: {
  students: AdminStudent[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n
      ? students.filter(
          (s) =>
            s.name.toLowerCase().includes(n) ||
            s.studentNo.toLowerCase().includes(n) ||
            s.program.toLowerCase().includes(n),
        )
      : students;
    return list.slice(0, 60);
  }, [students, q]);

  return (
    <>
      <Field label={`Assign students (${selected.length} selected)`}>
        <SearchInput value={q} onChange={setQ} placeholder="Filter students by name, ID or program…" />
      </Field>
      <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
        {options.length === 0 && <p className="muted" style={{ padding: 12, margin: 0, fontSize: 13 }}>No students match your filter.</p>}
        {options.map((s) => {
          const checked = selected.includes(s.id);
          return (
            <label
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
                borderBottom: "1px solid var(--divider)", cursor: "pointer",
                background: checked ? "var(--accent-bg)" : undefined,
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(s.id)} />
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{s.studentNo} · {s.program}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
