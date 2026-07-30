"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, RotateCcw, Rocket, Save, Trash2, Upload } from "lucide-react";
import {
  buildContent,
  DEFAULT_IMAGES,
  defaultCollections,
  EMPTY_SITE_OVERRIDES,
  type FacultyItem,
  flattenSiteText,
  SITE_IMAGE_SLOTS,
  SITE_SECTION_LABELS,
  type SiteOverrides,
  type VentureItem,
} from "@mydaust/shared";
import { getSiteDraft, publishSite, previewSite, saveSiteDraft, uploadFile, fileUrl } from "@/lib/api";
import { Button, Card, Input, SearchInput, Toggle } from "@/components/ui";

// Default (localized) copy, flattened to { path: value } — the CMS shows these and stores only diffs.
const EN = flattenSiteText(buildContent("en"));
const FR = flattenSiteText(buildContent("fr"));
const ALL_PATHS = Object.keys(EN);

function normalize(o: Partial<SiteOverrides> | null | undefined): SiteOverrides {
  return {
    text: { en: { ...(o?.text?.en ?? {}) }, fr: { ...(o?.text?.fr ?? {}) } },
    images: { ...(o?.images ?? {}) },
    hidden: [...(o?.hidden ?? [])],
    collections: { ...(o?.collections ?? {}) },
  };
}

/** Where the public site lives, derived from the portal host (no build-time env needed). */
function vitrineOrigin(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.host;
  if (h.startsWith("localhost")) return "http://localhost:3001";
  if (h.includes("azt.dev")) return "https://daust.azt.dev";
  return "https://daust.net";
}

