"use client";

import { Box, Coins, FlaskConical, Hammer, Lightbulb, Presentation, Rocket, Users } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section, TriDash } from "@/components/site";

const PHASES = [
  { icon: Lightbulb, title: "Ideate", desc: "Spot a real problem worth solving and shape it into a venture concept." },
  { icon: Hammer, title: "Prototype", desc: "Build an MVP in our studios with engineering and design support." },
  { icon: FlaskConical, title: "Validate", desc: "Test with real users, refine the model, and prepare to scale." },
  { icon: Rocket, title: "Launch", desc: "Pitch for seed support and take your company to market." },
];

const SUPPORT = [
  { icon: Users, title: "Mentorship network", desc: "Guidance from founders, faculty and industry partners at every stage." },
  { icon: Box, title: "Prototyping studios", desc: "Access to labs, equipment and engineering support to build real products." },
  { icon: Presentation, title: "Pitch & demo days", desc: "Showcase ventures to investors, partners and the DAUST community." },
  { icon: Coins, title: "Seed support", desc: "Pathways to early funding to turn validated ideas into companies." },
];

const SECTORS = ["Robotics", "HealthTech", "Agriculture", "Space Technology", "AI Tools", "Clean Energy"];

const STATS: [string, string][] = [
  ["100+", "Student Projects"],
  ["1000+", "Impact Attendees"],
  ["6", "Venture Sectors"],
  ["4", "Year Startup Track"],
];

export default function StartupsPage() {
  return (
    <PageFrame active="Startups">
      <Hero />
      <Section bg="#fff">
        <div style={{ maxWidth: 760 }}>
          <div className="eyebrow">The Program</div>
          <h2 className="h2" style={{ color: "var(--fg1)", margin: "14px 0 0" }}>From the classroom to the market.</h2>
          <div style={{ margin: "20px 0 24px" }}><TriDash /></div>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: "0 0 18px" }}>
            The DAUST Technology Ventures program empowers students to develop entrepreneurial skills, create new
            technologies, and bring innovative ideas to market.
          </p>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: 0 }}>
            It&rsquo;s where engineering projects become companies — driven by purpose and rooted in local impact.
          </p>
        </div>
      </Section>
      <Section bg="var(--subtle)">
        <Heading eyebrow="How It Works" title="The venture pipeline" align="center" sub="A structured path from a class project to a funded, market-ready company." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24, marginTop: 50 }}>
          {PHASES.map((p, i) => (
            <div key={p.title} style={{ position: "relative", background: "#fff", borderRadius: 16, padding: "30px 26px", border: "1px solid var(--border)" }}>
              <div style={{ position: "absolute", top: 22, right: 24, fontFamily: "var(--display)", fontWeight: 800, fontSize: 34, color: "var(--border)", lineHeight: 1 }}>
                0{i + 1}
              </div>
              <div style={{ width: 50, height: 50, borderRadius: 13, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <p.icon size={23} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "var(--fg1)", marginBottom: 8 }}>{p.title}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section bg="#fff">
        <Heading eyebrow="What You Get" title="Everything you need to build" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24, marginTop: 48 }}>
          {SUPPORT.map((s) => (
            <div key={s.title} style={{ borderTop: "3px solid var(--orange)", background: "var(--subtle)", borderRadius: "4px 4px 16px 16px", padding: "28px 26px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <s.icon size={23} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--fg1)", marginBottom: 8 }}>{s.title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <Showcase />
    </PageFrame>
  );
}

function Hero() {
  return (
    <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
        <div className="eyebrow">Technology Ventures</div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 800 }}>
          Build the company, not just the project
        </h1>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 640 }}>
          DAUST&rsquo;s startup program turns student engineering into ventures with real impact — entrepreneurship, prototyping and go-to-market for founders.
        </p>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section style={{ background: "var(--navy)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "84px 32px" }}>
        <div style={{ maxWidth: 680 }}>
          <div className="eyebrow">Student Ventures</div>
          <h2 className="h2" style={{ color: "#fff", margin: "14px 0 0" }}>Ideas across every field that matters</h2>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--on-navy-muted)", margin: "20px 0 0" }}>
            From low-cost medical devices to AI-powered tools and sustainable farming solutions, DAUST ventures
            reflect the creativity and determination of our students.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34 }}>
          {SECTORS.map((c) => (
            <span key={c} style={{ fontWeight: 600, fontSize: 14.5, color: "#fff", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: "11px 22px" }}>
              {c}
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 28, marginTop: 56 }}>
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
