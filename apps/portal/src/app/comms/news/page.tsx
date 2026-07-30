"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  type AdminNewsArticle,
  createNews,
  deleteNews,
  fileUrl,
  getNewsAdmin,
  updateNews,
  uploadFile,
} from "@/lib/api";
import { Badge, Button, Card, Input, Toggle } from "@/components/ui";

interface Form {
  id?: string;
  slug: string;
  titleEn: string; titleFr: string;
  excerptEn: string; excerptFr: string;
  bodyEn: string; bodyFr: string;
  imageUrl: string; tag: string; date: string;
  published: boolean; sortOrder: number;
}

const BLANK: Form = {
  slug: "", titleEn: "", titleFr: "", excerptEn: "", excerptFr: "",
  bodyEn: "", bodyFr: "", imageUrl: "", tag: "", date: "", published: false, sortOrder: 0,
};

function fromArticle(a: AdminNewsArticle): Form {
  return {
    id: a.id, slug: a.slug, titleEn: a.titleEn, titleFr: a.titleFr,
    excerptEn: a.excerptEn, excerptFr: a.excerptFr, bodyEn: a.bodyEn, bodyFr: a.bodyFr,
    imageUrl: a.imageUrl ?? "", tag: a.tag ?? "", date: a.date, published: a.published, sortOrder: a.sortOrder,
  };
}

const ta: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--fg1)", fontSize: 13.5, fontFamily: "var(--font-body)", resize: "vertical", lineHeight: 1.5,
};

export default function NewsPage() {
  const [list, setList] = useState<AdminNewsArticle[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => getNewsAdmin().then(setList).catch((e) => setErr(e instanceof Error ? e.message : "Failed to load."));
  useEffect(() => { load(); }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    if (!form.titleEn.trim() || !form.titleFr.trim()) { setErr("Title in English and French is required."); return; }
    setBusy(true);
    setErr(null);
    const input = {
      slug: form.slug.trim() || undefined,
      titleEn: form.titleEn, titleFr: form.titleFr,
      excerptEn: form.excerptEn, excerptFr: form.excerptFr,
      bodyEn: form.bodyEn, bodyFr: form.bodyFr,
      imageUrl: form.imageUrl || null, tag: form.tag || null,
      date: form.date, published: form.published, sortOrder: form.sortOrder,
    };
    try {
      if (form.id) await updateNews(form.id, input);
      else await createNews(input);
      setForm(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try { const { url } = await uploadFile(file); set("imageUrl", url); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); } finally { setUploading(false); }
  }

  async function remove(id: string) {
    await deleteNews(id).catch((e) => setErr(e instanceof Error ? e.message : "Delete failed."));
    setConfirmDel(null);
    await load();
  }

  if (err && !list) return <Card><div style={{ color: "var(--error-500)" }}>{err}</div></Card>;
  if (!list) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;

  // ---- Editor form ----
  if (form) {
    const Bi = (label: string, ek: keyof Form, fk: keyof Form, multiline?: boolean) => (
      <div>
        <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", marginBottom: 4 }}>EN</div>
            {multiline ? <textarea rows={6} value={form[ek] as string} onChange={(e) => set(ek, e.target.value as Form[typeof ek])} style={ta} /> : <Input value={form[ek] as string} onChange={(v) => set(ek, v as Form[typeof ek])} />}</div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", marginBottom: 4 }}>FR</div>
            {multiline ? <textarea rows={6} value={form[fk] as string} onChange={(e) => set(fk, e.target.value as Form[typeof fk])} style={ta} /> : <Input value={form[fk] as string} onChange={(v) => set(fk, v as Form[typeof fk])} />}</div>
        </div>
      </div>
    );
    return (
      <Card title={form.id ? "Edit article" : "New article"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {err && <div style={{ color: "var(--error-500)", fontSize: 13 }}>{err}</div>}
          {Bi("Title", "titleEn", "titleFr")}
          {Bi("Excerpt (shown on the card)", "excerptEn", "excerptFr", true)}
          {Bi("Body", "bodyEn", "bodyFr", true)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Date (as shown)</div><Input value={form.date} onChange={(v) => set("date", v)} /></div>
            <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Tag (optional)</div><Input value={form.tag} onChange={(v) => set("tag", v)} /></div>
            <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Order</div><Input value={String(form.sortOrder)} onChange={(v) => set("sortOrder", Number(v) || 0)} /></div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Cover image</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {form.imageUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(form.imageUrl)} alt="cover" style={{ width: 160, height: 90, objectFit: "cover", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
                : <div style={{ width: 160, height: 90, borderRadius: "var(--radius-md)", border: "1px dashed var(--border)", background: "var(--surface-2)" }} />}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)", cursor: "pointer" }}>
                <Upload size={14} />{uploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onImage(e.target.files?.[0])} disabled={uploading} />
              </label>
              {form.imageUrl && <button onClick={() => set("imageUrl", "")} style={{ fontSize: 12, color: "var(--fg3)", background: "none", border: "none", cursor: "pointer" }}>Remove</button>}
            </div>
          </div>
          <Toggle checked={form.published} onChange={(v) => set("published", v)} label="Published (visible on the public site)" />
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" icon={<Check size={15} />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save article"}</Button>
            <Button variant="secondary" onClick={() => { setForm(null); setErr(null); }}>Cancel</Button>
          </div>
        </div>
      </Card>
    );
  }

  // ---- List view ----
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex" }}>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setErr(null); setForm({ ...BLANK }); }}>New article</Button>
      </div>
      {err && <div style={{ color: "var(--error-500)", fontSize: 13 }}>{err}</div>}
      {list.length === 0 && <Card><div style={{ color: "var(--fg3)", padding: "20px 0", textAlign: "center" }}>No articles yet. Create one — the public News section falls back to the built-in cards until an article is published.</div></Card>}
      {list.map((a) => (
        <Card key={a.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14.5 }}>{a.titleEn}</strong>
                {a.published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
                <span style={{ fontSize: 12, color: "var(--fg3)" }}>{a.date} · /{a.slug}</span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg2)" }}>{a.excerptEn}</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => { setErr(null); setForm(fromArticle(a)); }}>Edit</Button>
            {confirmDel === a.id ? (
              <>
                <Button variant="danger" size="sm" onClick={() => remove(a.id)}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Cancel</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirmDel(a.id)}>Delete</Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
