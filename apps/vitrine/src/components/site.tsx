"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X, Globe } from "lucide-react";
import { useLang } from "@/i18n/context";

/** A number that counts up from 0 once it scrolls into view, easing out
 * (cubic) over ~1.2s. Used for stat strips across the marketing pages. */
export function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      const dur = 1200;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((x) => { if (x.isIntersecting) run(); });
    }, { threshold: 0.4 });
    io.observe(el);
    const fb = setTimeout(() => setN(value), 1600);
    return () => { io.disconnect(); clearTimeout(fb); };
  }, [value]);
  return <div ref={ref}>{n.toLocaleString()}{suffix}</div>;
}

export function Section({
  children,
  bg = "#fff",
  max = 1120,
  pad = "96px clamp(24px, 5vw, 64px)",
}: {
  children: React.ReactNode;
  bg?: string;
  max?: number;
  pad?: string;
}) {
  return (
    <section style={{ background: bg, padding: pad }}>
      <div style={{ maxWidth: max, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

/** Infinite horizontally-scrolling ticker — the "alive" alternative to a
 * static info band. Renders two copies of the track back to back so the
 * loop is seamless when the first copy slides exactly its own width. */
export function Marquee({ items, bg }: { items: string[]; bg?: string }) {
  const track = (
    <div className="marquee-track">
      {items.map((it, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center" }}>
          <span className="marquee-item">{it}</span>
          <span className="marquee-dot" />
        </span>
      ))}
    </div>
  );
  return (
    <div className="marquee" style={bg ? { background: bg } : undefined}>
      {track}
      {track}
    </div>
  );
}

/** Soft wavy seam between two sections of different color, instead of a
 * hard rectangular cut — sits at the bottom edge of the upper section and
 * is filled with the color the page is transitioning into. */
export function WaveDivider({ fill }: { fill: string }) {
  return (
    <svg
      className="wave-divider"
      style={{ position: "absolute", left: 0, bottom: -1, width: "100%", height: 48 }}
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0,30 C150,60 350,0 600,30 C850,60 1050,0 1200,30 L1200,60 L0,60 Z" style={{ fill }} />
    </svg>
  );
}

/** Bold specific words/phrases inline within a sentence (the Olin College
 * pattern: "Join a dynamic and forward-thinking college...") instead of
 * setting the whole paragraph in one uniform weight. */
export function emphasize(text: string, words: string[]): React.ReactNode {
  if (!words.length) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) =>
    words.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
      <strong key={i} style={{ color: "#fff", fontWeight: 700 }}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function Heading({
  eyebrow,
  title,
  sub,
  align = "left",
  onNavy = false,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
  onNavy?: boolean;
}) {
  return (
    <div style={{ textAlign: align, maxWidth: align === "center" ? 680 : undefined, margin: align === "center" ? "0 auto" : undefined }}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="h2" style={{ color: onNavy ? "#fff" : "var(--fg1)" }}>{title}</h2>
      {sub && (
        <p className="lead" style={{ color: onNavy ? "var(--on-navy-muted)" : "var(--fg2)", marginTop: 16, maxWidth: 580 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal:not(.visible)");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("visible");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add("visible");
      } else {
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, []);
}

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/** active is a route path like "/" "/admissions" "/academics" "/about" */
export function Header({ active, onApply }: { active?: string; onApply: () => void }) {
  const { lang, t, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const NAV = [
    { href: "/admissions", label: t.nav.admissions },
    { href: "/academics", label: t.nav.education },
    { href: "/research", label: t.nav.research },
    { href: "/startups", label: t.nav.startups },
    { href: "/campus", label: t.nav.campus },
    { href: "/alumni", label: t.nav.alumni },
    { href: "/about", label: t.nav.about },
  ];

  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div style={{ padding: "0 clamp(24px, 5vw, 64px)", height: 64, display: "flex", alignItems: "center", position: "relative" }}>
        <nav className="hdr-nav" style={{ display: "flex", gap: 24 }}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active === n.href ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo-daust.png" alt="DAUST" style={{ height: 26, width: "auto" }} />
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              style={{
                background: "transparent", border: "none", color: "rgba(255,255,255,0.65)",
                cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", gap: 5,
                fontFamily: "var(--body)", fontSize: 13, fontWeight: 500, borderRadius: 6,
              }}
            >
              <Globe size={15} />
              <span>{lang}</span>
            </button>
            {langOpen && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff", borderRadius: 8, border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 120, zIndex: 100 }}>
                {(["EN", "FR"] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => { setLang(code); setLangOpen(false); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 16px",
                      fontSize: 13, fontWeight: lang === code ? 600 : 400,
                      color: lang === code ? "var(--orange)" : "var(--fg1)",
                      background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--body)",
                    }}
                  >
                    {code === "EN" ? "English" : "Français"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <a href={`${PORTAL_URL}/login`} className="btn-header btn-header-ghost">{t.nav.portal}</a>
          <button className="btn-header btn-header-primary" onClick={onApply}>{t.nav.applyNow}</button>
          <button className="hdr-burger" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="mobile-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active === n.href ? "active" : ""} onClick={() => setMenuOpen(false)}>
              {n.label}
            </Link>
          ))}
          <a href={`${PORTAL_URL}/login`}>{t.nav.portal}</a>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { t } = useLang();
  return (
    <footer style={{ background: "var(--navy-deep)", color: "#fff" }}>
      <div style={{ padding: "56px clamp(24px, 5vw, 64px) 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40 }}>
          <div>
            <img src="/logo-daust.png" alt="DAUST" style={{ height: 24, width: "auto" }} />
            <p style={{ color: "var(--on-navy-muted)", fontSize: 13, marginTop: 14, maxWidth: 280, lineHeight: 1.6 }}>
              {t.footer.desc}
            </p>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)", marginBottom: 14 }}>{t.footer.study}</div>
            {(["/admissions", "/academics", "/research", "/startups"] as const).map((href, i) => (
              <Link key={href} href={href} className="link-underline" style={{ display: "block", fontSize: 13.5, color: "var(--on-navy-muted)", padding: "5px 0" }}>{t.footer.studyLinks[i]}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)", marginBottom: 14 }}>{t.footer.about}</div>
            {(["/about", "/campus", "/alumni"] as const).map((href, i) => (
              <Link key={href} href={href} className="link-underline" style={{ display: "block", fontSize: 13.5, color: "var(--on-navy-muted)", padding: "5px 0" }}>{t.footer.aboutLinks[i]}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)", marginBottom: 14 }}>{t.footer.contact}</div>
            <a href="mailto:info@daust.org" className="link-underline" style={{ display: "block", fontSize: 13.5, color: "var(--on-navy-muted)", padding: "5px 0" }}>info@daust.org</a>
            <a href="tel:+221774882515" className="link-underline" style={{ display: "block", fontSize: 13.5, color: "var(--on-navy-muted)", padding: "5px 0" }}>+221 77 488 25 15</a>
            <span style={{ display: "block", fontSize: 13.5, color: "var(--on-navy-muted)", padding: "5px 0" }}>Somone, Senegal</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 32, paddingTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 12.5, color: "var(--on-navy-muted)" }}>
          <span>&copy; {new Date().getFullYear()} DAUST. {t.footer.copyright}</span>
          <span>
            <Link href="/privacy" className="link-underline" style={{ color: "var(--on-navy-muted)" }}>{t.footer.privacy}</Link>
            {" "}&middot;{" "}
            <a href="mailto:info@daust.org" className="link-underline" style={{ color: "var(--on-navy-muted)" }}>{t.footer.contact}</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
