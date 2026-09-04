"use client";

import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  File as FileIcon,
  FileQuestion,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CourseTabs, courseTitle } from "../CourseTabs";
import {
  type TeachingSection,
  fileUrl,
  getTeaching,
  uploadFile,
} from "@/lib/api";
import {
  facultyMaterialsHref,
  resolveFacultyMaterialsSectionId,
} from "@/lib/faculty-materials-routing";
import {
  type MaterialCategory,
  type SectionMaterial,
  type SectionMaterialFolder,
  createSectionMaterial,
  createSectionMaterialFolder,
  deleteSectionMaterial,
  deleteSectionMaterialFolder,
  getSectionMaterialFolders,
  getSectionMaterials,
  moveSectionMaterialToFolder,
  renameSectionMaterialFolder,
  reorderSectionMaterials,
  toggleSectionMaterial,
} from "@/lib/api-faculty";

const CATEGORIES: {
  key: MaterialCategory;
  label: string;
  icon: typeof FileText;
}[] = [
  { key: "syllabus", label: "Syllabus", icon: FileText },
  { key: "lecture_notes", label: "Lecture Notes", icon: BookOpen },
  { key: "assignments", label: "Assignments", icon: ClipboardList },
  { key: "quizzes", label: "Quizzes", icon: FileQuestion },
  { key: "resources", label: "Resources", icon: Link2 },
];

