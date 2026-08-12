"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/icons";
import { Hover } from "@/components/Hover";
import { ImageSlot } from "@/components/ImageSlot";
import { AiPanel } from "@/components/AiPanel";
import { ApplyModal } from "@/components/ApplyModal";
import { CookieBanner } from "@/components/CookieBanner";
import { buildSiteContent, HIDEABLE_SECTIONS, siteImgMap, type Lang, type PageKey, type PublicFacultyMember, type PublicNewsArticle, type PublicNewsArticleFull, type SiteOverrides, slugify } from "@/lib/content";
import { assetUrl, getNews, getNewsArticle, getPreviewContent, getPublicFaculty, getPublishedContent, submitContact } from "@/lib/api";

const WRAP: React.CSSProperties = { maxWidth: 1240, margin: "0 auto", padding: "0 40px" };

/** Partner logos rendered on the Startups & Partners cards (keyed by venture name). */
const VENTURE_LOGOS: Record<string, string> = {
  "Caytu Robotics": "/images/caytu-logo.png",
  SolarBox: "/images/solarbox-logo.png",
  Jawji: "/images/jawji-logo.png",
};

/* ---- shared bits ---- */
function Dash({ label, onDark }: { label: string; onDark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 26, height: 3, background: "var(--daust-orange)" }} />
      <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".18em", textTransform: "uppercase", color: onDark ? "#fff" : "var(--fg2)" }}>{label}</span>
    </div>
  );
}
function SectionHead({ num, label, accent = "navy", onDark }: { num?: string; label: string; accent?: "navy" | "orange"; onDark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `2px solid var(--daust-${accent})`, paddingTop: 20 }}>
      {num && <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".16em", color: "var(--daust-orange)" }}>{num}</span>}
      <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".16em", textTransform: "uppercase", color: onDark ? "#fff" : "var(--fg2)" }}>{label}</span>
    </div>
  );
}

