"use client";

import { ArrowRight, Home, ShieldCheck, Users, Dumbbell, PartyPopper, Globe, MapPin, Plane, Waves } from "lucide-react";
import { PageFrame, useApply } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";
import { useLang } from "@/i18n/context";

const FEATURE_ICONS = [Home, ShieldCheck, Users, Dumbbell, PartyPopper, Globe];
const VISIT_ICONS = [MapPin, Plane, Waves];

export default function CampusPage() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <PageFrame active="/campus">
      <section style={{ position: "relative", overflow: "hidden", background: "var(--navy)" }}>
        <div className="hero-bg" style={{ position: "absolute", inset: 0, backgroundImage: "url('/campus.jpg')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.32 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, var(--navy) 30%, rgba(21,59,106,0.55) 60%, rgba(21,59,106,0.15) 100%)" }} />
        <div style={{ position: "relative", padding: "88px clamp(24px, 5vw, 64px)" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.campus.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", color: "#fff", maxWidth: 700 }}>{t.campus.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{t.campus.sub}</p>
          </div>
        </div>
      </section>
      <Section bg="#fff" pad="64px 32px">
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gridTemplateRows: "1fr 1fr", gap: 14, height: 420 }}>
          <div className="reveal card-tilt" style={{ gridRow: "1 / 3", overflow: "hidden", borderRadius: 14 }}>
            <img src="/campus.jpg" alt="DAUST residences in Somone" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "30% 50%" }} />
          </div>
          <div className="reveal card-tilt" style={{ overflow: "hidden", borderRadius: 14 }}>
            <img src="/campus.jpg" alt="DAUST campus courtyard" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "70% 20%" }} />
          </div>
          <div className="reveal card-tilt" style={{ overflow: "hidden", borderRadius: 14, position: "relative" }}>
            <img src="/campus.jpg" alt="DAUST campus, Somone, Thiès" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 80%" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(15,44,80,0.7), transparent 60%)" }} />
            <div style={{ position: "absolute", left: 16, bottom: 14, color: "#fff", fontSize: 12.5, fontWeight: 600 }}>Somone, Thiès</div>
          </div>
        </div>
      </Section>
      <Section bg="#fff" pad="40px 32px 96px">
        <Heading eyebrow={t.campus.featuresEyebrow} title={t.campus.featuresTitle} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 44 }}>
          {t.campus.features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] || Home;
            return (
              <div key={f.title} className="reveal card-tilt" style={{ padding: "28px 24px" }}>
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
      <Section bg="var(--subtle)" pad="96px 32px">
        <Heading eyebrow={t.campus.visitEyebrow} title={t.campus.visitTitle} sub={t.campus.visitSub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, marginTop: 44 }}>
          {t.campus.visit.map((v, i) => {
            const Icon = VISIT_ICONS[i] || MapPin;
            return (
              <div key={v.title} className="reveal card-tilt" style={{ padding: "26px 24px", background: "#fff" }}>
                <Icon size={22} color="var(--orange)" />
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15.5, marginTop: 14 }}>{v.title}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", margin: "6px 0 0" }}>{v.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "64px clamp(24px, 5vw, 64px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.campus.cta.eyebrow}</div>
            <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "clamp(24px, 2.5vw, 34px)", margin: "8px 0 0", lineHeight: 1.1 }}>{t.campus.cta.title}</h2>
          </div>
          <button className="reveal btn btn-primary btn-lg" onClick={apply}>{t.campus.cta.action} <ArrowRight size={15} /></button>
        </div>
      </section>
    </PageFrame>
  );
}
