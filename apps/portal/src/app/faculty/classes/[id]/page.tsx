"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, ClipboardList, FileText, LineChart, Pin, Table2, Users } from "lucide-react";
import { Panel } from "@/components/Panel";
import {
  type FacultyClass,
  type SectionAssignments,
  getFacultyOverview,
  getSectionAssignments,
  uploadFile,
} from "@/lib/api";
import {
  type SectionMaterial,
  type SectionPost,
  createSectionMaterial,
  createSectionPost,
  getSectionMaterials,
  getSectionPosts,
  toggleSectionMaterial,
} from "@/lib/api-faculty";

const TABS = ["Overview", "Materials", "Posts"] as const;
type Tab = (typeof TABS)[number];

const KINDS = ["Document", "Slides", "Video", "Link"];

const KIND_STYLES: Record<string, { bg: string; fg: string }> = {
  Document: { bg: "#fbeae8", fg: "#a83024" },
  Slides: { bg: "#fdeede", fg: "#c4660f" },
  Video: { bg: "#eaf0f8", fg: "var(--daust-navy)" },
  Link: { bg: "var(--gray-50, #f4f6f8)", fg: "#6c7884" },
};

export default function FacultyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<FacultyClass | null>(null);
  const [asg, setAsg] = useState<SectionAssignments | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    getFacultyOverview().then((o) => setCls(o.classes.find((c) => c.sectionId === id) ?? null)).catch(() => {});
    getSectionAssignments(id).then(setAsg).catch(() => {});
  }, [id]);

  if (!cls) return <p className="muted">Loading…</p>;

  const tools: { label: string; icon: typeof Users; color: string; href: string }[] = [
    { label: "Gradebook", icon: Table2, color: "var(--daust-navy)", href: `/faculty/gradebook/${id}` },
    { label: "Attendance", icon: CalendarCheck, color: "var(--daust-orange)", href: `/faculty/attendance/${id}` },
    { label: "Assignments", icon: ClipboardList, color: "var(--daust-navy-700)", href: `/faculty/assignments/${id}` },
    { label: "Roster", icon: Users, color: "#2e7d52", href: `/faculty/roster` },
    { label: "Insights", icon: LineChart, color: "#6c7884", href: `/faculty/insights?section=${id}` },
  ];

  return (
    <>
      <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-lg)", marginBottom: 20 }}>
        <div style={{ background: `linear-gradient(135deg, ${cls.color} 0%, ${cls.color}cc 100%)`, padding: "24px 28px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.78)", fontWeight: 600 }}>
              {cls.term} · {cls.days} {cls.startTime}–{cls.endTime} · {cls.room ?? "TBA"}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, marginTop: 8 }}>
              {cls.code} <span style={{ fontWeight: 500, fontSize: 22, opacity: 0.9 }}>— {cls.title}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 32 }}>
            {[["Students", String(cls.students)], ["Attendance", cls.attendance !== null ? `${cls.attendance}%` : "—"], ["To grade", String(cls.ungraded)]].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>{v}</div>
                <div style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "rgba(255,255,255,.72)", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--divider)", marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2.5px solid var(--daust-orange)" : "2.5px solid transparent",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13.5,
              color: tab === t ? "var(--fg1)" : "var(--fg3)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
          <Panel title="Recent activity" pad="4px 20px">
            {!asg || asg.assignments.length === 0 ? (
              <p className="muted" style={{ padding: "14px 0" }}>No assignments posted yet.</p>
            ) : (
              asg.assignments.map((a, i) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderBottom: i < asg.assignments.length - 1 ? "1px solid var(--divider)" : "none" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${cls.color} 14%, white)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={17} color={cls.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.submitted}/{asg.enrolled} submitted · {a.graded} graded</div>
                  </div>
                  {a.graded < a.submitted ? <span className="badge pending">Needs grading</span> : <span className="badge completed">Up to date</span>}
                </div>
              ))
            )}
          </Panel>

          <Panel title="Quick actions">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {tools.map((t) => (
                <button
                  key={t.label}
                  onClick={() => router.push(t.href)}
                  style={{ border: "1px solid var(--gray-100)", background: "var(--surface, #fff)", borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${t.color} 15%, white)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 9 }}>
                    <t.icon size={17} color={t.color} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.label}</div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "Materials" && <MaterialsTab sectionId={id} />}
      {tab === "Posts" && <PostsTab sectionId={id} students={cls.students} code={cls.code} />}
    </>
  );
}

