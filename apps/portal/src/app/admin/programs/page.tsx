"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderPlus, Pencil } from "lucide-react";
import { type AdminPrograms, type ProgramRow, getAdminPrograms } from "@/lib/api";
import { Button, PageHeader } from "@/components/ui";
import { ProgramEditModal } from "./ProgramEditModal";

const PROGRAM_COLORS = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f", "#7c3aed", "#0f7d8c"];

export default function AdminProgramsPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminPrograms | null>(null);
  const [progEdit, setProgEdit] = useState<null | "new" | ProgramRow>(null);

  function load() {
    getAdminPrograms().then(setData).catch(() => {});
  }
  useEffect(() => load(), []);

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Programs & Curriculum"
        subtitle="Degree programs and required course plans."
        actions={<Button variant="primary" icon={<FolderPlus size={15} />} onClick={() => setProgEdit("new")}>New program</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {(data?.programs ?? []).map((p, i) => (
          <div
            key={p.code}
            className="card lift"
            style={{ margin: 0, cursor: "pointer" }}
            onClick={() => router.push(`/admin/programs/${encodeURIComponent(p.code)}`)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: p.color ?? PROGRAM_COLORS[i % PROGRAM_COLORS.length], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{p.code}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{p.degree ? `${p.degree} · ` : ""}{p.department}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setProgEdit(p); }}
                title="Edit program"
                style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--fg3)", flexShrink: 0 }}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/admin/programs/${encodeURIComponent(p.code)}?tab=students`); }}
                title="View students"
                style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>{p.students}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>students →</div>
              </button>
              {p.tuition != null && <span className="muted" style={{ fontSize: 12.5 }}>{p.tuition.toLocaleString("fr-FR")} FCFA/yr</span>}
            </div>
          </div>
        ))}
        {(data?.programs ?? []).length === 0 && <p className="muted">No programs yet.</p>}
      </div>

      {progEdit && (
        <ProgramEditModal
          mode={progEdit === "new" ? "create" : "edit"}
          program={progEdit === "new" ? undefined : progEdit}
          departments={data?.departments ?? []}
          onClose={() => setProgEdit(null)}
          onSaved={() => { setProgEdit(null); load(); }}
        />
      )}
    </>
  );
}
