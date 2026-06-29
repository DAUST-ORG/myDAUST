"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Cpu,
  FlaskConical,
  GraduationCap,
  Building2,
  Target,
  FlaskRound,
  Rocket,
  Users,
  Lightbulb,
  Languages,
  ClipboardCheck,
  CreditCard,
  Clock,
} from "lucide-react";
import { PageFrame, useApply } from "@/components/PageFrame";
import { AnimatedNumber, Heading, Marquee, Section, WaveDivider, emphasize } from "@/components/site";
import { useLang } from "@/i18n/context";
import { getAnnouncements, type Announcement } from "@/lib/api";

const ICONS = [Cpu, FlaskConical, Building2, FlaskRound, GraduationCap];
const FEATURE_ICONS = [Target, FlaskRound, Lightbulb, Users, Rocket, Languages];

function Hero() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <section style={{ position: "relative", overflow: "hidden", background: "var(--navy)" }}>
      <div
        className="hero-bg"
        style={{ position: "absolute", inset: 0, backgroundImage: "url('/campus.jpg')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.32 }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, var(--navy) 30%, rgba(21,59,106,0.55) 60%, rgba(21,59,106,0.15) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, var(--navy-deep) 0%, transparent 45%)" }} />
      <div style={{ position: "relative", padding: "120px clamp(24px, 5vw, 64px) 104px" }}>
        <div className="reveal" style={{ display: "inline-block", background: "var(--orange)", borderRadius: 4, padding: "5px 12px", marginBottom: 28, transitionDelay: "0ms" }}>
          <span style={{ fontFamily: "var(--body)", fontWeight: 600, fontSize: 12, letterSpacing: "0.06em", color: "#fff" }}>{t.hero.badge}</span>
        </div>
        <h1 className="reveal" style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 1.04, color: "#fff", margin: 0, maxWidth: 780, transitionDelay: "70ms" }}>
          {t.hero.title1} <span style={{ color: "var(--orange)", fontStyle: "italic" }}>{t.hero.title2}</span>
        </h1>
        <p className="reveal" style={{ fontFamily: "var(--body)", fontSize: "clamp(15px, 1.4vw, 17px)", lineHeight: 1.75, color: "var(--on-navy-muted)", maxWidth: 520, margin: "24px 0 36px", transitionDelay: "140ms" }}>
          {emphasize(t.hero.sub, t.hero.emphasizeWords)}
        </p>
        <div className="reveal" style={{ display: "flex", gap: 12, flexWrap: "wrap", transitionDelay: "210ms" }}>
          <button className="btn btn-primary btn-lg" onClick={apply}>{t.hero.apply} <ArrowRight size={16} /></button>
          <Link href="/academics" className="btn btn-outline-light btn-lg">{t.hero.programs}</Link>
        </div>
      </div>
      <WaveDivider fill="var(--orange)" />
    </section>
  );
}

function StatementBand() {
  const { t } = useLang();
  return (
    <section className="statement-band">
      <div style={{ padding: "104px clamp(24px, 5vw, 64px)" }}>
        <p className="reveal statement-text">
          {t.statement.line1}
          <br />
          {t.statement.line2} <span className="accent">{t.statement.accent}</span>
        </p>
      </div>
    </section>
  );
}