function PageHero({ kicker, title, sub, cta }: { kicker: string; title: string; sub: string; cta?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
      <div style={{ ...WRAP, padding: "80px 40px 64px" }}>
        <Dash label={kicker} />
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(38px,5.6vw,74px)", lineHeight: 0.98, letterSpacing: "-.015em", color: "var(--fg1)", margin: "22px 0 0", maxWidth: 940 }}>{title}</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 18, lineHeight: 1.6, color: "var(--fg2)", maxWidth: 660, margin: "24px 0 0" }}>{sub}</p>
        {cta}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase", border: "none", borderRadius: 3, padding: "16px 32px", background: "var(--daust-orange)", color: "#fff", cursor: "pointer" };

export default function Site() {
  const [page, setPage] = useState<PageKey>("home");
  const [lang, setLang] = useState<Lang>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<SiteOverrides | null>(null);
  const [newsList, setNewsList] = useState<PublicNewsArticle[]>([]);
  const [articleSlug, setArticleSlug] = useState<string | null>(null);
  const [article, setArticle] = useState<PublicNewsArticleFull | null>(null);
  const [publicFaculty, setPublicFaculty] = useState<PublicFacultyMember[]>([]);

  // Pull the CMS content once. `?preview=<token>` renders the pending draft (token from the CMS).
  useEffect(() => {
    const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("preview") : null;
    (token ? getPreviewContent(token) : getPublishedContent()).then((o) => o && setOverrides(o));
  }, []);

  // Load published news; open a deep-linked article (?article=<slug>) on first load.
  useEffect(() => {
    getNews().then(setNewsList);
    const slug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("article") : null;
    if (slug) openArticle(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Professors toggled public on the platform drive the Faculty page; fall back to the
  // built-in list when none are public yet (or the API is unreachable).
  useEffect(() => {
    getPublicFaculty().then((fac) => {
      setPublicFaculty(fac);
      // Open a deep-linked professor (?faculty=<slug>) once the roster is loaded.
      const slug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("faculty") : null;
      if (!slug) return;
      const match = fac.find((f) => slugify(f.name) === slug);
      if (match) { setPage("faculty"); setFacultyId(match.id); }
    });
  }, []);

  // Reveal-on-scroll for `.reveal` cards; re-armed whenever the active view changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [page, lang, articleSlug]);

  const c = buildSiteContent(lang, overrides ?? undefined);
  const { tx } = c;
  const IMG = siteImgMap(c.images);
  // Only known section keys may reach the <style> selector (prevents CSS injection).
  const hidden = new Set((overrides?.hidden ?? []).filter((k) => (HIDEABLE_SECTIONS as readonly string[]).includes(k)));
  const fr = lang === "fr";

  function go(p: PageKey) {
    if (p === "portal") {
      window.location.assign(
        process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000",
      );
      return;
    }
    setPage(p);
    setMenuOpen(false);
    setFacultyId(null);
    setFacultyQuery(null);
    setArticleSlug(null);
    setArticle(null);
    setArticleQuery(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }
  const openApply = () => { setApplyOpen(true); setMenuOpen(false); };
  const openAI = () => { setAiOpen(true); setMenuOpen(false); };

  async function submitContactForm() {
    setContactErr(null);
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setContactErr(fr ? "Veuillez remplir tous les champs." : "Please fill in all fields.");
      return;
    }
    setContactBusy(true);
    try {
      await submitContact({ name: contactName.trim(), email: contactEmail.trim(), message: contactMessage.trim() });
      setContactSent(true);
    } catch {
      setContactErr(fr ? "Envoi impossible. Veuillez réessayer." : "Could not send. Please try again.");
    } finally {
      setContactBusy(false);
    }
  }

  function setArticleQuery(slug: string | null) {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (slug) u.searchParams.set("article", slug);
    else u.searchParams.delete("article");
    window.history.replaceState({}, "", u);
  }
  function openArticle(slug: string) {
    setArticleSlug(slug);
    setArticle(null);
    setArticleQuery(slug);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    getNewsArticle(slug).then((a) => (a ? setArticle(a) : closeArticle()));
  }
  function closeArticle() {
    setArticleSlug(null);
    setArticle(null);
    setArticleQuery(null);
  }
  function openNews(n: PublicNewsArticle) {
    if (n.externalUrl) {
      if (typeof window !== "undefined") window.open(n.externalUrl, "_blank", "noopener");
      return;
    }
    openArticle(n.slug);
  }

  // Per-professor deep link. The static host can't serve arbitrary paths, so the
  // shareable URL is a root query (?faculty=<slug>), mirroring the news pattern.
  function setFacultyQuery(slug: string | null) {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (slug) u.searchParams.set("faculty", slug);
    else u.searchParams.delete("faculty");
    window.history.replaceState({}, "", u);
  }
  function openFacultyMember(f: { id: string; name: string }) {
    setPage("faculty");
    setFacultyId(f.id);
    setFacultyQuery(slugify(f.name));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }
  function closeFacultyMember() {
    setFacultyId(null);
    setFacultyQuery(null);
  }

  // Faculty page source: platform professors toggled public; built-in list is the fallback.
  const facultyList =
    publicFaculty.length > 0
      ? publicFaculty.map((f) => ({
          id: f.id,
          slot: f.id,
          initials: f.initials,
          name: f.name,
          title: f.title ?? "",
          dept: f.dept ?? "",
          bio: f.bio ?? "",
          interests: f.interests,
          scholar: f.scholar ?? "",
          image: f.photo ? assetUrl(f.photo) : undefined,
        }))
      : c.faculty;
  const facultySel = facultyList.find((f) => f.id === facultyId) ?? null;

  /* ---------------- HEADER ---------------- */
  const utilLink: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 12, letterSpacing: ".03em", color: "var(--fg-on-navy-muted)", cursor: "pointer", background: "none", border: "none", padding: 0 };
  // Language toggle lives on the navy utility bar, so it uses on-navy colors.
  const hdrLang = (on: boolean): React.CSSProperties => ({ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", cursor: "pointer", padding: "2px 4px", background: "none", border: "none", color: on ? "#fff" : "var(--fg-on-navy-muted)" });

  const header = (
    <>
      {/* utility bar */}
      <div className="util-bar" style={{ background: "var(--daust-navy-deep)", color: "#fff" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 40px", height: 34, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 26 }}>
          <Hover as="button" onClick={() => go("news")} base={{ ...utilLink, display: "inline-flex", alignItems: "center", gap: 6 }} hover={{ color: "#fff" }}>{tx.uNews}</Hover>
          <Hover as="button" onClick={() => go("research")} base={utilLink} hover={{ color: "#fff" }}>{tx.uResearch}</Hover>
          <Hover as="button" onClick={() => go("portal")} base={utilLink} hover={{ color: "#fff" }}>{tx.uPortal}</Hover>
          <Hover as="button" onClick={() => go("contact")} base={utilLink} hover={{ color: "#fff" }}>{tx.uContact}</Hover>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button onClick={() => setLang("en")} style={hdrLang(!fr)}>EN</button>
            <span style={{ color: "var(--fg-on-navy-muted)", fontSize: 11 }}>/</span>
            <button onClick={() => setLang("fr")} style={hdrLang(fr)}>FR</button>
          </div>
        </div>
      </div>

      {/* main header */}
      <header style={{ background: "#fff", position: "sticky", top: 0, zIndex: 60, borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 40px", height: 74, display: "flex", alignItems: "center", gap: 28 }}>
          <button onClick={() => go("home")} aria-label="DAUST home" style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0, background: "none", border: "none", padding: 0 }}>
            <Image src="/logos/daust-wordmark-navy.png" alt="DAUST" width={140} height={28} style={{ height: 28, width: "auto" }} priority />
          </button>
          <nav className="nav-desktop" style={{ display: "flex", gap: 26, marginLeft: "auto" }}>
            {c.nav.map(([label, key]) => (
              <Hover key={key} as="button" onClick={() => go(key)}
                base={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14, padding: "4px 0", cursor: "pointer", whiteSpace: "nowrap", background: "none", border: "none", borderBottom: "2px solid transparent", color: page === key ? "var(--daust-navy)" : "var(--fg2)", borderBottomColor: page === key ? "var(--daust-orange)" : "transparent" }}
                hover={{ color: "var(--daust-orange)" }}>{label}</Hover>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
            <Hover as="button" onClick={openApply} base={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", border: "none", borderRadius: 3, padding: "12px 22px", background: "var(--daust-navy)", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }} hover={{ background: "var(--daust-orange)" }}>{tx.apply}</Hover>
            <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" style={{ display: "none", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "1px solid var(--border)", borderRadius: 3, background: "#fff", color: "var(--daust-navy)", cursor: "pointer" }}>
              <Icon name="menu" size={20} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "8px 32px 16px", display: "flex", flexDirection: "column" }}>
            {c.nav.map(([label, key]) => (
              <button key={key} onClick={() => go(key)} style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--fg1)", padding: "14px 4px", cursor: "pointer", borderBottom: "1px solid var(--divider)", background: "none", border: "none", textAlign: "left" }}>{label}</button>
            ))}
          </div>
        )}
      </header>
    </>
  );

  /* ---------------- HOME ---------------- */
  const home = (
    <>
      {/* hero */}
      <section style={{ position: "relative", background: "var(--daust-navy-deep)", overflow: "hidden", minHeight: "84vh", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ position: "absolute", inset: 0 }}><ImageSlot label={fr ? "Campus / étudiants" : "Campus / students hero"} src={IMG.hero} /></div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,26,48,.35) 0%,rgba(10,26,48,.15) 40%,rgba(10,26,48,.85) 100%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", ...WRAP, width: "100%", padding: "0 40px 72px" }}>
          <div style={{ maxWidth: 1000 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 26, height: 3, background: "var(--daust-orange)" }} />
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#fff" }}>{tx.heroKicker}</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(40px,6.4vw,86px)", lineHeight: 0.98, letterSpacing: "-.015em", color: "#fff", margin: "24px 0 0" }}>{tx.heroTitle}</h1>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(16px,1.5vw,19px)", lineHeight: 1.6, color: "rgba(255,255,255,.86)", maxWidth: 600, margin: "26px 0 0" }}>{tx.heroSub}</p>
            <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", marginTop: 36 }}>
              <Hover as="button" onClick={openApply} base={{ ...primaryBtn, padding: "16px 34px" }} hover={{ background: "#fff", color: "var(--daust-navy)" }}>{tx.applyNow} →</Hover>
              <Hover as="button" onClick={() => go("academics")} base={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase", background: "transparent", color: "#fff", border: "none", cursor: "pointer", borderBottom: "2px solid rgba(255,255,255,.4)", padding: "4px 0" }} hover={{ borderBottomColor: "var(--daust-orange)" }}>{tx.heroExplore}</Hover>
            </div>
          </div>
        </div>
        <div className="hero-cap" style={{ position: "absolute", right: 40, bottom: 72, fontFamily: "var(--font-body)", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", writingMode: "vertical-rl" }}>{tx.heroLoc}</div>
      </section>

      {/* recognition */}
      <section data-sec="recognition" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div style={{ ...WRAP, display: "grid", gridTemplateColumns: "auto repeat(4,1fr)", alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "24px 28px 24px 0" }}>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg3)", lineHeight: 1.5 }}>{tx.recTitle}</span>
          </div>
          {c.recognition.map((r) => (
            <div key={r.name} style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 28px", borderLeft: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "var(--daust-navy)", letterSpacing: "-.005em" }}>{r.name}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>{r.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* news */}
      <section data-sec="news" style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "72px 40px 104px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <SectionHead num="01" label={tx.newsKicker} />
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,3.8vw,50px)", lineHeight: 1.02, letterSpacing: "-.01em", color: "var(--fg1)", margin: "26px 0 0" }}>{tx.newsTitle}</h2>
            </div>
            <button onClick={() => go("news")} style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", paddingBottom: 4, borderBottom: "2px solid var(--daust-orange)", cursor: "pointer" }}>{tx.newsAll}</button>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 36, marginTop: 52 }}>
            {newsList.length > 0
              ? newsList.slice(0, 3).map((n) => (
                <button key={n.id} onClick={() => openNews(n)} className="reveal card-lift" style={{ textAlign: "left", background: "#fff", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", color: "inherit", minWidth: 0, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: 220, position: "relative", overflow: "hidden", minWidth: 0 }}><ImageSlot label={fr ? n.titleFr : n.titleEn} src={n.imageUrl ?? undefined} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
                    {n.tag && <><span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{n.tag}</span><span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border-strong)" }} /></>}
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--fg3)" }}>{n.date}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", margin: "12px 0 0", lineHeight: 1.2 }}>{fr ? n.titleFr : n.titleEn}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "12px 0 0" }}>{fr ? n.excerptFr : n.excerptEn}</p>
                </button>
              ))
              : c.news.slice(0, 3).map((n, i) => (
                <button key={n.slot} onClick={() => go("news")} className="reveal card-lift" style={{ display: "flex", flexDirection: "column", color: "inherit", minWidth: 0, textAlign: "left", background: "#fff", border: "none", padding: 0, cursor: "pointer", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: 220, position: "relative", overflow: "hidden", minWidth: 0 }}><ImageSlot label={n.title} src={IMG.news[i % IMG.news.length]} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{n.tag}</span>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border-strong)" }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--fg3)" }}>{n.date}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", margin: "12px 0 0", lineHeight: 1.2 }}>{n.title}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "12px 0 0" }}>{n.excerpt}</p>
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* hero stats */}
      <section data-sec="heroStats" style={{ background: "var(--daust-navy)" }}>
        <div className="grid-4" style={{ ...WRAP, display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
          {c.heroStats.map((s) => (
            <div key={s.label} style={{ padding: "56px 32px", borderLeft: "1px solid rgba(255,255,255,.14)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(40px,4.4vw,58px)", lineHeight: 1, letterSpacing: "-.01em", color: "#fff" }}>{s.n}<span style={{ color: "var(--daust-orange)" }}>{s.mark}</span></div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: ".02em", color: "var(--fg-on-navy-muted)", marginTop: 12 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* programs */}
      <section data-sec="programs" style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "104px 40px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <SectionHead num="02" label={tx.progKicker} />
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,3.8vw,50px)", lineHeight: 1.02, letterSpacing: "-.01em", color: "var(--fg1)", margin: "26px 0 0" }}>{tx.progTitle}</h2>
            </div>
            <button onClick={() => go("academics")} style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer", borderBottom: "2px solid var(--daust-orange)", paddingBottom: 4 }}>{tx.viewAll}</button>
          </div>
          <div className="tbl-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 48 }}>
            {c.programs.map((p) => (
              <Hover key={p.slot} onClick={() => go("academics")} className="reveal card-lift" base={{ background: "#fff", padding: "30px 26px", cursor: "pointer", display: "flex", flexDirection: "column", minHeight: 260 }} hover={{ background: "var(--bg-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".14em", color: "var(--daust-orange)" }}>0{p.no}</span>
                  <Icon name={p.icon} size={24} color="var(--daust-navy)" />
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "26px 0 0", lineHeight: 1.12 }}>{p.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", margin: "12px 0 20px", flex: 1 }}>{p.desc}</p>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)" }}>{tx.learnMore}</span>
              </Hover>
            ))}
          </div>
        </div>
      </section>

      {/* impact */}
      <section data-sec="impact" style={{ background: "var(--daust-navy-deep)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div style={{ position: "relative", ...WRAP, padding: "96px 40px" }}>
          <SectionHead label="DAUST Impact" accent="orange" onDark />
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, marginTop: 48 }}>
            {c.impactStats.map((s) => (
              <div key={s.label} style={{ padding: "8px 32px", borderLeft: "1px solid rgba(255,255,255,.14)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(40px,4.4vw,58px)", lineHeight: 1, letterSpacing: "-.01em", color: "#fff" }}>{s.value}<span style={{ color: "var(--daust-orange)" }}>{s.suffix}</span></div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-on-navy-muted)", marginTop: 12 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* spotlight */}
      <section data-sec="spotlight" style={{ background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
        <div className="split" style={{ maxWidth: 1240, margin: "0 auto", padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}>
          <div style={{ position: "relative", minHeight: 520, minWidth: 0 }}><ImageSlot label={fr ? "Recherche / laboratoire" : "Research / lab feature"} src={IMG.researchFeature} /></div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "88px 64px", minWidth: 0 }}>
            <SectionHead label={tx.spotKicker} accent="orange" />
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,3.2vw,44px)", lineHeight: 1.03, letterSpacing: "-.01em", color: "var(--fg1)", margin: "24px 0 0", maxWidth: 520 }}>{tx.spotTitle}</h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7, color: "var(--fg2)", margin: "20px 0 0", maxWidth: 500 }}>{tx.spotBody}</p>
            <button onClick={() => go("research")} style={{ alignSelf: "flex-start", marginTop: 30, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer", borderBottom: "2px solid var(--daust-orange)", paddingBottom: 4 }}>{tx.exploreResearch}</button>
          </div>
        </div>
      </section>

      {/* why */}
      <section data-sec="why" style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "104px 40px" }}>
          <SectionHead num="03" label={tx.whyKicker} />
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,3.8vw,50px)", lineHeight: 1.02, letterSpacing: "-.01em", color: "var(--fg1)", margin: "26px 0 0", maxWidth: 820 }}>{tx.whyTitle}</h2>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginTop: 56, borderTop: "1px solid var(--border)" }}>
            {c.pillars.map((p) => (
              <div key={p.title} className="reveal" style={{ padding: "32px 28px 32px 0", borderBottom: "1px solid var(--border)" }}>
                <Icon name={p.icon} size={26} color="var(--daust-navy)" />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, color: "var(--fg1)", margin: "18px 0 0" }}>{p.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.65, color: "var(--fg2)", margin: "10px 0 0" }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- ACADEMICS ---------------- */
  const academics = (
    <>
      <PageHero kicker={tx.eduKicker} title={tx.eduTitle} sub={tx.eduSub} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="01" label={tx.coeKicker} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 44, borderTop: "1px solid var(--border)" }}>
            {c.programs.map((p, i) => (
              <div key={p.slot} className="split" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 44, alignItems: "center", padding: "40px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ position: "relative", height: 220 }}>
                  <ImageSlot label={p.title} src={IMG.programs[i % IMG.programs.length]} />
                  <span style={{ position: "absolute", left: 0, top: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "#fff", background: "var(--daust-navy)", padding: "8px 14px" }}>0{p.no}</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Icon name={p.icon} size={26} color="var(--daust-orange)" />
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg3)" }}>{p.tag}</span>
                  </div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(24px,2.6vw,32px)", color: "var(--fg1)", margin: "16px 0 0", letterSpacing: "-.01em" }}>{p.title}</h2>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.7, color: "var(--fg2)", margin: "12px 0 16px", maxWidth: 640 }}>{p.long}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {p.topics.map((t) => (
                      <span key={t} style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)", border: "1px solid var(--border)", padding: "6px 13px", borderRadius: 3 }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "var(--bg-subtle)" }}>
        <div className="split" style={{ ...WRAP, padding: "88px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <SectionHead num="02" label={tx.pathKicker} />
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(26px,3.2vw,40px)", color: "var(--fg1)", margin: "24px 0 16px", lineHeight: 1.05, letterSpacing: "-.01em" }}>{tx.pathTitle}</h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: "0 0 14px" }}>{tx.pathP1}</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: "0 0 24px" }}>{tx.pathP2}</p>
            <Hover as="button" onClick={openApply} base={{ ...primaryBtn, background: "var(--daust-navy)", padding: "15px 30px" }} hover={{ background: "var(--daust-orange)" }}>{tx.applyToday}</Hover>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            {c.model.map((m) => (
              <div key={m.title} className="reveal card-lift" style={{ background: "#fff", padding: 24 }}>
                <Icon name={m.icon} size={24} color="var(--daust-orange)" />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--fg1)", margin: "14px 0 0" }}>{m.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)", margin: "8px 0 0" }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- ADMISSIONS ---------------- */
  const admissions = (
    <>
      <PageHero kicker={tx.admKicker} title={tx.admTitle} sub={tx.admSub}
        cta={<div style={{ marginTop: 28 }}><Hover as="button" onClick={openApply} base={primaryBtn} hover={{ background: "var(--daust-navy)" }}>{tx.admApply}</Hover></div>} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="01" label={tx.procKicker} />
          <div className="tbl-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 44 }}>
            {c.admSteps.map((s) => (
              <div key={s.n} className="reveal card-lift" style={{ background: "#fff", padding: "30px 26px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, color: "var(--bg-tint)", WebkitTextStroke: "1.5px var(--daust-navy)", lineHeight: 1 }}>{s.n}</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", margin: "18px 0 0" }}>{s.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "9px 0 0" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "var(--bg-subtle)" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="02" label={tx.costKicker} />
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--daust-navy-700)", border: "1px solid var(--daust-navy-700)", marginTop: 40 }}>
            {c.scholarships.map((s) => (
              <div key={s.pct} style={{ background: "var(--daust-navy)", padding: "32px 28px", color: "#fff" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 52, lineHeight: 1, color: "#fff", letterSpacing: "-.01em" }}>{s.pct}<span style={{ color: "var(--daust-orange)" }}> ↓</span></div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--fg-on-navy-muted)", marginTop: 14, lineHeight: 1.5 }}>{s.cond}</div>
              </div>
            ))}
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 1 }}>
            {c.tuition.map((t) => (
              <div key={t.label} style={{ background: "#fff", padding: "26px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)" }}>{t.label}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg3)", marginTop: 4 }}>{t.note}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: "var(--daust-navy)" }}>{t.amount}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>{t.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "#fff" }}>
        <div className="split" style={{ ...WRAP, padding: "88px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "start" }}>
          <div>
            <SectionHead num="03" label={tx.reqKicker} />
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: "var(--fg1)", margin: "22px 0 24px", letterSpacing: "-.01em" }}>{tx.reqTitle}</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {c.admReq.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid var(--divider)" }}>
                  <Icon name="check" size={18} color="var(--daust-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.55, color: "var(--fg1)" }}>{r}</span>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--fg3)", margin: "22px 0 0" }}>{tx.reqContact}</p>
          </div>
          <div>
            <SectionHead num="04" label={tx.faqKicker} />
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: "var(--fg1)", margin: "22px 0 24px", letterSpacing: "-.01em" }}>{tx.faqTitle}</h2>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--border)" }}>
              {c.faq.map((f) => (
                <div key={f.q} style={{ padding: "22px 0", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--fg1)", margin: "0 0 8px" }}>{f.q}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- RESEARCH ---------------- */
  const research = (
    <>
      <PageHero kicker={tx.resKicker} title={tx.resTitle} sub={tx.resSub} />
      <div style={{ position: "relative", height: "clamp(300px,42vw,520px)" }}><ImageSlot label={fr ? "Recherche / laboratoire" : "Research / lab hero"} src={IMG.researchHero} /></div>
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="01" label={tx.centersKicker} />
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 44 }}>
            {c.researchAreas.map((a) => (
              <Hover key={a.title} className="reveal card-lift" base={{ background: "#fff", padding: "34px 30px", display: "flex", gap: 22 }} hover={{ background: "var(--bg-subtle)" }}>
                <Icon name={a.icon} size={28} color="var(--daust-navy)" style={{ flexShrink: 0 }} />
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, color: "var(--fg1)", margin: 0, letterSpacing: "-.01em" }}>{a.title}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.65, color: "var(--fg2)", margin: "10px 0 0" }}>{a.desc}</p>
                </div>
              </Hover>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "var(--bg-subtle)" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="02" label={tx.dirKicker} />
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 40 }}>
            {c.directors.map((d) => (
              <div key={d.name} style={{ background: "#fff", display: "flex", gap: 16, alignItems: "center", padding: "22px 24px" }}>
                <div style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 3, background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16 }}>{d.initials}</div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--fg1)" }}>{d.name}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg2)", marginTop: 3 }}>{d.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "var(--daust-navy)" }}>
        <div className="grid-3" style={{ ...WRAP, display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
          {c.researchStats.map((s) => (
            <div key={s.label} style={{ padding: "64px 32px", borderLeft: "1px solid rgba(255,255,255,.14)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(40px,4.4vw,58px)", lineHeight: 1, color: "#fff", letterSpacing: "-.01em" }}>{s.n}<span style={{ color: "var(--daust-orange)" }}>{s.mark}</span></div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-on-navy-muted)", marginTop: 12 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );

  /* ---------------- FACULTY ---------------- */
  const faculty = facultySel ? (
    <section style={{ background: "#fff" }}>
      <div style={{ ...WRAP, padding: "48px 40px 88px" }}>
        <Hover as="button" onClick={closeFacultyMember} base={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer", padding: 0 }} hover={{ color: "var(--daust-orange)" }}>
          <Icon name="arrow-left" size={18} />{tx.facAll}
        </Hover>
        <div className="fac-detail split" style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 56, alignItems: "start", marginTop: 32 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ position: "relative", height: 480, minWidth: 0 }}><ImageSlot label={facultySel.name} mono={facultySel.initials} src={facultySel.image} /></div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "2px solid var(--daust-navy)", paddingTop: 20 }}>
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{facultySel.dept}</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(32px,3.8vw,50px)", lineHeight: 1.02, letterSpacing: "-.015em", color: "var(--fg1)", margin: "22px 0 0" }}>{facultySel.name}</h1>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 17, color: "var(--fg2)", marginTop: 8 }}>{facultySel.title}</div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, color: "var(--fg2)", margin: "28px 0 0", maxWidth: 640 }}>{facultySel.bio}</p>
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg3)", margin: "32px 0 14px" }}>{tx.facInterests}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {facultySel.interests.map((it) => (
                <span key={it} style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--daust-navy)", border: "1px solid var(--border)", padding: "7px 14px", borderRadius: 3 }}>{it}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 36 }}>
              <Hover as="button" onClick={() => go("research")} base={{ ...primaryBtn, background: "var(--daust-navy)", padding: "15px 28px" }} hover={{ background: "var(--daust-orange)" }}>{tx.facCenter}</Hover>
              <a href={facultySel.scholar} target="_blank" rel="noopener" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--daust-navy)", border: "1.5px solid var(--border)", borderRadius: 3, padding: "15px 28px", display: "inline-flex", alignItems: "center" }}>{tx.facPubs}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  ) : (
    <>
      <PageHero kicker={tx.facKicker} title={tx.facTitle} sub={tx.facSub} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "72px 40px" }}>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            {facultyList.map((f) => (
              <Hover key={f.id} onClick={() => openFacultyMember(f)} className="reveal card-lift" base={{ background: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", minWidth: 0 }} hover={{ background: "var(--bg-subtle)" }}>
                <div style={{ position: "relative", height: 300, minWidth: 0 }}><ImageSlot label={f.name} mono={f.initials} src={f.image} /></div>
                <div style={{ padding: "24px 26px 28px" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{f.dept}</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, color: "var(--fg1)", margin: "12px 0 0", letterSpacing: "-.01em" }}>{f.name}</h3>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg2)", marginTop: 4 }}>{f.title}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)", marginTop: 18 }}>{tx.facLink}</div>
                </div>
              </Hover>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- INNOVATION ---------------- */
  const innovation = (
    <>
      <PageHero kicker={tx.innKicker} title={tx.innTitle} sub={tx.innSub} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="01" label={tx.deepKicker} />
          <p style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.7, color: "var(--fg2)", margin: "24px 0 0", maxWidth: 760 }}>{tx.deepBody}</p>
          <div className="tbl-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 44 }}>
            {c.ventureSteps.map((s) => (
              <div key={s.no} className="reveal card-lift" style={{ background: "#fff", padding: "30px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".12em", color: "var(--daust-orange)" }}>0{s.no}</span>
                  <Icon name={s.icon} size={24} color="var(--daust-navy)" />
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", margin: "22px 0 0" }}>{s.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "9px 0 0" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ background: "var(--bg-subtle)" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <SectionHead num="02" label={tx.startKicker} />
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", marginTop: 40 }}>
            {c.ventures.map((v) => {
              const logo = VENTURE_LOGOS[v.name];
              return (
                <a key={v.name} href={v.href} target="_blank" rel="noopener" className="card-lift reveal" style={{ background: "#fff", padding: "32px 28px", display: "block", color: "inherit" }}>
                  {logo ? (
                    <div style={{ height: 56, display: "flex", alignItems: "center", marginBottom: 18 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- static export, plain img by design */}
                      <img src={logo} alt={`${v.name} logo`} loading="lazy" style={{ maxHeight: 46, maxWidth: 180, objectFit: "contain" }} />
                    </div>
                  ) : (
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{v.tag}</span>
                  )}
                  {logo && <span style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)", marginBottom: 16 }}>{v.tag}</span>}
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", margin: "16px 0 0", letterSpacing: "-.01em" }}>{v.name}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.65, color: "var(--fg2)", margin: "10px 0 16px" }}>{v.desc}</p>
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)" }}>{v.cta}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- CAMPUS ---------------- */
  const campus = (
    <>
      <section style={{ position: "relative", background: "var(--daust-navy-deep)", overflow: "hidden", minHeight: "62vh", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ position: "absolute", inset: 0 }}><ImageSlot label={fr ? "Campus" : "Campus photo"} src={IMG.campus} /></div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,26,48,.3),rgba(10,26,48,.85))", pointerEvents: "none" }} />
        <div style={{ position: "relative", ...WRAP, width: "100%", padding: "0 40px 64px" }}>
          <Dash label={tx.lifeKicker} onDark />
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(38px,5.6vw,74px)", lineHeight: 0.98, letterSpacing: "-.015em", color: "#fff", margin: "22px 0 0", maxWidth: 820 }}>{tx.lifeTitle}</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,.86)", maxWidth: 640, margin: "22px 0 0" }}>{tx.lifeSub}</p>
        </div>
      </section>
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "88px 40px" }}>
          <div className="tbl-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            {c.campusFeatures.map((cf) => (
              <div key={cf.title} className="reveal card-lift" style={{ background: "#fff", padding: "30px 26px" }}>
                <Icon name={cf.icon} size={26} color="var(--daust-navy)" />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", margin: "18px 0 0" }}>{cf.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "9px 0 0" }}>{cf.desc}</p>
              </div>
            ))}
          </div>
          <div className="campus-mosaic" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "220px 220px", gap: 16, marginTop: 48 }}>
            <div style={{ gridRow: "span 2", position: "relative", minWidth: 0 }}><ImageSlot label={fr ? "Campus / aérien" : "Campus / aerial"} src={IMG.aerial} /></div>
            <div style={{ position: "relative", minWidth: 0 }}><ImageSlot label={fr ? "Laboratoire" : "Lab"} src={IMG.lab} /></div>
            <div style={{ position: "relative", minWidth: 0 }}><ImageSlot label={fr ? "Étudiants" : "Students"} src={IMG.students} /></div>
            <div style={{ position: "relative", minWidth: 0 }}><ImageSlot label={fr ? "Événement" : "Event"} src={IMG.event} /></div>
            <div style={{ position: "relative", minWidth: 0 }}><ImageSlot label={fr ? "Résidences" : "Dorms"} src={IMG.dorms} /></div>
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- ABOUT ---------------- */
  const about = (
    <>
      <PageHero kicker={tx.aboutKicker} title={tx.aboutTitle} sub={tx.aboutSub} />
      <section style={{ background: "#fff" }}>
        <div className="grid-4" style={{ ...WRAP, display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid var(--border)" }}>
          {c.aboutFacts.map((f) => (
            <div key={f.label} style={{ padding: "52px 32px", borderLeft: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(34px,3.6vw,46px)", lineHeight: 1, color: "var(--daust-navy)", letterSpacing: "-.01em" }}>{f.n}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--fg2)", marginTop: 12 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <div className="split" style={{ ...WRAP, padding: "80px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
          <div>
            <SectionHead num="01" label={tx.missionKicker} />
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32, color: "var(--fg1)", margin: "22px 0 18px", lineHeight: 1.05, letterSpacing: "-.01em" }}>{tx.missionTitle}</h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: "0 0 14px" }}>{tx.missionP1}</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: 0 }}>{tx.missionP2}</p>
          </div>
          <div>
            <SectionHead num="02" label={tx.storyKicker} />
            <div style={{ display: "flex", flexDirection: "column", marginTop: 24, borderTop: "1px solid var(--border)" }}>
              {c.timeline.map((t) => (
                <div key={t.year} style={{ display: "flex", gap: 24, padding: "18px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--daust-orange)", flexShrink: 0, width: 44 }}>{t.year}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.5, color: "var(--fg1)" }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ ...WRAP, padding: "0 40px 88px" }}>
          <div style={{ background: "var(--daust-navy)", padding: 56, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <div style={{ position: "relative" }}>
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{tx.presKicker}</span>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(22px,2.6vw,32px)", lineHeight: 1.28, letterSpacing: "-.01em", color: "#fff", margin: "22px 0 26px", maxWidth: 940 }}>{tx.presQuote}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 3, background: "rgba(255,255,255,.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17 }}>SN</div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "#fff" }}>Dr. Sidy Ndao</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-on-navy-muted)", marginTop: 2 }}>{tx.presRole}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- CONTACT ---------------- */
  const contact = (
    <>
      <PageHero kicker={tx.uContact} title={tx.contactTitle} sub={tx.contactSub} />
      <section style={{ background: "#fff" }}>
        <div className="split" style={{ ...WRAP, padding: "88px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "start" }}>
          <div>
            <SectionHead num="01" label={tx.reachKicker} />
            <div style={{ display: "flex", flexDirection: "column", marginTop: 24, borderTop: "1px solid var(--border)" }}>
              {c.contactInfo.map((ci) => (
                <div key={ci.label} style={{ display: "flex", gap: 18, alignItems: "flex-start", padding: "22px 0", borderBottom: "1px solid var(--border)" }}>
                  <Icon name={ci.icon} size={22} color="var(--daust-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg3)" }}>{ci.label}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 15.5, lineHeight: 1.55, color: "var(--fg1)", marginTop: 6 }}>{ci.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionHead num="02" label={tx.sendKicker} />
            {contactSent ? (
              <div style={{ marginTop: 24, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 6, padding: "36px 30px", textAlign: "center" }}>
                <div style={{ width: 60, height: 60, borderRadius: 3, background: "rgba(46,125,82,.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon name="check" size={30} color="#2e7d52" /></div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "18px 0 0" }}>{tx.sentTitle}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.6, color: "var(--fg2)", margin: "8px auto 0", maxWidth: 340 }}>{tx.sentBody}</p>
              </div>
            ) : (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg2)", display: "block", marginBottom: 6 }}>{tx.nameLabel}</label>
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={tx.namePh} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 14, outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg2)", display: "block", marginBottom: 6 }}>{tx.emailLabel}</label>
                    <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="you@email.com" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 14, outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg2)", display: "block", marginBottom: 6 }}>{tx.messageLabel}</label>
                    <textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} rows={5} placeholder={tx.messagePh} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.5 }} />
                  </div>
                </div>
                {contactErr && <div style={{ color: "var(--error-500)", fontSize: 13, marginTop: 12 }}>{contactErr}</div>}
                <Hover as="button" onClick={submitContactForm} base={{ ...primaryBtn, width: "100%", marginTop: 20, borderRadius: 4, padding: 15, opacity: contactBusy ? 0.7 : 1 }} hover={{ background: "var(--daust-navy)" }}>{contactBusy ? "…" : tx.sendBtn}</Hover>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );

  /* ---------------- NEWS ---------------- */
  const newsView = (
    <>
      <PageHero kicker={tx.newsKicker} title={tx.newsTitle} sub={tx.newsSub} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "72px 40px 104px" }}>
          {newsList.length > 0 ? (
            <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 36 }}>
              {newsList.map((n) => (
                <button key={n.id} onClick={() => openNews(n)} className="reveal card-lift" style={{ textAlign: "left", background: "#fff", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", color: "inherit", minWidth: 0, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: 220, position: "relative", overflow: "hidden", minWidth: 0 }}><ImageSlot label={fr ? n.titleFr : n.titleEn} src={n.imageUrl ?? undefined} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
                    {n.tag && <><span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{n.tag}</span><span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border-strong)" }} /></>}
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--fg3)" }}>{n.date}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", margin: "12px 0 0", lineHeight: 1.2 }}>{fr ? n.titleFr : n.titleEn}</h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "12px 0 0" }}>{fr ? n.excerptFr : n.excerptEn}</p>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "64px 0", color: "var(--fg3)", fontFamily: "var(--font-body)", fontSize: 15.5 }}>{tx.newsEmpty}</div>
          )}
        </div>
      </section>
    </>
  );

  /* ---------------- PRIVACY ---------------- */
  const privacy = (
    <>
      <PageHero kicker={tx.privacyKicker} title={tx.privacyTitle} sub={tx.privacySub} />
      <section style={{ background: "#fff" }}>
        <div style={{ ...WRAP, padding: "40px 40px 104px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 18 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg3)" }}>{tx.privacyUpdated}</span>
            <Hover as="button" onClick={() => go("contact")} base={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer", padding: 0, borderBottom: "2px solid var(--daust-orange)", paddingBottom: 3 }} hover={{ color: "var(--daust-orange)" }}>{tx.uContact}</Hover>
          </div>
          <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", marginTop: 44 }}>
            {c.privacySections.map((s, i) => (
              <div key={s.title} className="reveal" style={{ padding: "26px 0", borderBottom: "1px solid var(--divider)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "var(--daust-orange)", flexShrink: 0, width: 30 }}>0{i + 1}</span>
                  <div>
                    <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", letterSpacing: "-.01em" }}>{s.title}</h2>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.75, color: "var(--fg2)", margin: "10px 0 0", maxWidth: 720 }}>{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  const views: Record<PageKey, React.ReactNode> = { home, academics, admissions, research, faculty, innovation, campus, about, portal: null, contact, news: newsView, privacy };

  /* ---------------- NEWS ARTICLE ---------------- */
  const articleView = (
    <>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div style={{ ...WRAP, padding: "40px 40px 0" }}>
          <Hover as="button" onClick={closeArticle} base={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)", background: "none", border: "none", cursor: "pointer", padding: 0 }} hover={{ color: "var(--daust-orange)" }}>
            <Icon name="arrow-left" size={18} />{tx.newsAll}
          </Hover>
        </div>
      </div>
      {article ? (
        <article style={{ background: "#fff" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 40px 88px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {article.tag && <><span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{article.tag}</span><span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border-strong)" }} /></>}
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg3)" }}>{article.date}</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,4.4vw,52px)", lineHeight: 1.04, letterSpacing: "-.015em", color: "var(--fg1)", margin: "16px 0 0" }}>{fr ? article.titleFr : article.titleEn}</h1>
            {article.imageUrl && (
              <div style={{ position: "relative", height: "clamp(240px,38vw,460px)", margin: "28px 0 8px", overflow: "hidden", borderRadius: 4 }}>
                <ImageSlot label={fr ? article.titleFr : article.titleEn} src={article.imageUrl} />
              </div>
            )}
            {(() => {
              const body = fr ? article.bodyFr : article.bodyEn;
              const isHtml = /<[a-z][\s\S]*>/i.test(body);
              if (isHtml) {
                return (
                  <div
                    dangerouslySetInnerHTML={{ __html: body }}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 16.5,
                      lineHeight: 1.75,
                      color: "var(--fg2)",
                      margin: "20px 0 0",
                    }}
                  />
                );
              }
              return body.split(/\n{2,}/).map((para, i) => (
                <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: 16.5, lineHeight: 1.75, color: "var(--fg2)", margin: "20px 0 0", whiteSpace: "pre-wrap" }}>{para}</p>
              ));
            })()}
          </div>
        </article>
      ) : (
        <div style={{ padding: 80, textAlign: "center", color: "var(--fg3)", fontFamily: "var(--font-body)" }}>{fr ? "Chargement…" : "Loading…"}</div>
      )}
    </>
  );

  /* ---------------- SOCIAL / FOOTER ---------------- */
  const social = [
    { title: "X / Twitter", href: "https://twitter.com/daustofficial", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
    { title: "Facebook", href: "https://www.facebook.com/DaustOrg", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
    { title: "LinkedIn", href: "https://www.linkedin.com/company/daustofficial", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
    { title: "YouTube", href: "https://www.youtube.com/@daustorg", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
    { title: "Instagram", href: "https://www.instagram.com/daustorg/", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      {hidden.size > 0 && (
        <style>{[...hidden].map((k) => `[data-sec="${k}"]{display:none!important}`).join("")}</style>
      )}
      {header}
      <main style={{ flex: 1 }}>
        {articleSlug ? articleView : views[page]}

        {/* CTA band */}
        <section style={{ background: "var(--daust-navy)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div style={{ position: "relative", ...WRAP, padding: "80px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 36, flexWrap: "wrap" }}>
            <div>
              <Dash label={tx.heroKicker} onDark />
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,3.6vw,46px)", color: "#fff", margin: "20px 0 0", lineHeight: 1.02, letterSpacing: "-.01em", maxWidth: 640 }}>{tx.ctaTitle}</h2>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Hover as="button" onClick={openApply} base={{ ...primaryBtn, padding: "17px 36px" }} hover={{ background: "#fff", color: "var(--daust-navy)" }}>{tx.applyNow} →</Hover>
              <Hover as="button" onClick={openAI} base={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase", borderRadius: 3, padding: "17px 36px", background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,.5)", cursor: "pointer" }} hover={{ borderColor: "#fff" }}>{tx.askOurAI}</Hover>
            </div>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer style={{ background: "var(--daust-navy-deep)", color: "#fff" }}>
        <div style={{ ...WRAP, padding: "72px 40px 40px" }}>
          <div className="foot-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40 }}>
            <div>
              <Image src="/logos/daust-wordmark-white.png" alt="DAUST" width={160} height={32} style={{ height: 32, width: "auto" }} />
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.65, color: "var(--fg-on-navy-muted)", maxWidth: 300, margin: "20px 0 18px" }}>{tx.footTagline}</p>
              <div style={{ display: "flex", gap: 10 }}>
                {social.map((s) => (
                  <a key={s.title} href={s.href} target="_blank" rel="noopener" title={s.title} style={{ width: 38, height: 38, borderRadius: 3, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d={s.path} /></svg>
                  </a>
                ))}
              </div>
            </div>
            {c.footCols.map((col) => (
              <div key={col.head}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--daust-orange)", marginBottom: 16 }}>{col.head}</div>
                {col.items.map((it) => (
                  <Hover key={it.label} as="button" onClick={() => { if (it.apply) openApply(); else if (it.ai) openAI(); else if (it.page) go(it.page); }}
                    base={{ display: "block", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg-on-navy-muted)", padding: "7px 0", cursor: "pointer", background: "none", border: "none", textAlign: "left" }} hover={{ color: "#fff" }}>{it.label}</Hover>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, margin: "32px 0 24px" }}>
            <span style={{ width: 42, height: 4, background: "#fff" }} />
            <span style={{ width: 42, height: 4, background: "var(--daust-orange)" }} />
            <span style={{ width: 42, height: 4, background: "var(--daust-steel)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-on-navy-muted)", borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 24 }}>
            <span>{tx.footRights}</span>
            <span>info@daust.org · +221 77 488 25 15 · +221 78 128 44 58</span>
          </div>
        </div>
      </footer>

      <AiPanel open={aiOpen} onOpen={openAI} onClose={() => setAiOpen(false)} tx={tx} suggestions={c.suggestions} lang={lang} kb={c.chatKb} fallback={c.chatFallback} />
      <CookieBanner text={tx.cookieText} accept={tx.cookieAccept} decline={tx.cookieDecline} more={tx.cookieMore} onMore={() => go("privacy")} />
      {applyOpen && <ApplyModal tx={tx} lang={lang} onClose={() => setApplyOpen(false)} onOpenAI={() => { setApplyOpen(false); setAiOpen(true); }} />}
    </div>
  );
}
