"use client";

import Link from "next/link";
import { ArrowRight, Target, FlaskConical, Users, Lightbulb, Rocket, Globe, Quote } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";
import { useLang } from "@/i18n/context";

const PILLAR_ICONS = [Target, FlaskConical, Lightbulb, Users, Rocket, Globe];

export default function AboutPage() {
  const { t } = useLang();
  return (
    <PageFrame active="/about">
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px)" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.about.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 700 }}>{t.about.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{t.about.sub}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div className="reveal">
            <div className="eyebrow">{t.about.mission.eyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{t.about.mission.title}</h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: "22px 0 0" }}>{t.about.mission.p1}</p>
            <p style={{ fontSize: 15.5, lineHeight: 1.75, color: "var(--fg2)", margin: "18px 0 0" }}>{t.about.mission.p2}</p>
            <Link href="/admissions" className="btn btn-primary btn-lg" style={{ marginTop: 32 }}>{t.about.mission.cta} <ArrowRight size={15} /></Link>
          </div>
          <div className="reveal" style={{ position: "relative" }}>
            <div style={{ background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 12, height: 420, overflow: "hidden" }}>
              <img src="/campus.jpg" alt="DAUST Campus" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", left: -16, bottom: -16, background: "var(--orange)", borderRadius: 8, padding: "18px 24px" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 34, color: "#fff", lineHeight: 1 }}>2017</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>Founded in Somone</div>
            </div>
          </div>
        </div>
      </Section>
      <Section bg="var(--navy-deep)" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 56, alignItems: "center" }}>
          <div className="reveal" style={{ textAlign: "center" }}>
            <div style={{ width: 168, height: 168, borderRadius: "50%", background: "linear-gradient(160deg, var(--orange), var(--orange-600))", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 700, fontSize: 56, color: "#fff" }}>
              SN
            </div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "#fff", marginTop: 18 }}>{t.about.leadership.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--on-navy-muted)", marginTop: 2 }}>{t.about.leadership.role}</div>
          </div>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.about.leadership.eyebrow}</div>
            <Quote size={26} color="var(--orange)" style={{ marginTop: 14 }} />
            <p style={{ fontFamily: "var(--display)", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(19px, 2.2vw, 25px)", lineHeight: 1.45, color: "#fff", margin: "10px 0 0" }}>
              &ldquo;{t.about.leadership.quote}&rdquo;
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--on-navy-muted)", margin: "20px 0 0", maxWidth: 560 }}>{t.about.leadership.bio}</p>
          </div>
        </div>
      </Section>
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.about.timeline.eyebrow} title={t.about.timeline.title} />
        <div style={{ marginTop: 44 }}>
          {t.about.timeline.items.map((item, i) => (
            <div key={item.year} className="reveal" style={{ display: "flex", gap: 24, padding: "22px 0", borderBottom: i < t.about.timeline.items.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--orange)", width: 72, flexShrink: 0 }}>{item.year}</div>
              <div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>{item.title}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: "4px 0 0", maxWidth: 560 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <div className="reveal" style={{ marginBottom: 48 }}>
          <div className="eyebrow">{t.about.pillars.eyebrow}</div>
          <h2 className="h2" style={{ marginTop: 10 }}>{t.about.pillars.title}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {t.features.items.map((f, i) => {
            const Icon = PILLAR_ICONS[i] || Target;
            return (
              <div key={f.title} className="reveal card-tilt" style={{ padding: "28px 24px", background: "#fff" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <Icon size={19} color="#fff" />
                </div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{f.title}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <Section bg="#fff" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {t.about.stats.map((stat) => (
            <div key={stat.label} className="reveal card-flat" style={{ padding: "26px 24px" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)" }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: "var(--fg3)", marginTop: 5 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Section>
    </PageFrame>
  );
}