function MaterialsTab({ sectionId }: { sectionId: string }) {
  const [mats, setMats] = useState<SectionMaterial[] | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("Document");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getSectionMaterials(sectionId).then(setMats).catch((e: Error) => setErr(e.message));
  }, [sectionId]);
  useEffect(load, [load]);

  async function onFilePicked(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await uploadFile(file);
      await createSectionMaterial(sectionId, {
        title: file.name.replace(/\.[^.]+$/, ""),
        kind: kindFromFileName(file.name),
        fileUrl: up.url,
        fileName: up.name,
      });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addByTitle() {
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createSectionMaterial(sectionId, { title: title.trim(), kind });
      setTitle("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(m: SectionMaterial) {
    setMats((prev) => prev?.map((x) => (x.id === m.id ? { ...x, published: !x.published } : x)) ?? prev);
    try {
      await toggleSectionMaterial(m.id);
    } catch (e) {
      setErr((e as Error).message);
      load();
    }
  }

  if (!mats) return <p className="muted">Loading…</p>;

  return (
    <>
      <input ref={fileRef} type="file" hidden onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)} />
      {err && <p className="card" style={{ color: "var(--danger)" }}>{err}</p>}
      <Panel
        title={`Course materials · ${mats.length}`}
        action={busy ? "Uploading…" : "+ Upload"}
        onAction={() => !busy && fileRef.current?.click()}
        pad="4px 20px 14px"
      >
        {mats.length === 0 && <div className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No materials yet.</div>}
        {mats.map((m, i) => {
          const chip = KIND_STYLES[m.kind] ?? KIND_STYLES.Link!;
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 0", borderBottom: i < mats.length - 1 ? "1px solid var(--divider)" : "none" }}>
              <div style={{ width: 34, height: 40, borderRadius: 6, background: chip.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 8.5, color: chip.fg, textTransform: "uppercase" }}>
                  {m.kind.slice(0, 5)}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--fg1)" }}>{m.title}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {m.kind}
                  {m.fileName ? ` · ${m.fileName}` : ""} · added {new Date(m.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: m.published ? "#1f6e46" : "var(--fg3)" }}>
                {m.published ? "Published" : "Draft"}
              </span>
              <button
                onClick={() => toggle(m)}
                aria-label={m.published ? "Unpublish" : "Publish"}
                style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: m.published ? "#2e7d52" : "#d7dee6", position: "relative", transition: "background .15s", padding: 0 }}
              >
                <span style={{ position: "absolute", top: 3, left: m.published ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "var(--surface, #fff)", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
              </button>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 0 4px", borderTop: mats.length > 0 ? "1px solid var(--divider)" : "none" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add by title (e.g. lecture link, reading)"
            style={{ flex: 1, border: "1px solid var(--gray-100)", borderRadius: 9, padding: "9px 12px", fontSize: 13 }}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: "9px 10px", borderRadius: 9 }}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button disabled={busy || !title.trim()} onClick={addByTitle}>Add</button>
        </div>
      </Panel>
    </>
  );
}

function kindFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ppt", "pptx", "key"].includes(ext)) return "Slides";
  if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "Video";
  return "Document";
}

function PostsTab({ sectionId, students, code }: { sectionId: string; students: number; code: string }) {
  const [posts, setPosts] = useState<SectionPost[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState<string | null>(null);

  const load = useCallback(() => {
    getSectionPosts(sectionId).then(setPosts).catch((e: Error) => setErr(e.message));
  }, [sectionId]);
  useEffect(load, [load]);

  async function post() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createSectionPost(sectionId, { title: title.trim(), body: body.trim() });
      setJustPosted(created.id);
      setTitle("");
      setBody("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20, alignItems: "start" }}>
      <Panel title="New announcement">
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Posts go to all {students} students in {code}.
        </div>
        {err && <p style={{ color: "var(--danger)", fontSize: 12.5 }}>{err}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={{ width: "100%", border: "1px solid var(--gray-100)", borderRadius: 9, padding: "11px 13px", fontSize: 13.5, fontWeight: 600, marginBottom: 10, boxSizing: "border-box" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message to the class…"
          rows={4}
          style={{ width: "100%", border: "1px solid var(--gray-100)", borderRadius: 9, padding: "11px 13px", fontSize: 13.5, resize: "vertical", boxSizing: "border-box", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            className="primary"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={post}
            style={{ background: "var(--daust-orange)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
          >
            Post to class
          </button>
        </div>
      </Panel>

      <Panel title={`Posted · ${posts?.length ?? 0}`} pad="4px 20px 14px">
        {!posts && <p className="muted" style={{ padding: "14px 0" }}>Loading…</p>}
        {posts?.length === 0 && <div className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No posts yet.</div>}
        {posts?.map((p, i) => (
          <div key={p.id} style={{ padding: "14px 0", borderBottom: i < posts.length - 1 ? "1px solid var(--divider)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {p.pinned && <Pin size={14} color="var(--daust-orange)" />}
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "var(--fg1)" }}>{p.title}</span>
              {p.id === justPosted && <span className="badge completed">Sent</span>}
              <span className="muted" style={{ marginLeft: "auto", fontSize: 11.5, whiteSpace: "nowrap" }}>
                {new Date(p.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            {p.body && <div style={{ fontSize: 13, color: "var(--fg2)", marginTop: 5, lineHeight: 1.5 }}>{p.body}</div>}
            {p.author && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>by {p.author}</div>}
          </div>
        ))}
      </Panel>
    </div>
  );
}
