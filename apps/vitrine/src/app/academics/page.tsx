"use client";

import { Cpu, FlaskConical, Building2, GraduationCap } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";

const PROGRAMS = [
  { icon: Cpu, title: "B.Sc. Computer Engineering", years: "4 years", desc: "Algorithms, data structures, operating systems, networks, and embedded software — with hands-on labs every term." },
  { icon: FlaskConical, title: "B.Sc. Electrical Engineering", years: "4 years", desc: "Circuit analysis, digital systems, signals, and power — the foundation for a connected, electrified world." },
  { icon: Building2, title: "B.Sc. Mechanical Engineering", years: "2+2 with UNL", desc: "Two years at DAUST, then transfer to the University of Nebraska–Lincoln for a joint Bachelor degree." },
  { icon: GraduationCap, title: "Intensive English Program", years: "1 semester", desc: "A bridge program for non-English speakers, taken before degree coursework begins." },
];

export default function AcademicsPage() {
  return (
    <PageFrame active="Academics">
      <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
          <div className="eyebrow">Academics</div>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 760 }}>Programs that open doors</h1>
          <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 560 }}>Rigorous, English-taught engineering degrees with a clear path to global careers and graduate study.</p>
        </div>
      </section>
      <Section bg="#fff">
        <Heading eyebrow="Undergraduate" title="Our degree programs" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, marginTop: 44 }}>
          {PROGRAMS.map((p) => (
            <div key={p.title} style={{ background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 16, padding: "28px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p.icon size={22} color="#fff" />
                </div>
                <span style={{ fontWeight: 600, fontSize: 12, color: "var(--orange)", textTransform: "uppercase", letterSpacing: ".05em" }}>{p.years}</span>
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, marginTop: 16 }}>{p.title}</div>
              <p className="lead" style={{ fontSize: 14, marginTop: 8 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </PageFrame>
  );
}
