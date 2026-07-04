"use client";

import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, Cpu, HeartPulse, Leaf, Radio, Sun } from "lucide-react";
import { PageFrame, useApply } from "@/components/PageFrame";
import { Heading, Section, TriDash } from "@/components/site";

const AREAS = [
  { icon: Cpu, title: "Artificial Intelligence", desc: "Machine learning for African languages, agriculture, and health — building models that serve local needs." },
  { icon: Sun, title: "Renewable Energy", desc: "Solar, storage and smart grids engineered for reliable power across the continent." },
  { icon: Bot, title: "Robotics & Automation", desc: "Autonomous systems and embedded robotics, from competition platforms to industrial applications." },
  { icon: Radio, title: "Connectivity & Networks", desc: "Communications, IoT and infrastructure that ensure inclusive participation in emerging technology." },
  { icon: Leaf, title: "Sustainable Systems", desc: "Engineering for climate resilience, clean water and the environment." },
  { icon: HeartPulse, title: "Engineering for Health", desc: "Affordable medical devices and data systems for health challenges that matter here." },
];

const STATS: [string, string][] = [
  ["100+", "Student Projects"],
  ["1000+", "Guests & Attendees"],
  ["6", "Research Areas"],
  ["25+", "Industry Partners"],
];

export default function ResearchPage() {
  return (
    <PageFrame active="Research">
      <Hero />
      <Section bg="#fff">
        <Heading
          eyebrow="Research Areas"
          title="Driven by purpose, rooted in local impact"
          sub="DAUST research ensures inclusive participation of Africa in the technologies shaping tomorrow."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 26, marginTop: 50 }}>
          {AREAS.map((a) => (
            <div key={a.title} style={{ background: "var(--subtle)", borderRadius: 16, padding: "32px 30px", border: "1px solid var(--border)" }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <a.icon size={25} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, color: "var(--fg1)", marginBottom: 9 }}>{a.title}</div>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--fg2)", margin: 0 }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <ImpactStats />
      <Ventures />
    </PageFrame>
  );
}

function Hero() {
  return (
    <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
        <div className="eyebrow">Research & Innovation</div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 780 }}>
          Ensuring Africa has a seat at the table
        </h1>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 640 }}>
          Research at DAUST is driven by purpose and rooted in local impact — advancing the emerging technologies that will shape the continent&rsquo;s future.
        </p>
      </div>
    </section>
  );
}

function ImpactStats() {
  return (
    <section style={{ background: "var(--navy)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "74px 32px" }}>
        <div className="eyebrow">DAUST Impact 2025</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 28, marginTop: 28 }}>
          {STATS.map(([v, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 42, color: "var(--orange)", lineHeight: 1 }}>{v}</div>
              <div style={{ color: "var(--on-navy-muted)", fontSize: 13.5, marginTop: 8 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Ventures() {
  const apply = useApply();
  return (
    <Section bg="var(--subtle)">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 60, alignItems: "center" }}>
        <div>
          <div className="eyebrow">Technology Ventures</div>
          <h2 className="h2" style={{ color: "var(--fg1)", margin: "14px 0 0" }}>From the lab to the market.</h2>
          <div style={{ margin: "20px 0 22px" }}><TriDash /></div>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--fg2)", margin: "0 0 22px" }}>
            Our Technology Ventures program empowers students to build entrepreneurial skills and bring new
            technologies to market — turning research and class projects into companies with real impact.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            {["Venture design & prototyping studios", "Mentorship from founders and industry", "Pitch events, demo days and seed support"].map((it) => (
              <div key={it} style={{ display: "flex", gap: 11, alignItems: "center" }}>
                <CheckCircle2 size={19} color="var(--orange)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: "var(--fg2)" }}>{it}</span>
              </div>
            ))}
          </div>
          <Link href="/startups" className="btn btn-lg" style={{ background: "var(--navy)", color: "#fff" }}>
            Explore the program <ArrowRight size={16} />
          </Link>
        </div>
        <div style={{ background: "var(--navy)", borderRadius: 18, padding: "48px 40px", color: "#fff" }}>
          <div className="eyebrow">Featured</div>
          <h3 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(24px,2.6vw,34px)", margin: "16px 0 0", lineHeight: 1.1 }}>
            Le Sénégal décroche la Lune
          </h3>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--on-navy-muted)", margin: "18px 0 26px" }}>
            Why 2026 marks a historic turning point for African innovation — and the role DAUST students and researchers are playing in it.
          </p>
          <button className="btn btn-outline-light" onClick={apply}>Join the mission <ArrowRight size={16} /></button>
        </div>
      </div>
    </Section>
  );
}
