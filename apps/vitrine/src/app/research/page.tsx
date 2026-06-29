"use client";

import { ArrowRight, Stethoscope, Zap, Wheat, Leaf, Building2, Bot } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";
import { useLang } from "@/i18n/context";

const AREA_ICONS = [Stethoscope, Zap, Wheat, Leaf, Building2, Bot];

export default function ResearchPage() {
  const { t } = useLang();
  return (
    <PageFrame active="/research">
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px)" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.research.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 740 }}>{t.research.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{t.research.sub}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.research.areasEyebrow} title={t.research.areasTitle} sub={t.research.areasSub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 44 }}>
          {t.research.areas.map((a, i) => {
            const Icon = AREA_ICONS[i] || Bot;
            return (
              <div key={a.title} className="reveal card-tilt" style={{ padding: "28px 24px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={20} color="#fff" />
                </div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, marginTop: 18 }}>{a.title}</div>
                <p className="lead" style={{ fontSize: 13.5, marginTop: 8 }}>{a.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
          <div className="reveal">
            <div className="eyebrow">{t.research.centerEyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{t.research.centerTitle}</h2>
            <p className="lead" style={{ marginTop: 18 }}>{t.research.centerSub}</p>
          </div>
          <div className="reveal" style={{ display: "grid", gap: 12 }}>
            {t.research.centerFocus.map((f) => (
              <div key={f} className="card-flat" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--orange)", flexShrink: 0 }} />
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.research.leadershipEyebrow} title={t.research.leadershipTitle} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginTop: 44 }}>
          {t.research.directors.map((d) => (
            <div key={d.name} className="reveal card-tilt" style={{ padding: "22px 22px" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                {d.name.split(" ").map((w) => w[0]).slice(-2).join("")}
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 14.5 }}>{d.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--orange)", fontWeight: 600, marginTop: 3 }}>{d.role}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--fg3)", marginTop: 28 }}>{t.research.associatesNote}</p>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "64px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.research.cta.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(24px, 2.5vw, 34px)", margin: "8px 0 0", lineHeight: 1.1 }}>{t.research.cta.title}</h2>
          </div>
          <a href="mailto:info@daust.org" className="reveal btn btn-primary btn-lg">{t.research.cta.action} <ArrowRight size={15} /></a>
        </div>
      </section>
    </PageFrame>
  );
}
