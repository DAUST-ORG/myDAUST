"use client";

import { Briefcase, CalendarDays, GraduationCap, HeartHandshake, Landmark, Rocket, UserCheck } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section, TriDash } from "@/components/site";

const PATHS = [
  { icon: Briefcase, title: "Industry", desc: "Software, electronics, energy and telecom companies across Africa and globally." },
  { icon: Rocket, title: "Founders", desc: "Alumni turn Technology Ventures projects into companies that hire and build locally." },
  { icon: GraduationCap, title: "Graduate study", desc: "Top master’s and PhD programs, advancing research in their fields." },
  { icon: Landmark, title: "Public impact", desc: "Engineering roles in government, NGOs and institutions driving development." },
];

const STORIES = [
  { tag: "Computer Engineering", quote: "A capstone project on AI for local languages became a startup serving thousands of users." },
  { tag: "Electrical Engineering", quote: "From a renewable-energy lab at DAUST to engineering clean-power systems across the region." },
  { tag: "Technology Ventures", quote: "A HealthTech venture born at DAUST Impact now builds low-cost medical devices." },
];

const CONNECT = [
  { icon: UserCheck, title: "Join the alumni network", desc: "Reconnect with classmates and faculty and mentor the next generation." },
  { icon: CalendarDays, title: "Come back to campus", desc: "Career fairs, DAUST Impact and reunions keep the community close." },
  { icon: HeartHandshake, title: "Give back", desc: "Support scholarships, labs and ventures that shaped your journey." },
];

const STATS: [string, string][] = [
  ["100+", "Student Projects"],
  ["12+", "Nationalities"],
  ["6", "Industries"],
  ["2017", "Founding Class"],
];

export default function AlumniPage() {
  return (
    <PageFrame active="Alumni">
      <Hero />
      <Section bg="#fff">
        <div style={{ maxWidth: 760 }}>
          <div className="eyebrow">The DAUST Network</div>
          <h2 className="h2" style={{ color: "var(--fg1)", margin: "14px 0 0" }}>Engineers shaping Africa&rsquo;s future.</h2>
          <div style={{ margin: "20px 0 24px" }}><TriDash /></div>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: "0 0 18px" }}>
            DAUST graduates carry the university&rsquo;s mission into industry, research and entrepreneurship across the
            continent and beyond — driven by purpose, rooted in local impact.
          </p>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: 0 }}>
            Wherever they go, they stay part of a close, growing community of builders.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24, marginTop: 48 }}>
          {PATHS.map((p) => (
            <div key={p.title} style={{ background: "var(--subtle)", borderRadius: 16, padding: "32px 28px", border: "1px solid var(--border)" }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <p.icon size={25} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", marginBottom: 9 }}>{p.title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <AlumniStats />
      <Section bg="var(--subtle)">
        <Heading eyebrow="Alumni Stories" title="From Somone to the world" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 26, marginTop: 46 }}>
          {STORIES.map((s) => (
            <div key={s.tag} style={{ background: "#fff", borderRadius: 16, border: "1px solid var(--border)", padding: "26px 24px" }}>
              <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#fff", background: "var(--orange)", padding: "4px 11px", borderRadius: 999 }}>
                {s.tag}
              </span>
              <p style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 17.5, lineHeight: 1.4, color: "var(--fg1)", margin: "16px 0 0" }}>
                &ldquo;{s.quote}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </Section>
      <Section bg="#fff">
        <Heading eyebrow="Stay Involved" title="Once DAUST, always DAUST" align="center" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 26, marginTop: 46 }}>
          {CONNECT.map((c) => (
            <div key={c.title} style={{ textAlign: "center", padding: "10px 16px" }}>
              <div style={{ width: 60, height: 60, borderRadius: 999, background: "var(--subtle)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <c.icon size={27} color="var(--navy)" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", marginBottom: 9 }}>{c.title}</div>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--fg2)", margin: "0 auto", maxWidth: 280 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </PageFrame>
  );
}

function Hero() {
  return (
    <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
        <div className="eyebrow">Alumni</div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 780 }}>
          The DAUST community, for life
        </h1>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 660 }}>
          Our graduates are engineers, founders and researchers building Africa&rsquo;s future — and they remain part of the DAUST family long after they leave Somone.
        </p>
      </div>
    </section>
  );
}

function AlumniStats() {
  return (
    <section style={{ background: "var(--navy)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "74px 32px" }}>
        <div className="eyebrow">Our Graduates</div>
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
