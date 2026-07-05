"use client";

import Link from "next/link";
import { ArrowRight, Cpu, FlaskConical, GraduationCap, Building2 } from "lucide-react";
import { PageFrame, useApply } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";

function Hero() {
  const apply = useApply();
  return (
    <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "110px 32px 96px", textAlign: "center", color: "#fff" }}>
        <div className="eyebrow">Dakar American University of Science & Technology</div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(36px,5vw,64px)", lineHeight: 1.05, margin: "16px auto 0", maxWidth: 860 }}>
          An elite engineering education, <span style={{ color: "var(--orange)" }}>close to home</span>
        </h1>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "20px auto 0", maxWidth: 600 }}>
          American-style science & technology degrees in Senegal — taught in English, at a fraction of the cost of studying abroad.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={apply}>Apply Now <ArrowRight size={16} /></button>
          <Link href="/academics" className="btn btn-outline-light btn-lg">Explore programs</Link>
        </div>
        <div style={{ display: "flex", gap: 48, justifyContent: "center", marginTop: 64, flexWrap: "wrap" }}>
          {[["100%", "Graduates employed"], ["2+2", "Transfer to UNL, USA"], ["20%", "Max merit scholarship"]].map(([v, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 40, color: "var(--orange)", lineHeight: 1 }}>{v}</div>
              <div style={{ color: "var(--on-navy-muted)", fontSize: 13, marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROGRAMS = [
  { icon: Cpu, title: "Computer Engineering", desc: "Software, systems, and hardware — the backbone of modern technology." },
  { icon: FlaskConical, title: "Electrical Engineering", desc: "Circuits, embedded systems, and power for a connected world." },
  { icon: Building2, title: "Mechanical Engineering", desc: "Design and build, with a 2+2 joint degree path to UNL (USA)." },
  { icon: GraduationCap, title: "Intensive English Program", desc: "A one-semester bridge for non-English speakers before degree study." },
];

export default function HomePage() {
  return (
    <PageFrame active="Home">
      <Hero />
      <Section bg="#fff">
        <Heading eyebrow="Programs" title="Built for the engineers Africa needs" sub="Rigorous, hands-on degrees taught in English by an international faculty." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 22, marginTop: 44 }}>
          {PROGRAMS.map((p) => (
            <div key={p.title} style={{ background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 16, padding: "28px 26px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <p.icon size={22} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 }}>{p.title}</div>
              <p className="lead" style={{ fontSize: 14, marginTop: 8 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <CTABand />
    </PageFrame>
  );
}

function CTABand() {
  const apply = useApply();
  return (
    <section style={{ background: "var(--navy)", color: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 32px", textAlign: "center" }}>
        <h2 className="h2" style={{ color: "#fff" }}>Your future starts here</h2>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "14px auto 0", maxWidth: 540 }}>
          Admissions for September 2026 are open. No account needed to apply.
        </p>
        <button className="btn btn-primary btn-lg" style={{ marginTop: 28 }} onClick={apply}>Start your application <ArrowRight size={16} /></button>
      </div>
    </section>
  );
}
