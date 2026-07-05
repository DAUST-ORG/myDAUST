"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function TriDash({ light = false }: { light?: boolean }) {
  return (
    <div className="tri-dash">
      <span style={{ background: light ? "#fff" : "var(--navy)" }} />
      <span style={{ background: "var(--orange)" }} />
      <span style={{ background: "var(--steel)" }} />
    </div>
  );
}

export function Section({
  children,
  bg = "#fff",
  max = 1180,
  pad = "96px 32px",
}: {
  children: React.ReactNode;
  bg?: string;
  max?: number;
  pad?: string;
}) {
  return (
    <section className="v-section" style={{ background: bg, padding: pad }}>
      <div style={{ maxWidth: max, margin: "0 auto" }}>{children}</div>
    </section>
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
    <div style={{ textAlign: align, maxWidth: align === "center" ? 720 : undefined, margin: align === "center" ? "0 auto" : undefined }}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="h2" style={{ color: onNavy ? "#fff" : "var(--fg1)" }}>{title}</h2>
      {sub && <p className="lead" style={{ color: onNavy ? "var(--on-navy-muted)" : "var(--fg2)", marginTop: 16, maxWidth: 680 }}>{sub}</p>}
    </div>
  );
}

// Header carries the core journey; Startups + Alumni live in the footer (and mobile menu).
const NAV = [
  { href: "/admissions", label: "Admissions" },
  { href: "/academics", label: "Academics" },
  { href: "/research", label: "Research" },
  { href: "/campus", label: "Campus" },
  { href: "/about", label: "About" },
];
const ALL_PAGES = [
  { href: "/", label: "Home" },
  ...NAV,
  { href: "/startups", label: "Startups" },
  { href: "/alumni", label: "Alumni" },
];

export function Header({ active, onApply }: { active?: string; onApply: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header style={{ background: "var(--navy)", position: "sticky", top: 0, zIndex: 60 }}>
      {/* Full-bleed bar: logo hugs the viewport edge; content sections keep their own 1180px grid. */}
      <div style={{ padding: "0 clamp(16px, 3vw, 40px)", height: 64, display: "flex", alignItems: "center", gap: 20 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }} onClick={() => setOpen(false)}>
          <img src="/logo-daust.png" alt="DAUST" style={{ height: 24, width: "auto", filter: "brightness(0) invert(1)" }} />
        </Link>
        <nav className="vit-nav" style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                fontFamily: "var(--body)",
                fontWeight: 600,
                fontSize: 14,
                color: active === n.label ? "#fff" : "var(--on-navy-muted)",
                textDecoration: "none",
                padding: "8px 14px",
                borderRadius: 999,
                background: active === n.label ? "rgba(255,255,255,.12)" : "transparent",
                whiteSpace: "nowrap",
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button className="btn btn-primary btn-sm vit-apply" onClick={onApply} style={{ whiteSpace: "nowrap" }}>Apply Now</button>
        <button className="vit-burger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="vit-mobile-menu">
          {ALL_PAGES.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} style={{ display: "block", padding: "13px 24px", fontFamily: "var(--body)", fontWeight: 600, fontSize: 16, color: active === n.label ? "#fff" : "var(--on-navy-muted)", textDecoration: "none", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              {n.label}
            </Link>
          ))}
          <div style={{ padding: "14px 24px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setOpen(false); onApply(); }}>Apply Now</button>
          </div>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ background: "var(--navy-deep)", color: "#fff", padding: "48px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo-daust.png" alt="DAUST" style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)" }} />
            <TriDash light />
          </div>
          <p style={{ color: "var(--on-navy-muted)", fontSize: 13.5, marginTop: 12, maxWidth: 360, lineHeight: 1.6 }}>
            Dakar American University of Science & Technology — an elite American-style engineering education in Senegal.
          </p>
        </div>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13.5, lineHeight: 2 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>University</div>
            {[["/campus", "Campus"], ["/startups", "Startups"], ["/alumni", "Alumni"], ["/about", "About"]].map(([href, label]) => (
              <div key={href}><Link href={href!} style={{ color: "var(--on-navy-muted)", textDecoration: "none" }}>{label}</Link></div>
            ))}
          </div>
          <div style={{ color: "var(--on-navy-muted)", fontSize: 13.5, lineHeight: 2 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Contact</div>
            <div>admissions@daust.org</div>
            <div>+221 78 128 44 58</div>
            <div>Sangalkam, Senegal</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1180, margin: "24px auto 0", borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 18, color: "var(--on-navy-muted)", fontSize: 12.5 }}>
        © {new Date().getFullYear()} DAUST. All rights reserved.
      </div>
    </footer>
  );
}
