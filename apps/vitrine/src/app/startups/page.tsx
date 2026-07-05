"use client";

import { ArrowRight, Lightbulb, TrendingUp, Wrench, Banknote, Scale, Trophy, Check } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";
import { useLang } from "@/i18n/context";

const STEP_ICONS = [Lightbulb, TrendingUp, Wrench, Banknote, Scale, Trophy];

export default function StartupsPage() {
  const { t } = useLang();
  return (
    <PageFrame active="/startups">
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px)" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.startups.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 700 }}>{t.startups.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{t.startups.sub}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.startups.stepsEyebrow} title={t.startups.stepsTitle} sub={t.startups.stepsSub} />
        <div style={{ marginTop: 44 }}>
          {t.startups.steps.map((s, i) => {
            const Icon = STEP_ICONS[i] || Lightbulb;
            return (
              <div key={s.title} className="reveal" style={{ display: "flex", gap: 20, padding: "24px 0", borderBottom: i < t.startups.steps.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, color: "var(--orange)" }}>{String(i + 1).padStart(2, "0")}</span>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
                    <Icon size={19} color="var(--navy)" />
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17 }}>{s.title}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "6px 0 0", maxWidth: 520 }}>{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>
          <div className="reveal">
            <div className="eyebrow">{t.startups.domainsEyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{t.startups.domainsTitle}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
              {t.startups.domains.map((d) => (
                <span key={d} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{d}</span>
              ))}
            </div>
          </div>
          <div className="reveal">
            <div className="eyebrow">{t.startups.getEyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{t.startups.getTitle}</h2>
            <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
              {t.startups.benefits.map((b) => (
                <div key={b} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Check size={16} color="var(--orange)" style={{ marginTop: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "var(--fg2)" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "64px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.startups.cta.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(24px, 2.5vw, 34px)", margin: "8px 0 0", lineHeight: 1.1 }}>{t.startups.cta.title}</h2>
          </div>
          <a href="mailto:info@daust.org" className="reveal btn btn-primary btn-lg">{t.startups.cta.action} <ArrowRight size={15} /></a>
        </div>
      </section>
    </PageFrame>
  );
}
