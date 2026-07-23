"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { type Me, type StaffMember, getMe, getStaff, updateUserRoles } from "@/lib/api";
import { Badge, Button, Card, EmptyState, IconButton, Modal, PageHeader } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  faculty: "Faculty",
  registrar: "Registrar",
  bursar: "Bursar",
  hr: "HR",
  it_admin: "IT Admin",
  admin: "Admin",
};
const KIND_LABEL: Record<string, string> = { faculty: "Faculty", staff: "Staff", parent: "Parent", student: "Student" };
// Roles a person can be granted here; student/parent are backed by their own records.
const ASSIGNABLE = ["faculty", "registrar", "bursar", "hr", "it_admin", "admin"];

export default function RolesPermissionsPage() {
  const [rows, setRows] = useState<StaffMember[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const load = useCallback(() => {
    getStaff().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    getMe().then(setMe).catch(() => {});
  }, [load]);

  const isAdmin = me?.roles.includes("admin") ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles & Permissions"
        subtitle="Role-based access control · staff accounts and the roles each holds."
      />

      {error && <p className="card" style={{ color: "var(--danger)" }}>{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <EmptyState title="No staff accounts" />}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Type</th><th>Roles</th>{isAdmin && <th style={{ textAlign: "right" }}>Actions</th>}</tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="sis-row">
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td className="muted">{s.email}</td>
                    <td>{KIND_LABEL[s.kind] ?? s.kind}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
                        {s.roles.length === 0
                          ? <span className="muted">—</span>
                          : s.roles.map((r) => <Badge key={r} tone="navy">{ROLE_LABEL[r] ?? r}</Badge>)}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: "right" }}>
                        {s.id !== me?.personId && (
                          <IconButton label={`Edit roles for ${s.name}`} onClick={() => setEditing(s)}><Pencil size={15} /></IconButton>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isAdmin && rows && rows.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Role assignment is available to administrators.</p>
      )}

      {editing && (
        <RolesModal
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function RolesModal({ person, onClose, onSaved }: { person: StaffMember; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState<string[]>(person.roles);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      // Keep any non-assignable roles the person already holds (e.g. student/parent).
      const kept = person.roles.filter((r) => !ASSIGNABLE.includes(r));
      await updateUserRoles(person.id, Array.from(new Set([...kept, ...roles.filter((r) => ASSIGNABLE.includes(r))])));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update roles.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Roles — ${person.name}`}
      width={440}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{person.email}</p>
        {ASSIGNABLE.map((r) => (
          <label key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", background: roles.includes(r) ? "var(--accent-bg)" : undefined }}>
            <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{ROLE_LABEL[r] ?? r}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
