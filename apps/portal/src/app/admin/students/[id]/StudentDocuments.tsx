"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Trash2, Upload } from "lucide-react";
import {
  type StudentDocumentRow,
  addStudentDocument,
  fileUrl,
  getStudentDocuments,
  removeStudentDocument,
  uploadFile,
} from "@/lib/api";

// The design's six fixed "Documents on file" slots, in order (design line 3049-3056).
const SLOTS: { key: string; label: string }[] = [
  { key: "transcript", label: "Unofficial transcript" },
  { key: "id-card", label: "Student ID card" },
  { key: "enrollment", label: "Enrollment verification" },
  { key: "immunization", label: "Immunization record" },
  { key: "aid-letter", label: "Financial aid award letter" },
  { key: "passport", label: "Passport / visa" },
];

export function StudentDocuments({ studentId }: { studentId: string }) {
  const [docs, setDocs] = useState<StudentDocumentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getStudentDocuments(studentId).then(setDocs).catch((e: Error) => setErr(e.message));
  }, [studentId]);
  useEffect(load, [load]);

  const bySlot = (slot: string) => docs.find((d) => d.slot === slot);
  const others = docs.filter((d) => !SLOTS.some((s) => s.key === d.slot));

  async function upload(slot: string, file: File) {
    setErr(null);
    setBusy(slot + file.name);
    try {
      const up = await uploadFile(file);
      await addStudentDocument(studentId, { slot, url: up.url, name: up.name });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setErr(null);
    try {
      await removeStudentDocument(id);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove document.");
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <FileText size={16} color="var(--daust-navy)" />
        <p className="h1" style={{ fontSize: 16, margin: 0 }}>Documents on file</p>
        <span className="muted" style={{ fontSize: 12 }}>· PDF only</span>
      </div>
      {err && <div className="badge overdue" style={{ padding: "8px 12px", margin: "8px 0" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
        {SLOTS.map((s) => (
          <DocSlot key={s.key} label={s.label} doc={bySlot(s.key)} busy={busy === s.key} onUpload={(f) => upload(s.key, f)} onRemove={remove} />
        ))}
      </div>

      <div style={{ marginTop: 18, border: "1.5px dashed var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Other documents</div>
            <div className="muted" style={{ fontSize: 12 }}>Add any number of additional PDFs.</div>
          </div>
          <AddFilesButton onFiles={(files) => files.forEach((f) => upload("other", f))} />
        </div>
        {others.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {others.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <FileText size={14} color="var(--fg3)" />
                <a href={fileUrl(d.url)} target="_blank" rel="noreferrer" style={{ flex: 1, color: "var(--daust-navy)" }}>{d.name ?? "Document"}</a>
                <button onClick={() => remove(d.id)} title="Remove" style={{ padding: "3px 8px", fontSize: 12 }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocSlot({
  label,
  doc,
  busy,
  onUpload,
  onRemove,
}: {
  label: string;
  doc: StudentDocumentRow | undefined;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const present = !!doc;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 10, background: present ? "rgba(46,125,82,0.06)" : "var(--surface)" }}>
      <span style={{ width: 34, height: 34, borderRadius: 8, background: present ? "rgba(46,125,82,0.14)" : "var(--bg-subtle)", color: present ? "var(--success)" : "var(--fg3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {present ? <Check size={16} /> : <FileText size={16} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {present ? (
            <a href={fileUrl(doc!.url)} target="_blank" rel="noreferrer" style={{ color: "var(--success)" }}>{doc!.name ?? "Uploaded"}</a>
          ) : busy ? "Uploading…" : "Upload PDF"}
        </div>
      </div>
      {present ? (
        <button onClick={() => onRemove(doc!.id)} title="Remove" style={{ padding: "4px 8px" }}><Trash2 size={13} /></button>
      ) : (
        <button onClick={() => ref.current?.click()} title="Upload" style={{ padding: "4px 8px" }}><Upload size={14} /></button>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
      />
    </div>
  );
}

function AddFilesButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="primary" onClick={() => ref.current?.click()} style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Upload size={14} /> Add files
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) onFiles(files); e.target.value = ""; }}
      />
    </>
  );
}
