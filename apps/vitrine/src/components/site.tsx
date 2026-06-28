"use client";

import Link from "next/link";

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
    <section style={{ background: bg, padding: pad }}>
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

const NAV = [
  { href: "/", label: "Home" },
  { href: "/admissions", label: "Admissions" },
  { href: "/academics", label: "Academics" },
  { href: "/about", label: "About" },
];

export function Header({ active, onApply }: { active?: string; onApply: () => void }) {
  return (
    <header style={{ background: "var(--navy)", position: "sticky", top: 0, zIndex: 60 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px", height: 68, display: "flex", alignItems: "center", gap: 24 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: ".04em" }}>DAUST</span>
          <TriDash light />
        </Link>
        <nav style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
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
                padding: "8px 16px",
                borderRadius: 999,
                background: active === n.label ? "rgba(255,255,255,.12)" : "transparent",
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button className="btn btn-primary btn-sm" onClick={onApply}>Apply Now</button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ background: "var(--navy-deep)", color: "#fff", padding: "48px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, letterSpacing: ".04em" }}>DAUST</span>
            <TriDash light />
          </div>
          <p style={{ color: "var(--on-navy-muted)", fontSize: 13.5, marginTop: 12, maxWidth: 360, lineHeight: 1.6 }}>
            Dakar American University of Science & Technology — an elite American-style engineering education in Senegal.
          </p>
        </div>
        <div style={{ color: "var(--on-navy-muted)", fontSize: 13.5, lineHeight: 1.8 }}>
          <div>admissions@daust.org</div>
          <div>+221 78 128 44 58</div>
          <div>Sangalkam, Senegal</div>
        </div>
      </div>
      <div style={{ maxWidth: 1180, margin: "24px auto 0", borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 18, color: "var(--on-navy-muted)", fontSize: 12.5 }}>
        © {new Date().getFullYear()} DAUST. All rights reserved.
      </div>
    </footer>
  );
}