// --- Shared draft state: load, edit, save, preview, publish ---
export function useDraft() {
  const [ov, setOvState] = useState<SiteOverrides>(EMPTY_SITE_OVERRIDES);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "publish" | "preview">(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getSiteDraft()
      .then((d) => {
        setOvState(normalize(d.overrides));
        setSavedAt(d.updatedAt);
        setPublishedAt(d.publishedAt);
        setLoaded(true);
      })
      .catch((e) => {
        setMsg(e instanceof Error ? e.message : "Failed to load content.");
        setLoaded(true);
      });
  }, []);

  const setOv = useCallback((updater: (prev: SiteOverrides) => SiteOverrides) => {
    setOvState((p) => updater(p));
    setDirty(true);
    setMsg(null);
  }, []);

  const save = useCallback(async () => {
    setBusy("save");
    setMsg(null);
    try {
      const r = await saveSiteDraft(ov);
      setSavedAt(r.updatedAt);
      setDirty(false);
      setMsg("Draft saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }, [ov]);

  const publish = useCallback(async () => {
    setBusy("publish");
    setMsg(null);
    try {
      if (dirty) await saveSiteDraft(ov);
      const r = await publishSite();
      setPublishedAt(r.publishedAt);
      setDirty(false);
      setMsg("Published — the changes are now live.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(null);
    }
  }, [ov, dirty]);

  const preview = useCallback(async () => {
    setBusy("preview");
    setMsg(null);
    try {
      if (dirty) await saveSiteDraft(ov);
      const { token } = await previewSite();
      window.open(`${vitrineOrigin()}/?preview=${token}`, "_blank", "noopener");
      setDirty(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }, [ov, dirty]);

  return { ov, setOv, loaded, dirty, busy, publishedAt, savedAt, msg, save, publish, preview };
}

type Draft = ReturnType<typeof useDraft>;

function when(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Sticky Save / Preview / Publish bar shared by every CMS screen. */
export function PublishBar({ draft }: { draft: Draft }) {
  const { dirty, busy, save, preview, publish, savedAt, publishedAt, msg } = draft;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", background: "var(--bg)", borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
      <div style={{ fontSize: 12.5, color: "var(--fg3)" }}>
        {dirty ? "Unsaved changes" : `Saved ${when(savedAt)}`} · Live: {when(publishedAt)}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
        <Button variant="secondary" icon={<Eye size={15} />} onClick={preview} disabled={busy !== null}>
          {busy === "preview" ? "Opening…" : "Preview"}
        </Button>
        <Button variant="secondary" icon={<Save size={15} />} onClick={save} disabled={busy !== null || !dirty}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </Button>
        <Button variant="primary" icon={<Rocket size={15} />} onClick={publish} disabled={busy !== null}>
          {busy === "publish" ? "Publishing…" : "Publish"}
        </Button>
      </div>
      {msg && <div style={{ flexBasis: "100%", fontSize: 12.5, color: "var(--fg2)" }}>{msg}</div>}
    </div>
  );
}

function labelFor(path: string): string {
  const rest = path.split(".").slice(1);
  return rest.length ? rest.join(" · ") : path;
}

function isMultiline(path: string, value: string): boolean {
  return value.length > 70 || /desc|bio|answer|quote|body|sub|p1|p2|long|excerpt|tagline|note/i.test(path);
}

function groupsFor(only?: string[], exclude?: string[]) {
  const map = new Map<string, string[]>();
  for (const path of ALL_PATHS) {
    const top = path.split(".")[0]!;
    if (only && !only.includes(top)) continue;
    if (exclude && exclude.includes(top)) continue;
    if (!map.has(top)) map.set(top, []);
    map.get(top)!.push(path);
  }
  return [...map.entries()].map(([key, paths]) => ({ key, label: SITE_SECTION_LABELS[key] ?? key, paths }));
}

function Bilingual({ path, ov, setOv }: { path: string; ov: SiteOverrides; setOv: Draft["setOv"] }) {
  const set = (lang: "en" | "fr", value: string) =>
    setOv((prev) => {
      const next = normalize(prev);
      const def = (lang === "en" ? EN : FR)[path] ?? "";
      if (value === def) delete next.text[lang][path];
      else next.text[lang][path] = value;
      return next;
    });
  const enVal = ov.text.en[path] ?? EN[path] ?? "";
  const frVal = ov.text.fr[path] ?? FR[path] ?? "";
  const multi = isMultiline(path, EN[path] ?? "");
  const overridden = ov.text.en[path] !== undefined || ov.text.fr[path] !== undefined;

  const ta = (v: string, on: (s: string) => void): React.ReactNode => (
    <textarea
      value={v}
      onChange={(e) => on(e.target.value)}
      rows={Math.min(6, Math.max(2, Math.ceil((v.length || 1) / 60)))}
      style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg1)", fontSize: 13.5, fontFamily: "var(--font-body)", resize: "vertical", lineHeight: 1.5 }}
    />
  );

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--divider)" }}>
      <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
        {labelFor(path)}
        {overridden && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".04em" }}>edited</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", marginBottom: 4 }}>EN</div>
          {multi ? ta(enVal, (s) => set("en", s)) : <Input value={enVal} onChange={(s) => set("en", s)} />}
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", marginBottom: 4 }}>FR</div>
          {multi ? ta(frVal, (s) => set("fr", s)) : <Input value={frVal} onChange={(s) => set("fr", s)} />}
        </div>
      </div>
    </div>
  );
}

/** The generic text editor — grouped, searchable bilingual fields. Reused by /site and /assistant. */
export function SiteEditor({ draft, only, exclude }: { draft: Draft; only?: string[]; exclude?: string[] }) {
  const { ov, setOv, loaded } = draft;
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupsFor(only, exclude), [only, exclude]);
  const query = q.trim().toLowerCase();
  const match = (path: string) => !query || path.toLowerCase().includes(query) || (EN[path] ?? "").toLowerCase().includes(query);

  if (!loaded) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SearchInput value={q} onChange={setQ} placeholder="Search fields or text…" />
      {groups.map(({ key, label, paths }) => {
        const shown = paths.filter(match);
        if (shown.length === 0) return null;
        return (
          <details key={key} open={!!query || key === "tx"}>
            <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, padding: "10px 0", listStyle: "revert" }}>
              {label} <span style={{ color: "var(--fg3)", fontWeight: 400, fontSize: 12.5 }}>({shown.length})</span>
            </summary>
            <Card>
              {shown.map((path) => (
                <Bilingual key={path} path={path} ov={ov} setOv={setOv} />
              ))}
            </Card>
          </details>
        );
      })}
    </div>
  );
}

