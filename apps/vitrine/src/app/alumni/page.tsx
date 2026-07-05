"use client";

import { Landmark, Building2, FlaskConical, Rocket } from "lucide-react";
import { Heading, Section } from "@/components/site";
import { PageFrame } from "@/components/PageFrame";
import { useLang } from "@/i18n/context";

const SECTOR_ICONS = [Landmark, Building2, FlaskConical, Rocket];

export default function AlumniPage() {
  const { t } = useLang();
  return (
    <PageFrame active="/alumni">
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px)" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.alumni.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 700 }}>{t.alumni.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{t.alumni.sub}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="72px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {t.alumni.stats.map((stat) => (
            <div key={stat.label} className="reveal card-flat" style={{ padding: "26px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 32, color: "var(--navy)" }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: "var(--fg3)", marginTop: 5 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section bg="#fff" pad="0px 32px 72px">
        <Heading eyebrow={t.alumni.sectorsEyebrow} title={t.alumni.sectorsTitle} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 44 }}>
          {t.alumni.sectors.map((s, i) => {
            const Icon = SECTOR_ICONS[i] || Landmark;
            return (
              <div key={s.title} className="reveal card-tilt" style={{ padding: "26px 22px", textAlign: "center" }}>
                <Icon size={24} color="var(--navy)" style={{ margin: "0 auto" }} />
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginTop: 14 }}>{s.title}</div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)", margin: "6px 0 0" }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <Heading eyebrow={t.alumni.testimonialsEyebrow} title={t.alumni.testimonialsTitle} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 44 }}>
          {t.alumni.testimonials.map((tm) => (
            <div key={tm.name} className="reveal card" style={{ padding: "30px 28px", background: "#fff" }}>
              <p style={{ fontFamily: "var(--display)", fontStyle: "italic", fontSize: 17, lineHeight: 1.55, color: "var(--fg1)", margin: 0 }}>&ldquo;{tm.quote}&rdquo;</p>
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {tm.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{tm.name}</div>
                  <div style={{ fontSize: 12, color: "var(--fg3)" }}>{tm.cohort}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "64px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.alumni.cta.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(24px, 2.5vw, 34px)", margin: "8px 0 0", lineHeight: 1.1 }}>{t.alumni.cta.title}</h2>
          </div>
          <a href="https://www.linkedin.com/company/daustofficial" target="_blank" rel="noreferrer" className="reveal btn btn-primary btn-lg">{t.alumni.cta.action}</a>
        </div>
      </section>
    </PageFrame>
  );
}
