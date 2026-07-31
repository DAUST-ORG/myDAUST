"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Globe, Pencil, Upload } from "lucide-react";
import type { AdminFacultyItem } from "@mydaust/shared";
import {
  fileUrl,
  getFacultyList,
  setFacultyVisibility,
  updateFacultyProfile,
  uploadFile,
} from "@/lib/api";
import { Badge, Button, Card, Input, Toggle } from "@/components/ui";

interface Form {
  firstName: string;
  lastName: string;
  title: string;
  dept: string;
  bio: string;
  interests: string; // comma-separated
  scholar: string;
  photoUrl: string;
}

const taStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--fg1)", fontSize: 13.5, fontFamily: "var(--font-body)", resize: "vertical", lineHeight: 1.5,
};

function toForm(a: AdminFacultyItem): Form {
  const p = a.profile;
  return {
    firstName: a.firstName,
    lastName: a.lastName,
    title: p?.title ?? "",
    dept: p?.dept ?? "",
    bio: p?.bio ?? "",
    interests: p?.interests.join(", ") ?? "",
    scholar: p?.scholar ?? "",
    photoUrl: p?.photoUrl ?? "",
  };
}

function fieldLabel(text: string) {
  return <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>{text}</div>;
}

export default function FacultyManager() {
  const [list, setList] = useState<AdminFacultyItem[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => getFacultyList().then(setList).catch((e) => setErr(e instanceof Error ? e.message : "Failed to load faculty."));
  useEffect(() => { load(); }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  function openEditor(a: AdminFacultyItem) {
    setErr(null);
    setEditId(a.id);
    setForm(toForm(a));
  }

  async function toggleVisible(a: AdminFacultyItem, visible: boolean) {
    setToggling(a.id);
    setErr(null);
    try {
      await setFacultyVisibility(a.id, visible);
      setList((ls) => ls?.map((x) => (x.id === a.id ? { ...x, publicProfile: visible } : x)) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setToggling(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const { url } = await uploadFile(file);
      set("photoUrl", url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form) return;
    if (!form.firstName.trim() || !form.lastName.trim()) { setErr("First and last name are required."); return; }
    setBusy(true);
    setErr(null);
    try {
      await updateFacultyProfile(editId!, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        title: form.title.trim() || null,
        dept: form.dept.trim() || null,
        bio: form.bio.trim() || null,
        interests: form.interests.split(",").map((s) => s.trim()).filter(Boolean),
        scholar: form.scholar.trim() || null,
        photoUrl: form.photoUrl.trim() || null,
      });
      setEditId(null);
      setForm(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (err && !list) return <Card><div style={{ color: "var(--error-500)" }}>{err}</div></Card>;
  if (!list) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.6 }}>
          Every professor with a <strong>faculty</strong> role on the platform appears here automatically.
          Use the toggle to show or hide them on the public site, and edit their profile (including their photo).
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--fg3)" }}>
            {list.filter((a) => a.publicProfile).length} of {list.length} visible on the site.
          </div>
        </div>
      </Card>
      {err && <div style={{ color: "var(--error-500)", fontSize: 13 }}>{err}</div>}
      {list.length === 0 && (
        <Card><div style={{ color: "var(--fg3)", padding: "20px 0", textAlign: "center" }}>No faculty accounts yet. The public Faculty page falls back to its built-in list until someone is toggled on.</div></Card>
      )}
      {list.map((a) => {
        const isEditing = editId === a.id;
        return (
          <Card key={a.id}>
            {!isEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {a.profile?.photoUrl
                    ? // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(a.profile.photoUrl)} alt={`${a.firstName} ${a.lastName}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{`${a.firstName.charAt(0)}${a.lastName.charAt(0)}`.toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14.5 }}>{a.firstName} {a.lastName}</strong>
                    {a.publicProfile ? <Badge tone="success">Public</Badge> : <Badge tone="neutral">Private</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}>{a.email}</div>
                  {a.profile && <div style={{ fontSize: 12.5, color: "var(--fg2)", marginTop: 4 }}>{[a.profile.title, a.profile.dept].filter(Boolean).join(" · ") || "—"}</div>}
                </div>
                <Toggle
                  checked={a.publicProfile}
                  disabled={toggling === a.id}
                  onChange={(v) => toggleVisible(a, v)}
                  label={toggling === a.id ? "Saving…" : "Public on site"}
                />
                <Button variant="secondary" size="sm" icon={isEditing ? <ChevronDown size={14} /> : <Pencil size={14} />} onClick={() => openEditor(a)}>Edit</Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Pencil size={15} />
                  <strong style={{ fontSize: 14.5 }}>Edit profile — {a.firstName} {a.lastName}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg3)" }}>{a.email}</span>
                </div>
                <div style={{ display: "flex", gap: 18 }}>
                  <div style={{ width: 96, flexShrink: 0 }}>
                    {form?.photoUrl
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(form.photoUrl)} alt="profile" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
                      : <div style={{ width: 96, height: 96, borderRadius: "var(--radius-md)", border: "1px dashed var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg3)", fontSize: 12 }}>No photo</div>}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--daust-navy)", cursor: "pointer", marginTop: 8 }}>
                      <Upload size={13} />{uploading ? "Uploading…" : "Photo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPhoto(e.target.files?.[0])} disabled={uploading} />
                    </label>
                    {form?.photoUrl && (
                      <button onClick={() => set("photoUrl", "")} style={{ display: "block", fontSize: 11.5, color: "var(--fg3)", background: "none", border: "none", cursor: "pointer", padding: "4px 0 0" }}>Remove</button>
                    )}
                  </div>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      {fieldLabel("First name")}
                      <Input value={form?.firstName ?? ""} onChange={(v) => set("firstName", v)} />
                    </div>
                    <div>
                      {fieldLabel("Last name")}
                      <Input value={form?.lastName ?? ""} onChange={(v) => set("lastName", v)} />
                    </div>
                  </div>
                </div>
                <div>
                  {fieldLabel("Title (e.g. Associate Professor of Mechanical Engineering)")}
                  <Input value={form?.title ?? ""} onChange={(v) => set("title", v)} />
                </div>
                <div>
                  {fieldLabel("Department / research center")}
                  <Input value={form?.dept ?? ""} onChange={(v) => set("dept", v)} />
                </div>
                <div>
                  {fieldLabel("Research interests (comma-separated)")}
                  <textarea rows={2} value={form?.interests ?? ""} onChange={(e) => set("interests", e.target.value)} style={taStyle} />
                </div>
                <div>
                  {fieldLabel("Bio")}
                  <textarea rows={4} value={form?.bio ?? ""} onChange={(e) => set("bio", e.target.value)} style={taStyle} />
                </div>
                <div>
                  {fieldLabel("Publications / research profile link (URL)")}
                  <Input value={form?.scholar ?? ""} onChange={(v) => set("scholar", v)} placeholder="https://…" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Toggle
                    checked={a.publicProfile}
                    disabled={toggling === a.id}
                    onChange={(v) => toggleVisible(a, v)}
                    label={toggling === a.id ? "Saving…" : "Public on site"}
                  />
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg3)" }}><Globe size={12} style={{ verticalAlign: "-2px" }} /> Toggling is saved instantly</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Button variant="primary" icon={<Check size={15} />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
                  <Button variant="secondary" onClick={() => { setEditId(null); setForm(null); setErr(null); }}>Cancel</Button>
                  <Button variant="ghost" icon={<ChevronRight size={14} />} onClick={() => { setEditId(null); setForm(null); setErr(null); }}>Close</Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