function Stats() {
  const { t } = useLang();
  return (
    <section style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
      <div style={{ padding: "0 clamp(24px, 5vw, 64px)", display: "flex" }}>
        {t.stats.map((s, i) => (
          <div key={s.label} className="reveal" style={{ flex: 1, padding: "32px 20px", textAlign: "center", borderRight: i < t.stats.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 34, color: "var(--navy)", lineHeight: 1 }}>
              <AnimatedNumber value={parseInt(s.value) || 0} suffix={s.value.replace(/[0-9]/g, "")} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--fg3)", marginTop: 8, lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useLang();
  return (
    <PageFrame active="/">
      <Hero />
      <Marquee items={[t.hero.badge, ...t.programs.items.map((p) => p.title.toUpperCase())]} />
      <Stats />
      <Section bg="#fff" pad="96px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "48px 72px", alignItems: "start" }}>
          <div className="reveal">
            <div className="eyebrow">{t.programs.eyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{t.programs.title}</h2>
            <p className="lead" style={{ marginTop: 14, maxWidth: 360 }}>{t.programs.sub}</p>
            <div style={{ marginTop: 32 }}>
              <Link href="/academics" className="btn btn-outline btn-sm">{t.programs.viewAll} <ArrowRight size={14} /></Link>
            </div>
          </div>
          <div>
            {t.programs.items.map((p, i) => {
              const Icon = ICONS[i] || Cpu;
              return (
                <div key={p.title} className="reveal" style={{ display: "flex", gap: 18, padding: "22px 0", borderBottom: i < t.programs.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: "var(--subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={19} color="var(--navy)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 }}>{p.title}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{p.duration}</span>
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", margin: "5px 0 0" }}>{p.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>
      <StatementBand />
      <Section bg="var(--subtle)" pad="96px 32px">
        <div className="reveal" style={{ marginBottom: 48 }}>
          <div className="eyebrow">{t.features.eyebrow}</div>
          <h2 className="h2" style={{ marginTop: 10 }}>{t.features.title}</h2>
          <p className="lead" style={{ marginTop: 14, maxWidth: 400 }}>{t.features.sub}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {t.features.items.map((f, i) => {
            const Icon = FEATURE_ICONS[i] || Target;
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
      <NewsSection />
      <AdmissionsSection />
      <CTABand />
    </PageFrame>
  );
}

function NewsSection() {
  const { t } = useLang();
  const [news, setNews] = useState<Announcement[]>([]);
  useEffect(() => { getAnnouncements().then(setNews).catch(() => {}); }, []);
  if (news.length === 0) return null;
  return (
    <Section bg="#fff" pad="96px 32px">
      <Heading eyebrow={t.news.eyebrow} title={t.news.title} sub={t.news.sub} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, marginTop: 44 }}>
        {news.map((n) => (
          <div key={n.id} className="reveal card" style={{ overflow: "hidden" }}>
            <div style={{ height: 160, background: "linear-gradient(135deg, var(--navy), var(--navy-deep))" }} />
            <div style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{n.category}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{n.title}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AdmissionsSection() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <section style={{ background: "var(--navy)", color: "#fff" }}>
      <div style={{ padding: "80px clamp(24px, 5vw, 64px)", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "48px 72px", alignItems: "center" }}>
        <div className="reveal">
          <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.admissionsBand.eyebrow}</div>
          <h2 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(26px, 2.8vw, 36px)", lineHeight: 1.1, margin: "10px 0 0" }}>{t.admissionsBand.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 400 }}>{t.admissionsBand.sub}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={apply}>{t.hero.apply} <ArrowRight size={15} /></button>
            <Link href="/admissions" className="btn btn-outline-light btn-lg">{t.admissionsBand.learnMore}</Link>
          </div>
        </div>
        <div>
          {t.admissionsBand.steps.map((s, i) => {
            const StepIcons = [ClipboardCheck, CreditCard, Clock];
            const I = StepIcons[i];
            return (
              <div key={s.label} className="reveal" style={{ display: "flex", gap: 16, padding: "22px 0", borderBottom: i < t.admissionsBand.steps.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {I && <I size={18} color="var(--orange)" />}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 }}>{s.label}</div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--on-navy-muted)", margin: "3px 0 0" }}>{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CTABand() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <section style={{ background: "var(--navy-deep)", color: "#fff" }}>
      <div style={{ padding: "72px clamp(24px, 5vw, 64px)", textAlign: "center" }}>
        <h2 className="reveal h2" style={{ color: "#fff" }}>{t.cta.title}</h2>
        <p className="reveal lead" style={{ color: "var(--on-navy-muted)", margin: "14px auto 0", maxWidth: 480 }}>{t.cta.sub}</p>
        <button className="reveal btn btn-primary btn-lg" style={{ marginTop: 28 }} onClick={apply}>{t.cta.apply} <ArrowRight size={15} /></button>
      </div>
    </section>
  );
}