/** Image slot editor — upload replaces a slot; each slot falls back to its default. */
export function MediaEditor({ draft }: { draft: Draft }) {
  const { ov, setOv, loaded } = draft;
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setImage = (key: string, url: string) =>
    setOv((prev) => {
      const next = normalize(prev);
      if (url) next.images[key] = url;
      else delete next.images[key];
      return next;
    });

  async function onFile(key: string, file: File | undefined) {
    if (!file) return;
    setUploading(key);
    setErr(null);
    try {
      const { url } = await uploadFile(file);
      setImage(key, url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  if (!loaded) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
      {err && <div style={{ gridColumn: "1/-1", color: "var(--error-500)", fontSize: 13 }}>{err}</div>}
      {SITE_IMAGE_SLOTS.map(({ key, label }) => {
        const current = ov.images[key] ?? DEFAULT_IMAGES[key]!;
        const overridden = ov.images[key] !== undefined;
        return (
          <Card key={key} pad>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg2)", marginBottom: 8 }}>
              {label} {overridden && <span style={{ color: "var(--daust-orange)", fontSize: 10.5, fontWeight: 700 }}>· CUSTOM</span>}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(current)} alt={label} style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)", cursor: "pointer" }}>
                <Upload size={14} />
                {uploading === key ? "Uploading…" : "Replace"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onFile(key, e.target.files?.[0])} disabled={uploading !== null} />
              </label>
              {overridden && (
                <button onClick={() => setImage(key, "")} style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg3)", background: "none", border: "none", cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** Section show/hide toggles for the homepage. */
const HIDEABLE: { key: string; label: string }[] = [
  { key: "recognition", label: "Recognition strip" },
  { key: "news", label: "News & Stories" },
  { key: "heroStats", label: "Hero stats band" },
  { key: "programs", label: "Programs" },
  { key: "impact", label: "Impact stats" },
  { key: "spotlight", label: "Research spotlight" },
  { key: "why", label: "Why DAUST (pillars)" },
];

export function SectionToggles({ draft }: { draft: Draft }) {
  const { ov, setOv, loaded } = draft;
  const hidden = new Set(ov.hidden);
  const toggle = (key: string, visible: boolean) =>
    setOv((prev) => {
      const next = normalize(prev);
      const set = new Set(next.hidden);
      if (visible) set.delete(key);
      else set.add(key);
      next.hidden = [...set];
      return next;
    });
  if (!loaded) return null;
  return (
    <Card title="Homepage sections">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {HIDEABLE.map(({ key, label }) => (
          <Toggle key={key} checked={!hidden.has(key)} onChange={(v) => toggle(key, v)} label={label} />
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Collection editors: startups (ventures) and faculty (with photo upload).
// ---------------------------------------------------------------------------

const taStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--fg1)", fontSize: 13.5, fontFamily: "var(--font-body)", resize: "vertical", lineHeight: 1.5,
};
const enLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", marginBottom: 4 };

function BiInput({ label, value, onChange, multiline }: { label: string; value: { en: string; fr: string }; onChange: (v: { en: string; fr: string }) => void; multiline?: boolean }) {
  const render = (v: string, on: (s: string) => void) =>
    multiline ? <textarea value={v} onChange={(e) => on(e.target.value)} rows={3} style={taStyle} /> : <Input value={v} onChange={on} />;
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={enLabel}>EN</div>{render(value.en, (s) => onChange({ ...value, en: s }))}</div>
        <div><div style={enLabel}>FR</div>{render(value.fr, (s) => onChange({ ...value, fr: s }))}</div>
      </div>
    </div>
  );
}

function ItemFrame({ title, index, total, onUp, onDown, onRemove, children }: { title: string; index: number; total: number; onUp: () => void; onDown: () => void; onRemove: () => void; children: React.ReactNode }) {
  const iconBtn: React.CSSProperties = { display: "inline-flex", padding: 6, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--fg2)" };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <strong style={{ fontSize: 13.5 }}>{title || "Untitled"}</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button title="Move up" style={iconBtn} onClick={onUp} disabled={index === 0}><ArrowUp size={14} /></button>
          <button title="Move down" style={iconBtn} onClick={onDown} disabled={index === total - 1}><ArrowDown size={14} /></button>
          <button title="Remove" style={{ ...iconBtn, color: "var(--error-500)" }} onClick={onRemove}><Trash2 size={14} /></button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </Card>
  );
}

function CollectionToolbar({ label, onAdd, overridden, onReset }: { label: string; onAdd: () => void; overridden: boolean; onReset: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Button variant="secondary" icon={<Plus size={15} />} onClick={onAdd}>{label}</Button>
      {overridden && <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={onReset}>Reset to defaults</Button>}
    </div>
  );
}

export function VenturesEditor({ draft }: { draft: Draft }) {
  const { ov, setOv, loaded } = draft;
  const items = (ov.collections?.ventures ?? defaultCollections().ventures) as VentureItem[];
  const overridden = ov.collections?.ventures !== undefined;
  const set = (next: VentureItem[]) => setOv((prev) => ({ ...prev, collections: { ...(prev.collections ?? {}), ventures: next } }));
  const reset = () => setOv((prev) => { const c = { ...(prev.collections ?? {}) }; delete c.ventures; return { ...prev, collections: c }; });
  const update = (i: number, patch: Partial<VentureItem>) => set(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const a = [...items]; [a[i], a[j]] = [a[j]!, a[i]!]; set(a); };
  const add = () => set([...items, { name: "New startup", href: "https://", tag: { en: "", fr: "" }, desc: { en: "", fr: "" }, cta: { en: "Learn more →", fr: "En savoir plus →" } }]);

  if (!loaded) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CollectionToolbar label="Add startup" onAdd={add} overridden={overridden} onReset={reset} />
      {items.map((it, i) => (
        <ItemFrame key={i} title={it.name} index={i} total={items.length} onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => set(items.filter((_, idx) => idx !== i))}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Name</div><Input value={it.name} onChange={(v) => update(i, { name: v })} /></div>
            <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Link (URL)</div><Input value={it.href} onChange={(v) => update(i, { href: v })} /></div>
          </div>
          <BiInput label="Tag" value={it.tag} onChange={(v) => update(i, { tag: v })} />
          <BiInput label="Description" value={it.desc} onChange={(v) => update(i, { desc: v })} multiline />
          <BiInput label="Link label" value={it.cta} onChange={(v) => update(i, { cta: v })} />
        </ItemFrame>
      ))}
    </div>
  );
}

export function FacultyEditor({ draft }: { draft: Draft }) {
  const { ov, setOv, loaded } = draft;
  const [uploading, setUploading] = useState<number | null>(null);
  const items = (ov.collections?.faculty ?? defaultCollections().faculty) as FacultyItem[];
  const overridden = ov.collections?.faculty !== undefined;
  const set = (next: FacultyItem[]) => setOv((prev) => ({ ...prev, collections: { ...(prev.collections ?? {}), faculty: next } }));
  const reset = () => setOv((prev) => { const c = { ...(prev.collections ?? {}) }; delete c.faculty; return { ...prev, collections: c }; });
  const update = (i: number, patch: Partial<FacultyItem>) => set(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const a = [...items]; [a[i], a[j]] = [a[j]!, a[i]!]; set(a); };
  const add = () => set([...items, { name: "New faculty member", initials: "NN", image: "", scholar: "", title: { en: "", fr: "" }, dept: { en: "", fr: "" }, bio: { en: "", fr: "" }, interests: { en: "", fr: "" } }]);

  async function onPhoto(i: number, file: File | undefined) {
    if (!file) return;
    setUploading(i);
    try { const { url } = await uploadFile(file); update(i, { image: url }); } catch { /* surfaced by PublishBar on save */ } finally { setUploading(null); }
  }

  if (!loaded) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CollectionToolbar label="Add faculty" onAdd={add} overridden={overridden} onReset={reset} />
      {items.map((it, i) => (
        <ItemFrame key={i} title={it.name} index={i} total={items.length} onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => set(items.filter((_, idx) => idx !== i))}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 96, flexShrink: 0 }}>
              {it.image
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(it.image)} alt={it.name} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
                : <div style={{ width: 96, height: 96, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{it.initials}</div>}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--daust-navy)", cursor: "pointer", marginTop: 8 }}>
                <Upload size={13} />{uploading === i ? "Uploading…" : "Photo"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPhoto(i, e.target.files?.[0])} disabled={uploading !== null} />
              </label>
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
              <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Name</div><Input value={it.name} onChange={(v) => update(i, { name: v })} /></div>
              <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Initials</div><Input value={it.initials} onChange={(v) => update(i, { initials: v })} /></div>
            </div>
          </div>
          <BiInput label="Title" value={it.title} onChange={(v) => update(i, { title: v })} />
          <BiInput label="Department" value={it.dept} onChange={(v) => update(i, { dept: v })} />
          <BiInput label="Research interests (comma-separated)" value={it.interests} onChange={(v) => update(i, { interests: v })} />
          <BiInput label="Bio" value={it.bio} onChange={(v) => update(i, { bio: v })} multiline />
          <div><div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Publications / profile link (URL)</div><Input value={it.scholar} onChange={(v) => update(i, { scholar: v })} /></div>
        </ItemFrame>
      ))}
    </div>
  );
}
