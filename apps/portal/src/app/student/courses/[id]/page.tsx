"use client";

import { Download, FileText, Folder } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type CourseDetail,
  type StudentMaterial,
  fileUrl,
  getCourseDetail,
  getMySectionMaterials,
} from "@/lib/api";

const TABS = ["Overview", "Materials", "Assignments", "Grade"] as const;

const MATERIAL_GROUPS: { key: string; label: string }[] = [
  { key: "syllabus", label: "Syllabus" },
  { key: "lecture_notes", label: "Lecture notes" },
  { key: "assignments", label: "Assignments" },
  { key: "quizzes", label: "Quizzes" },
  { key: "resources", label: "Resources" },
];
type Tab = (typeof TABS)[number];

const STATUS_BADGE: Record<string, string> = {
  assigned: "pending",
  submitted: "partial",
  graded: "completed",
};

function MaterialLinks({ materials }: { materials: StudentMaterial[] }) {
  return materials.map((material) => (
    <a
      key={material.id}
      href={fileUrl(material.fileUrl)}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "9px 0",
        borderTop: "1px solid var(--divider)",
        color: "inherit",
      }}
    >
      <FileText size={15} />
      <span style={{ flex: 1, fontSize: 13.5 }}>{material.title}</span>
      <Download size={14} />
    </a>
  ));
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [err, setErr] = useState<string | null>(null);
  const [materials, setMaterials] = useState<StudentMaterial[] | null>(null);
  const [materialsErr, setMaterialsErr] = useState<string | null>(null);

  useEffect(() => {
    getCourseDetail(id)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    setMaterials(null);
    setMaterialsErr(null);
    getMySectionMaterials(id)
      .then(setMaterials)
      .catch((e: Error) => setMaterialsErr(e.message));
  }, [id]);

  if (err)
    return (
      <p className="card" style={{ color: "var(--bad)" }}>
        {err}
      </p>
    );
  if (!data) return <p className="muted">Loading…</p>;
  const o = data.overview;

  return (
    <>
      <p className="eyebrow">
        <Link href="/student/schedule">← Schedule</Link>
      </p>
      <h1 className="page-title">
        {o.courseCode} — {o.title}
      </h1>
      <p className="muted" style={{ marginTop: -8 }}>
        {o.term} · {o.instructor ?? "TBA"} · {o.schedule} · {o.room ?? "—"}
      </p>

      <div
        className="tabs"
        style={{ display: "flex", gap: 6, margin: "14px 0" }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "primary" : ""}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="card">
          <div className="row">
            <div className="kpi">
              <div className="label">Credits</div>
              <div className="value">{o.credits}</div>
            </div>
            <div className="kpi">
              <div className="label">Status</div>
              <div className="value" style={{ textTransform: "capitalize" }}>
                {o.status}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Current grade</div>
              <div className="value">{o.grade ?? "—"}</div>
            </div>
          </div>
          <p style={{ marginTop: 12 }}>
            {o.description ?? "No course description provided."}
          </p>
          {o.prerequisites.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Prerequisites: {o.prerequisites.join(", ")}
            </p>
          )}
        </div>
      )}

      {tab === "Materials" && (
        <div className="card">
          {materialsErr ? (
            <p role="alert" style={{ color: "var(--error-500)", margin: 0 }}>
              {materialsErr}
            </p>
          ) : materials === null ? (
            <p role="status" className="muted" style={{ margin: 0 }}>
              Loading materials…
            </p>
          ) : materials.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Your instructor has not posted any materials for this course yet.
            </p>
          ) : (
            MATERIAL_GROUPS.filter((group) =>
              materials.some((material) => material.category === group.key),
            ).map((group) => {
              const categoryMaterials = materials.filter(
                (material) => material.category === group.key,
              );
              const unfiled = categoryMaterials.filter(
                (material) => !material.folderId,
              );
              const folderNames = new Map<string, string>();
              for (const material of categoryMaterials) {
                if (material.folder)
                  folderNames.set(material.folder.id, material.folder.name);
              }
              const visibleFolders = [...folderNames.entries()].sort((a, b) =>
                a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
              );
              return (
                <div key={group.key} style={{ marginBottom: 22 }}>
                  <p className="eyebrow" style={{ marginBottom: 8 }}>
                    {group.label}
                  </p>
                  <MaterialLinks materials={unfiled} />
                  {visibleFolders.map(([folderId, folderName]) => {
                    const folderMaterials = categoryMaterials.filter(
                      (material) => material.folderId === folderId,
                    );
                    return (
                      <section
                        key={folderId}
                        aria-label={`${group.label}: ${folderName}`}
                        style={{
                          marginTop: 12,
                          paddingLeft: 14,
                          borderLeft: "2px solid var(--border)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            paddingBottom: 6,
                            color: "var(--daust-navy)",
                            fontWeight: 650,
                            fontSize: 13,
                          }}
                        >
                          <Folder size={15} />
                          {folderName}
                        </div>
                        <MaterialLinks materials={folderMaterials} />
                      </section>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "Assignments" && (
        <div className="card">
          {data.assignments.length === 0 ? (
            <p className="muted">No assignments posted yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Due</th>
                  <th>Weight</th>
                  <th>Status</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.assignmentId}>
                    <td>
                      <strong>{a.title}</strong>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{a.type}</td>
                    <td>
                      {new Date(a.dueDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>{a.weight}%</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status]}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.score !== null ? `${a.score}/${a.maxPoints}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Submit work from the{" "}
            <Link href="/student/assignments">Assignments</Link> hub.
          </p>
        </div>
      )}

      {tab === "Grade" && (
        <div className="card">
          <p className="h1" style={{ fontSize: 16 }}>
            Graded work
          </p>
          {data.assignments.filter((a) => a.status === "graded").length ===
          0 ? (
            <p className="muted">No graded items yet.</p>
          ) : (
            data.assignments
              .filter((a) => a.status === "graded")
              .map((a) => (
                <div
                  key={a.assignmentId}
                  style={{
                    borderTop: "1px solid var(--divider)",
                    padding: "10px 0",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <strong>{a.title}</strong>
                    <span className="badge completed">
                      {a.score}/{a.maxPoints}
                    </span>
                  </div>
                  {a.feedback && (
                    <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {a.feedback}
                    </p>
                  )}
                </div>
              ))
          )}
          <p style={{ marginTop: 12 }}>
            Final course grade: <strong>{o.grade ?? "in progress"}</strong>
          </p>
        </div>
      )}
    </>
  );
}
