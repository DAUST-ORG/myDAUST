"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardList,
  FileQuestion,
  FileText,
  File as FileIcon,
  Link2,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, EmptyState, IconButton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CourseTabs, courseTitle } from "../CourseTabs";
import {
  type TeachingSection,
  fileUrl,
  getTeaching,
  uploadFile,
} from "@/lib/api";
import {
  type MaterialCategory,
  type SectionMaterial,
  createSectionMaterial,
  deleteSectionMaterial,
  getSectionMaterials,
  reorderSectionMaterials,
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
  const [moving, setMoving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SectionMaterial | null>(null);

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

  async function move(material: SectionMaterial, dir: -1 | 1) {
    setMoving(material.id);
    setMsg(null);
    try {
      const sameCategory = materials.filter((m) => m.category === material.category);
      const idx = sameCategory.findIndex((m) => m.id === material.id);
      const neighbor = sameCategory[idx + dir];
      if (!neighbor) return;
      const next = [...materials];
      const a = next.findIndex((m) => m.id === material.id);
      const b = next.findIndex((m) => m.id === neighbor.id);
      const itemA = next[a];
      const itemB = next[b];
      if (!itemA || !itemB) return;
      next[a] = itemB;
      next[b] = itemA;
      setMaterials(await reorderSectionMaterials(sectionId, next.map((m) => m.id)));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setMoving(null);
    }
  }

  async function remove() {
    if (!removing) return;
    await deleteSectionMaterial(removing.id);
    setRemoving(null);
    load();
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
                      {files.map((m, i) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: 9,
                            padding: "6px 8px 6px 13px",
                          }}
                        >
                          <a
                            href={m.fileUrl ? fileUrl(m.fileUrl) : "#"}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flex: 1,
                              minWidth: 0,
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
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <IconButton
                              label={`Move ${m.fileName ?? m.title} up`}
                              disabled={moving !== null || i === 0}
                              onClick={() => move(m, -1)}
                            >
                              <ArrowUp size={13} />
                            </IconButton>
                            <IconButton
                              label={`Move ${m.fileName ?? m.title} down`}
                              disabled={moving !== null || i === files.length - 1}
                              onClick={() => move(m, 1)}
                            >
                              <ArrowDown size={13} />
                            </IconButton>
                            <IconButton
                              label={`Remove ${m.fileName ?? m.title}`}
                              tone="danger"
                              disabled={moving !== null}
                              onClick={() => setRemoving(m)}
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove material from course?"
          confirmLabel="Remove material"
          message={
            <>
              Remove <strong>{removing.fileName ?? removing.title}</strong> from
              this course? Students will lose access immediately, and this
              course material record cannot be restored in the portal.
            </>
          }
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
