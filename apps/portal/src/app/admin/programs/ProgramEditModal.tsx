"use client";

import { useState } from "react";
import { type AdminPrograms, type ProgramRow, createProgram, updateProgram } from "@/lib/api";
import { Field, Modal, Select } from "@/components/ui";

const DEGREES = ["B.Sc.", "M.Sc.", "MBA", "Cert.", "Ph.D."];
const COLORS = ["#153b6a", "#1d4a82", "#2e7d52", "#c4660f", "#7c3aed", "#0f7d8c", "#ed8425", "#4d5965"];

export function ProgramEditModal({
  mode,
  program,
  departments,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  program?: ProgramRow;
  departments: AdminPrograms["departments"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(program?.code ?? "");
  const [name, setName] = useState(program?.name ?? "");
  const [departmentId, setDepartmentId] = useState(
    departments.find((d) => d.name === program?.department)?.id ?? departments[0]?.id ?? "",
  );
  const [degree, setDegree] = useState(program?.degree ?? "B.Sc.");
  const [school, setSchool] = useState(program?.school ?? "");
  const [tuition, setTuition] = useState(program?.tuition != null ? String(program.tuition) : "");
  const [color, setColor] = useState(program?.color ?? COLORS[0]!);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if ((mode === "create" && !code.trim()) || !name.trim() || !departmentId) {
      setErr("Code, name and department are required.");
      return;
    }
    const fields = {
      name: name.trim(),
      departmentId,
      degree: degree || null,
      school: school.trim() || null,
      tuition: tuition.trim() === "" ? null : Number(tuition),
      color,
    };
    setBusy(true);
    try {
      if (mode === "create") await createProgram({ code: code.trim().toUpperCase(), ...fields });
      else await updateProgram(program!.code, fields);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save program.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "New program" : `Edit ${program?.code}`}
      width={480}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Create program" : "Save changes"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <Field label="Code">
            {mode === "create" ? (
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CS" />
            ) : (
              <input value={code} readOnly style={{ background: "var(--bg-subtle)", color: "var(--fg3)" }} />
            )}
          </Field>
          <Field label="Program name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science" /></Field>
        </div>
        <Field label="Department">
          <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Degree"><Select value={degree} onChange={setDegree} options={DEGREES} /></Field>
          <Field label="School" hint="Optional"><input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Engineering" /></Field>
        </div>
        <Field label="Annual tuition (FCFA)" hint="Reference only — billing is unchanged">
          <input type="number" min={0} value={tuition} onChange={(e) => setTuition(e.target.value)} placeholder="2975000" />
        </Field>
        <Field label="Accent color">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{ width: 28, height: 28, borderRadius: 8, background: c, border: color === c ? "2px solid var(--fg1)" : "2px solid transparent", cursor: "pointer", padding: 0 }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
