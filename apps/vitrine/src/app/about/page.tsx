"use client";

import { PageFrame } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";

export default function AboutPage() {
  return (
    <PageFrame active="About">
      <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
          <div className="eyebrow">About DAUST</div>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 760 }}>Engineering Africa&rsquo;s future</h1>
          <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 580 }}>
            DAUST is an independent, American-style university in Senegal, dedicated to producing world-class engineers and scientists.
          </p>
        </div>
      </section>
      <Section bg="#fff">
        <Heading eyebrow="Our mission" title="World-class, and rooted in Senegal" sub="We combine the rigor of an American engineering curriculum with deep roots in the region we serve — preparing graduates who lead, build, and innovate at home and abroad." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 22, marginTop: 44 }}>
          {[["100%", "Graduate employment"], ["English", "Language of instruction"], ["ANAQ-Sup", "Nationally accredited"], ["UNL", "2+2 partnership, USA"]].map(([v, l]) => (
            <div key={l} style={{ background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 16, padding: "26px 24px" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--navy)" }}>{v}</div>
              <div style={{ fontSize: 13.5, color: "var(--fg3)", marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
      </Section>
    </PageFrame>
  );
}