function MaterialUploadControl({
  categoryLabel,
  locationLabel,
  busy,
  disabled,
  compact,
  onFiles,
}: {
  categoryLabel: string;
  locationLabel: string;
  busy: boolean;
  disabled: boolean;
  compact: boolean;
  onFiles: (files: FileList | null) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accessibleName = `Upload files to ${locationLabel} in ${categoryLabel}`;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="sis-btn"
        aria-label={accessibleName}
        aria-busy={busy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: compact ? "6px 12px" : "8px 15px",
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--daust-navy)",
          fontSize: compact ? 12 : 13,
          fontWeight: 650,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled && !busy ? 0.55 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <Upload size={13} />
        {busy ? "Uploading…" : "Upload files"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        disabled={disabled}
        aria-label={accessibleName}
        onChange={(event) => {
          const input = event.currentTarget;
          void onFiles(input.files).finally(() => {
            input.value = "";
          });
        }}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />
    </span>
  );
}

function FacultyMaterialsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSectionId = searchParams.get("section");
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [materials, setMaterials] = useState<SectionMaterial[]>([]);
  const [folders, setFolders] = useState<SectionMaterialFolder[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SectionMaterial | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [newFolderCategory, setNewFolderCategory] =
    useState<MaterialCategory | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<SectionMaterialFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingFolder, setDeletingFolder] =
    useState<SectionMaterialFolder | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);

  useEffect(() => {
    getTeaching()
      .then(setSections)
      .catch((error: Error) => setMsg(error.message));
  }, []);

  const sectionId = useMemo(() => {
    return resolveFacultyMaterialsSectionId(sections ?? [], requestedSectionId);
  }, [requestedSectionId, sections]);
  const activeSectionIdRef = useRef(sectionId);
  const loadTokenRef = useRef(0);
  activeSectionIdRef.current = sectionId;

  useEffect(() => {
    if (sectionId && requestedSectionId !== sectionId) {
      router.replace(facultyMaterialsHref(sectionId), { scroll: false });
    }
  }, [requestedSectionId, router, sectionId]);

  const load = useCallback(async (targetSectionId: string) => {
    if (!targetSectionId) return;
    const token = ++loadTokenRef.current;
    try {
      const [nextMaterials, nextFolders] = await Promise.all([
        getSectionMaterials(targetSectionId),
        getSectionMaterialFolders(targetSectionId),
      ]);
      if (
        activeSectionIdRef.current !== targetSectionId ||
        loadTokenRef.current !== token
      ) {
        return;
      }
      setMaterials(nextMaterials);
      setFolders(nextFolders);
    } catch (error) {
      if (
        activeSectionIdRef.current === targetSectionId &&
        loadTokenRef.current === token
      ) {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    setMaterials([]);
    setFolders([]);
    setMsg(null);
    setNewFolderCategory(null);
    setRenaming(null);
    setRemoving(null);
    setDeletingFolder(null);
    if (sectionId) {
      load(sectionId).catch((error: Error) =>
        reportSectionError(sectionId, error),
      );
    }
  }, [load, sectionId]);

  const section = sections?.find((candidate) => candidate.id === sectionId);

  function foldersFor(category: MaterialCategory): SectionMaterialFolder[] {
    return folders
      .filter((folder) => folder.category === category)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }

  function materialsFor(
    category: MaterialCategory,
    folderId: string | null,
  ): SectionMaterial[] {
    return materials.filter(
      (material) =>
        material.category === category && material.folderId === folderId,
    );
  }

  function isActiveSection(targetSectionId: string): boolean {
    return activeSectionIdRef.current === targetSectionId;
  }

  function reportSectionError(targetSectionId: string, error: unknown) {
    if (isActiveSection(targetSectionId)) {
      setMsg((error as Error).message);
    }
  }

  async function refresh(targetSectionId: string) {
    // A mutation may finish after the teacher has switched courses. Do not let
    // that old course start a newer request token and invalidate the active
    // course's in-flight load.
    if (!isActiveSection(targetSectionId)) return;
    try {
      await load(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    }
  }

  async function togglePublished(material: SectionMaterial) {
    const targetSectionId = material.sectionId;
    setPublishing(material.id);
    setMsg(null);
    try {
      await toggleSectionMaterial(material.id);
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setPublishing(null);
    }
  }

  async function upload(
    category: MaterialCategory,
    folderId: string | null,
    files: FileList | null,
  ) {
    if (!files || files.length === 0 || !sectionId) return;
    const targetSectionId = sectionId;
    const uploadKey = `${category}:${folderId ?? "unfiled"}`;
    setUploading(uploadKey);
    setMsg(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        await createSectionMaterial(targetSectionId, {
          title: file.name,
          kind: "Document",
          category,
          ...(folderId ? { folderId } : {}),
          fileUrl: uploaded.url,
          fileName: file.name,
        });
      }
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setUploading(null);
    }
  }

  async function reorder(material: SectionMaterial, direction: -1 | 1) {
    const group = materialsFor(material.category, material.folderId);
    const index = group.findIndex((candidate) => candidate.id === material.id);
    const neighbor = group[index + direction];
    if (!neighbor || !sectionId) return;
    const targetSectionId = sectionId;
    const orderedIds = group.map((candidate) => candidate.id);
    orderedIds[index] = neighbor.id;
    orderedIds[index + direction] = material.id;
    setMoving(material.id);
    setMsg(null);
    try {
      await reorderSectionMaterials(
        targetSectionId,
        material.category,
        material.folderId,
        orderedIds,
      );
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setMoving(null);
    }
  }

  async function moveToFolder(
    material: SectionMaterial,
    folderId: string | null,
  ) {
    const targetSectionId = material.sectionId;
    setMoving(material.id);
    setMsg(null);
    try {
      await moveSectionMaterialToFolder(material.id, folderId);
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setMoving(null);
    }
  }

  async function removeMaterial() {
    if (!removing) return;
    const material = removing;
    const targetSectionId = material.sectionId;
    await deleteSectionMaterial(material.id);
    if (isActiveSection(targetSectionId)) setRemoving(null);
    await refresh(targetSectionId);
  }

  async function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!newFolderCategory || !newFolderName.trim() || !sectionId) return;
    const targetSectionId = sectionId;
    setSavingFolder(true);
    setMsg(null);
    try {
      await createSectionMaterialFolder(targetSectionId, {
        category: newFolderCategory,
        name: newFolderName,
      });
      if (isActiveSection(targetSectionId)) {
        setNewFolderCategory(null);
        setNewFolderName("");
      }
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setSavingFolder(false);
    }
  }

  function beginRename(folder: SectionMaterialFolder) {
    setRenaming(folder);
    setRenameValue(folder.name);
  }

  async function saveRename(event: FormEvent) {
    event.preventDefault();
    if (!renaming || !renameValue.trim()) return;
    const folder = renaming;
    const targetSectionId = folder.sectionId;
    setSavingFolder(true);
    setMsg(null);
    try {
      await renameSectionMaterialFolder(folder.id, renameValue);
      if (isActiveSection(targetSectionId)) {
        setRenaming(null);
        setRenameValue("");
      }
      await refresh(targetSectionId);
    } catch (error) {
      reportSectionError(targetSectionId, error);
    } finally {
      setSavingFolder(false);
    }
  }

  async function removeFolder() {
    if (!deletingFolder) return;
    const folder = deletingFolder;
    const targetSectionId = folder.sectionId;
    await deleteSectionMaterialFolder(folder.id);
    if (isActiveSection(targetSectionId)) setDeletingFolder(null);
    await refresh(targetSectionId);
  }

  function renderUpload(
    category: MaterialCategory,
    folder: SectionMaterialFolder | null,
    compact = false,
  ) {
    const folderId = folder?.id ?? null;
    const uploadKey = `${category}:${folderId ?? "unfiled"}`;
    const categoryLabel =
      CATEGORIES.find((candidate) => candidate.key === category)?.label ??
      category;
    return (
      <MaterialUploadControl
        categoryLabel={categoryLabel}
        locationLabel={folder?.name ?? "Unfiled"}
        busy={uploading === uploadKey}
        disabled={uploading !== null}
        compact={compact}
        onFiles={(files) => upload(category, folderId, files)}
      />
    );
  }

  function renderMaterialGroup(
    category: MaterialCategory,
    folder: SectionMaterialFolder | null,
  ) {
    const group = materialsFor(category, folder?.id ?? null);
    const categoryFolders = foldersFor(category);
    const title = folder?.name ?? "Unfiled";
    const categoryLabel =
      CATEGORIES.find((candidate) => candidate.key === category)?.label ??
      category;
    const isRenaming = folder && renaming?.id === folder.id;
    return (
      <section
        key={folder?.id ?? `${category}:unfiled`}
        aria-label={`${categoryLabel}: ${title}`}
        style={{
          borderTop: "1px solid var(--divider)",
          padding: "13px 0 3px",
          marginTop: 13,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexWrap: "wrap",
          }}
        >
          <Folder
            size={16}
            color={folder ? "var(--daust-navy)" : "var(--fg3)"}
          />
          {isRenaming ? (
            <form
              onSubmit={saveRename}
              style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}
            >
              <input
                autoFocus
                value={renameValue}
                maxLength={80}
                aria-label={`Rename ${folder.name}`}
                onChange={(event) => setRenameValue(event.target.value)}
                style={{ minWidth: 180, flex: 1 }}
              />
              <Button
                type="submit"
                size="sm"
                variant="navy"
                icon={<Check size={14} />}
                disabled={savingFolder || !renameValue.trim()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Cancel rename"
                disabled={savingFolder}
                onClick={() => setRenaming(null)}
              >
                <X size={14} />
              </Button>
            </form>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650 }}>{title}</div>
                <div
                  style={{ fontSize: 11.5, color: "var(--fg3)", marginTop: 1 }}
                >
                  {folder
                    ? `${group.length} file${group.length === 1 ? "" : "s"}`
                    : group.length === 0
                      ? "Files not assigned to a folder"
                      : `${group.length} file${group.length === 1 ? "" : "s"} not assigned to a folder`}
                </div>
              </div>
              {renderUpload(category, folder, true)}
              {folder && (
                <>
                  <IconButton
                    label={`Rename ${folder.name}`}
                    onClick={() => beginRename(folder)}
                  >
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${folder.name}`}
                    tone="danger"
                    onClick={() => setDeletingFolder(folder)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </>
              )}
            </>
          )}
        </div>

        {group.length === 0 ? (
          <p
            className="muted"
            style={{ fontSize: 12.5, margin: "11px 0 4px 25px" }}
          >
            {folder
              ? "This folder is empty."
              : "New uploads can stay here or be placed in a folder."}
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              marginTop: 11,
            }}
          >
            {group.map((material, index) => (
              <div
                key={material.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  padding: "6px 8px 6px 12px",
                  flexWrap: "wrap",
                }}
              >
                <a
                  href={
                    material.fileUrl ? fileUrl(material.fileUrl) : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!material.fileUrl}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    flex: "1 1 220px",
                    minWidth: 0,
                    color: "inherit",
                    textDecoration: "none",
                    pointerEvents: material.fileUrl ? undefined : "none",
                  }}
                >
                  <FileIcon size={15} color="var(--daust-navy)" />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12.5,
                      fontWeight: 550,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {material.fileName ?? material.title}
                  </span>
                </a>
                <select
                  aria-label={`Folder for ${material.fileName ?? material.title}`}
                  value={material.folderId ?? ""}
                  disabled={moving !== null}
                  onChange={(event) =>
                    void moveToFolder(material, event.target.value || null)
                  }
                  style={{
                    fontSize: 12,
                    maxWidth: 160,
                    padding: "5px 25px 5px 9px",
                  }}
                >
                  <option value="">Unfiled</option>
                  {categoryFolders.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <IconButton
                    label={
                      material.published
                        ? `Hide ${material.fileName ?? material.title} from students`
                        : `Show ${material.fileName ?? material.title} to students`
                    }
                    disabled={publishing !== null}
                    onClick={() => void togglePublished(material)}
                  >
                    {material.published ? (
                      <Eye size={13} />
                    ) : (
                      <EyeOff size={13} />
                    )}
                  </IconButton>
                  <IconButton
                    label={`Move ${material.fileName ?? material.title} up`}
                    disabled={moving !== null || index === 0}
                    onClick={() => void reorder(material, -1)}
                  >
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton
                    label={`Move ${material.fileName ?? material.title} down`}
                    disabled={moving !== null || index === group.length - 1}
                    onClick={() => void reorder(material, 1)}
                  >
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton
                    label={`Remove ${material.fileName ?? material.title}`}
                    tone="danger"
                    disabled={moving !== null}
                    onClick={() => setRemoving(material)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title="Course Materials"
        subtitle="Organize PDFs and images into folders, then choose what students can see."
      />

      {msg && (
        <p role="alert" className="card" style={{ color: "var(--danger)" }}>
          {msg}
        </p>
      )}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <>
          <CourseTabs
            sections={sections}
            value={sectionId}
            onChange={(nextSectionId) =>
              router.replace(facultyMaterialsHref(nextSectionId), {
                scroll: false,
              })
            }
          />
          <p style={{ fontSize: 13, color: "var(--fg3)", marginBottom: 16 }}>
            {section ? `${courseTitle(section)} · ${section.term}` : ""}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const categoryMaterials = materials.filter(
                (material) => material.category === category.key,
              );
              const categoryFolders = foldersFor(category.key);
              const addingFolder = newFolderCategory === category.key;
              return (
                <Card key={category.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      flexWrap: "wrap",
                    }}
                  >
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
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {category.label}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--fg3)" }}>
                        {categoryMaterials.length} file
                        {categoryMaterials.length === 1 ? "" : "s"}
                        {categoryFolders.length > 0
                          ? ` · ${categoryFolders.length} folder${categoryFolders.length === 1 ? "" : "s"}`
                          : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<FolderPlus size={14} />}
                      aria-label={`New folder in ${category.label}`}
                      onClick={() => {
                        setNewFolderCategory(
                          addingFolder ? null : category.key,
                        );
                        setNewFolderName("");
                      }}
                    >
                      New folder
                    </Button>
                  </div>

                  {addingFolder && (
                    <form
                      onSubmit={createFolder}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 13,
                        padding: "11px 0",
                        borderTop: "1px solid var(--divider)",
                      }}
                    >
                      <FolderPlus size={16} color="var(--daust-navy)" />
                      <input
                        autoFocus
                        value={newFolderName}
                        maxLength={80}
                        placeholder="Folder name"
                        aria-label={`New folder in ${category.label}`}
                        onChange={(event) =>
                          setNewFolderName(event.target.value)
                        }
                        style={{ minWidth: 180, flex: 1 }}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="navy"
                        disabled={savingFolder || !newFolderName.trim()}
                      >
                        Create
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Cancel new folder"
                        disabled={savingFolder}
                        onClick={() => setNewFolderCategory(null)}
                      >
                        <X size={14} />
                      </Button>
                    </form>
                  )}

                  {renderMaterialGroup(category.key, null)}
                  {categoryFolders.map((folder) =>
                    renderMaterialGroup(category.key, folder),
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
              material record cannot be restored in the portal.
            </>
          }
          onClose={() => setRemoving(null)}
          onConfirm={removeMaterial}
        />
      )}

      {deletingFolder && (
        <ConfirmDialog
          title="Delete folder?"
          confirmLabel="Delete folder"
          message={
            <>
              Delete <strong>{deletingFolder.name}</strong>? Its files will move
              to Unfiled and will keep their current student visibility. No
              uploaded file will be deleted.
            </>
          }
          onClose={() => setDeletingFolder(null)}
          onConfirm={removeFolder}
        />
      )}
    </>
  );
}

export default function FacultyMaterials() {
  return (
    <Suspense fallback={<p className="muted">Loading course materials…</p>}>
      <FacultyMaterialsContent />
    </Suspense>
  );
}
