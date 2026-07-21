"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  FileQuestion,
  FileText,
  File as FileIcon,
  Link2,
  Upload,
} from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { CourseTabs, courseTitle } from "../CourseTabs";
import { type TeachingSection, getTeaching, uploadFile } from "@/lib/api";
import {
  type MaterialCategory,
  type SectionMaterial,
  createSectionMaterial,
  getSectionMaterials,
} from "@/lib/api-faculty";

const CATEGORIES: { key: MaterialCategory; label: string; icon: typeof FileText }[] = [
  { key: "syllabus", label: "Syllabus", icon: FileText },
  { key: "lecture_notes", label: "Lecture Notes", icon: BookOpen },
  { key: "assignments", label: "Assignments", icon: ClipboardList },
  { key: "quizzes", label: "Quizzes", icon: FileQuestion },
  { key: "resources", label: "Resources", icon: Link2 },
];

export default function FacultyMaterials() {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [materials, setMaterials] = useState<SectionMaterial[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState<MaterialCategory | null>(null);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setMsg(e.message));
  }, []);

  const load = useCallback(() => {
    if (!sectionId) return;
    getSectionMaterials(sectionId).then(setMaterials).catch((e: Error) => setMsg(e.message));
  }, [sectionId]);
  useEffect(load, [load]);

  const section = sections?.find((s) => s.id === sectionId);

  async function upload(category: MaterialCategory, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(category);
    setMsg(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        await createSectionMaterial(sectionId, {
          title: file.name,
          kind: "Document",
          category,
          fileUrl: uploaded.url,
          fileName: file.name,
        });
      }
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Course Materials</h1>
      <p className="muted" style={{ margin: "2px 0 22px", fontSize: 14 }}>
        Upload documents for your students · organized by category
      </p>

      {msg && <p className="card" style={{ color: "var(--danger)" }}>{msg}</p>}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <>
          <CourseTabs sections={sections} value={sectionId} onChange={setSectionId} />
          <p style={{ fontSize: 13, color: "var(--fg3)", marginBottom: 16 }}>
            {section ? courseTitle(section) : ""}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CATEGORIES.map((cat) => {
              const files = materials.filter((m) => m.category === cat.key);
              const Icon = cat.icon;
              return (
                <Card key={cat.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: "var(--accent-bg)",
                        color: "var(--daust-navy)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{cat.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg3)" }}>
                        {files.length} file{files.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <label
                      className="sis-btn"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "9px 18px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--daust-navy)",
                        color: "#fff",
                        fontSize: 13.5,
                        fontWeight: 600,
                        cursor: uploading ? "progress" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Upload size={14} />
                      {uploading === cat.key ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        multiple
                        disabled={uploading !== null}
                        onChange={(e) => upload(cat.key, e.target.files)}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                      {files.map((m) => (
                        <a
                          key={m.id}
                          href={m.fileUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: 9,
                            padding: "9px 13px",
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          <FileIcon size={15} color="var(--daust-navy)" />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 12.5,
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {m.fileName ?? m.title}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
