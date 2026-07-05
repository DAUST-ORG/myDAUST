"use client";

import Link from "next/link";
import { ArrowRight, Cpu, FlaskConical, Building2, GraduationCap, FlaskRound, BookOpen, Compass } from "lucide-react";
import { PageFrame, useApply } from "@/components/PageFrame";
import { AnimatedNumber, Heading, Marquee, Section, WaveDivider, emphasize } from "@/components/site";
import { useLang } from "@/i18n/context";

const ICONS = [Cpu, FlaskConical, Building2, FlaskRound, GraduationCap];
const PHASE_ICONS = [Compass, BookOpen];
const DEPT_ABBR = ["CS", "ME", "EE", "MATH", "ENG"];

export default function AcademicsPage() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <PageFrame active="/academics">
      <section style={{ position: "relative", background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px) 104px" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.education.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 700 }}>{t.education.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 520 }}>{emphasize(t.education.sub, t.education.emphasizeWords)}</p>
          </div>
        </div>
        <WaveDivider fill="#fff" />
      </section>
      <Section bg="#fff" pad="0px 32px 80px">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
          {t.education.stats.map((s) => (
            <div key={s.label} className="reveal" style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 36, color: "var(--navy)", lineHeight: 1 }}>
                <AnimatedNumber value={parseInt(s.value) || 0} suffix={s.value.replace(/[0-9]/g, "")} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg3)", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Section>
      <Marquee items={t.education.skills} bg="var(--navy-deep)" />
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.programs.eyebrow} title={t.education.sectionTitle} sub={t.education.sectionSub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 44 }}>
          {t.programs.items.map((p, i) => {
            const Icon = ICONS[i] || Cpu;
            return (
              <div key={p.title} className="reveal card-tilt" style={{ padding: "28px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={20} color="#fff" />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 11.5, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.duration}</span>
                </div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, marginTop: 18 }}>{p.title}</div>
                <p className="lead" style={{ fontSize: 13.5, marginTop: 8 }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <Heading eyebrow={t.education.structure.eyebrow} title={t.education.structure.title} sub={t.education.structure.sub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginTop: 44 }}>
          {t.education.structure.phases.map((ph, i) => {
            const Icon = PHASE_ICONS[i] || Compass;
            return (
              <div key={ph.title} className="reveal card-tilt" style={{ padding: "30px 28px", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{ph.years}</div>
                    <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17 }}>{ph.title}</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg2)", margin: "16px 0 0" }}>{ph.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <section style={{ position: "relative", background: "var(--navy-deep)", color: "#fff", overflow: "hidden" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px)", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 56, alignItems: "center" }}>
          <div className="reveal" style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(64px, 9vw, 110px)", lineHeight: 1, color: "var(--orange)" }}>{t.education.unl.badge}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-navy-muted)", marginTop: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.education.unl.badgeLabel}</div>
          </div>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.education.unl.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(22px, 2.6vw, 32px)", margin: "10px 0 0", lineHeight: 1.2 }}>{t.education.unl.title}</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "16px 0 0", maxWidth: 480 }}>{t.education.unl.desc}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.education.faculty.eyebrow} title={t.education.faculty.title} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginTop: 44 }}>
          {t.education.faculty.departments.map((d, i) => (
            <div key={d.name} className="reveal card-tilt" style={{ padding: "22px 22px" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11.5, color: "#fff", marginBottom: 12 }}>
                {DEPT_ABBR[i] || d.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 14.5, color: "var(--navy)", marginBottom: 10 }}>{d.name}</div>
              {d.people.map((p) => (
                <div key={p} style={{ fontSize: 13, color: "var(--fg2)", padding: "4px 0" }}>{p}</div>
              ))}
            </div>
          ))}
        </div>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "64px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.education.cta.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(24px, 2.5vw, 34px)", margin: "8px 0 0", lineHeight: 1.1 }}>{t.education.cta.title}</h2>
          </div>
          <div className="reveal" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={apply}>{t.education.cta.apply} <ArrowRight size={15} /></button>
            <Link href="/admissions" className="btn btn-outline-light btn-lg">{t.education.cta.admissions}</Link>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
