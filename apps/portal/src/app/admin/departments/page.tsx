"use client";

import { useCallback, useEffect, useState } from "react";
import { type DepartmentRow, getDepartments, upsertDepartment } from "@/lib/api";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput } from "@/components/ui";

export default function DepartmentsPage() {
  const [rows, setRows] = useState<DepartmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<DepartmentRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

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

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

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
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Filter departments…" width={240} />
            <Button variant="primary" onClick={() => setEditing({})}>New department</Button>
          </>
        }
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <EmptyState title="No departments yet" />}
      {rows && rows.length > 0 && visible.length === 0 && <EmptyState title="No departments match" />}

      {visible.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr><th>Code</th><th>Department</th><th>Chair</th><th style={{ textAlign: "right" }}>Programs</th><th style={{ textAlign: "right" }}>Courses</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id} className="sis-row">
                  <td style={{ fontWeight: 700 }}>{d.code}</td>
                  <td>{d.name}</td>
                  <td>{d.head ?? <span className="muted">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{d.programs}</td>
                  <td style={{ textAlign: "right" }}>{d.courses}</td>
                  <td><Button size="sm" onClick={() => setEditing(d)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? "Edit department" : "New department"}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={save} disabled={busy || !editing.code || !editing.name}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Code"><Input value={editing.code ?? ""} onChange={(v) => setEditing((e) => ({ ...e, code: v }))} /></Field>
            <Field label="Name"><Input value={editing.name ?? ""} onChange={(v) => setEditing((e) => ({ ...e, name: v }))} /></Field>
            <Field label="Head" hint="Department chair (free text)."><Input value={editing.head ?? ""} onChange={(v) => setEditing((e) => ({ ...e, head: v }))} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
