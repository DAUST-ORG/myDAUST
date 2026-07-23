"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { type DepartmentRow, deleteDepartment, getDepartments, upsertDepartment } from "@/lib/api";
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, SearchInput } from "@/components/ui";

export default function DepartmentsPage() {
  const [rows, setRows] = useState<DepartmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<DepartmentRow> | null>(null);
  const [removing, setRemoving] = useState<DepartmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");

  const load = useCallback(() => {
    getDepartments().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!editing?.code || !editing?.name) return;
    setBusy(true);
    try {
      await upsertDepartment({
        id: editing.id,
        code: editing.code,
        name: editing.name,
        head: editing.head ?? null,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the department.");
    } finally {
      setBusy(false);
    }
  }

  async function addDept() {
    if (!addCode.trim() || !addName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await upsertDepartment({ code: addCode.trim(), name: addName.trim(), head: null });
      setAddCode("");
      setAddName("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the department.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDepartment(removing.id);
      setRemoving(null);
      load();
    } catch (e) {
      // The API refuses while the department still owns programmes or courses.
      setError(e instanceof Error ? e.message : "Could not delete the department.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const needle = q.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (d) =>
      !needle ||
      d.code.toLowerCase().includes(needle) ||
      d.name.toLowerCase().includes(needle) ||
      (d.head ?? "").toLowerCase().includes(needle),
  );

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Departments"
        subtitle="Academic departments, chairs and program counts"
        actions={<SearchInput value={q} onChange={setQ} placeholder="Filter departments…" width={240} />}
      />

      {error && rows && <p className="card" style={{ color: "var(--danger)" }}>{error}</p>}

      {!rows && <p className="muted">Loading…</p>}

      {rows && (
        <Card pad={false}>
          <table>
            <thead>
              <tr><th>Code</th><th>Department</th><th>Chair</th><th style={{ textAlign: "right" }}>Programs</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id} className="sis-row">
                  <td style={{ fontWeight: 700, fontFamily: "ui-monospace, monospace", color: "var(--daust-orange)" }}>{d.code}</td>
                  <td>{d.name}</td>
                  <td>{d.head ?? <span className="muted">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{d.programs}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <IconButton label="Edit department" onClick={() => setEditing(d)}><Pencil size={15} /></IconButton>
                      <IconButton label="Delete department" tone="danger" onClick={() => setRemoving(d)}><Trash2 size={15} /></IconButton>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length > 0 && visible.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>No departments match.</td></tr>
              )}
              <tr style={{ background: "var(--bg-subtle)" }}>
                <td><Input value={addCode} onChange={setAddCode} placeholder="Code" width={100} /></td>
                <td colSpan={3}><Input value={addName} onChange={setAddName} placeholder="New department name" /></td>
                <td>
                  <Button variant="primary" size="sm" disabled={busy || !addCode.trim() || !addName.trim()} onClick={addDept}>Add department</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Edit Department"
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={busy || !editing.code || !editing.name}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Code *"><Input value={editing.code ?? ""} onChange={(v) => setEditing((e) => ({ ...e, code: v }))} /></Field>
            <Field label="Department name *"><Input value={editing.name ?? ""} onChange={(v) => setEditing((e) => ({ ...e, name: v }))} /></Field>
            <Field label="Chair / head"><Input value={editing.head ?? ""} onChange={(v) => setEditing((e) => ({ ...e, head: v }))} /></Field>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          open
          onClose={() => setRemoving(null)}
          title="Delete department"
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
            Delete <strong>{removing.name}</strong> ({removing.code})? This cannot be undone. Departments that still own
            programmes or courses cannot be removed.
          </p>
        </Modal>
      )}
    </>
  );
}
