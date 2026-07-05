"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, GraduationCap, Home, Repeat, ShieldCheck, UserPlus, Utensils, Plus, Minus } from "lucide-react";
import { FEE_STRUCTURE } from "@mydaust/shared";
import { type PublicFee, type PublicTier, getFees, getScholarships } from "@/lib/api";
import { PageFrame, useApply } from "@/components/PageFrame";
import { Heading, Marquee, Section, WaveDivider, emphasize } from "@/components/site";
import { useLang } from "@/i18n/context";

const TRACK_ICONS = [UserPlus, Repeat];
const fmt = (n: number) => n.toLocaleString("en-US");
const FEE_ICONS: Record<string, typeof GraduationCap> = {
  tuition: GraduationCap, housing: Home, cafeteria: Utensils, application_fee: FileText, insurance: ShieldCheck,
};
// Live director-configured fees; shared constants only seed the first paint.
const feeCard = (f: PublicFee) => ({
  label: f.label,
  amount: f.maxXof && f.maxXof !== f.minXof ? `${fmt(f.minXof)} – ${fmt(f.maxXof)}` : fmt(f.minXof),
  unit: f.period === "one-time" ? "FCFA" : `FCFA / ${f.period}`,
  note: f.note ?? "",
  primary: f.key === "tuition",
  icon: FEE_ICONS[f.key] ?? FileText,
});
const FALLBACK_COST = [
  { label: "Tuition", amount: fmt(FEE_STRUCTURE.tuitionPerYear), unit: "FCFA / year", note: `${fmt(FEE_STRUCTURE.tuitionPerSemester)} per semester.`, primary: true, icon: GraduationCap },
  { label: "Housing", amount: fmt(FEE_STRUCTURE.housingPerYear), unit: "FCFA / year", note: "Optional. On-campus residence.", primary: false, icon: Home },
  { label: "Cafeteria", amount: fmt(FEE_STRUCTURE.cafeteriaPerYear), unit: "FCFA / year", note: "Optional. Full pension meal plan.", primary: false, icon: Utensils },
  { label: "Application Fee", amount: fmt(FEE_STRUCTURE.applicationFee), unit: "FCFA", note: "One-time, paid with your application.", primary: false, icon: FileText },
  { label: "Insurance", amount: fmt(FEE_STRUCTURE.insurancePerYear), unit: "FCFA", note: "Annual student insurance.", primary: false, icon: ShieldCheck },
];
const tierCard = (r: PublicTier) => ({ pct: `${r.pct}%`, band: r.band, noteEN: r.note ?? "", noteFR: r.note ?? "" });
const FALLBACK_TIERS = [
  { pct: "20%", band: "BAC 15+", noteEN: "Top of the class, the highest automatic merit discount.", noteFR: "Major de promotion, la plus forte réduction automatique." },
  { pct: "15%", band: "BAC 13.5 – 14.9", noteEN: "Strong academic performance rewarded on enrollment.", noteFR: "Bonne performance académique récompensée à l'inscription." },
  { pct: "10%", band: "BAC 12 – 13.4", noteEN: "A solid foundation earns a meaningful tuition reduction.", noteFR: "Une base solide mérite une réduction significative des frais." },
];

export default function AdmissionsPage() {
  const { lang, t } = useLang();
  const [COST, setCost] = useState(FALLBACK_COST);
  const [TIERS, setTiers] = useState(FALLBACK_TIERS);
  useEffect(() => {
    getFees().then((f) => f.length && setCost(f.map(feeCard))).catch(() => {});
    getScholarships().then((rows) => rows.length && setTiers(rows.sort((a, b) => b.minScore - a.minScore).map(tierCard))).catch(() => {});
  }, []);
  return (
    <PageFrame active="/admissions">
      <section style={{ position: "relative", background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "88px clamp(24px, 5vw, 64px) 104px" }}>
          <div className="reveal">
            <div className="eyebrow" style={{ color: "var(--orange)" }}>{t.admissionsPage.eyebrow}</div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px, 4.8vw, 56px)", lineHeight: 1.05, margin: "14px 0 0", maxWidth: 700 }}>{t.admissionsPage.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "var(--on-navy-muted)", margin: "18px 0 0", maxWidth: 540 }}>{emphasize(t.admissionsPage.sub, t.admissionsPage.emphasizeWords)}</p>
          </div>
        </div>
        <WaveDivider fill="var(--orange)" />
      </section>
      <Marquee items={t.admissionsPage.marquee} />
      <Section bg="#fff" pad="96px 32px">
        <Heading eyebrow={t.admissionsBand.eyebrow} title={t.admissionsPage.howTitle} sub={t.admissionsPage.howSub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginTop: 44 }}>
          {t.admissionsPage.tracks.map((tr, ti) => {
            const TrIcon = TRACK_ICONS[ti] || UserPlus;
            return (
              <div key={tr.title} className="reveal card-flat" style={{ padding: "32px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <TrIcon size={20} color="#fff" />
                  </div>
                  <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19 }}>{tr.title}</div>
                </div>
                {tr.steps.map((s, si) => (
                  <div key={si} style={{ display: "flex", gap: 14, paddingBottom: si < tr.steps.length - 1 ? 18 : 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ width: 28, height: 28, borderRadius: 999, background: "var(--orange)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{si + 1}</span>
                      {si < tr.steps.length - 1 && <span style={{ flex: 1, width: 1.5, background: "var(--border)", marginTop: 4 }} />}
                    </div>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: "var(--fg2)", paddingTop: 3 }}>{s}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <StartCta />
      </Section>
      <Section bg="var(--subtle)" pad="96px 32px">
        <Heading eyebrow={t.admissionsBand.eyebrow} title={t.admissionsPage.costTitle} sub={t.admissionsPage.costSub} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 44 }}>
          {COST.map((c) => (
            <div
              key={c.label}
              className="reveal card tilt-hover"
              style={{
                padding: c.primary ? "32px 28px" : "26px 24px",
                background: c.primary ? "var(--navy)" : "#fff",
                borderColor: c.primary ? "var(--navy)" : undefined,
                display: "flex", flexDirection: "column", gap: 12,
                gridColumn: c.primary ? "span 2" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: c.primary ? "rgba(255,255,255,0.1)" : "var(--subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <c.icon size={17} color={c.primary ? "#fff" : "var(--navy)"} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", color: c.primary ? "#fff" : "var(--fg2)" }}>{c.label}</span>
              </div>
              <div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: c.primary ? 40 : 26, color: c.primary ? "#fff" : "var(--navy)", lineHeight: 1 }}>{c.amount}</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: "var(--orange)", marginTop: 4 }}>{c.unit}</div>
              </div>
              <p style={{ fontSize: c.primary ? 13.5 : 12.5, lineHeight: 1.5, color: c.primary ? "var(--on-navy-muted)" : "var(--fg3)", margin: 0, maxWidth: c.primary ? 360 : undefined }}>{c.note}</p>
            </div>
          ))}
        </div>
      </Section>
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "80px clamp(24px, 5vw, 64px)" }}>
          <Heading eyebrow={t.admissionsBand.eyebrow} title={t.admissionsPage.scholarshipTitle} sub={t.admissionsPage.scholarshipSub} align="center" onNavy />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginTop: 44 }}>
            {TIERS.map((t2) => (
              <div key={t2.pct} className="reveal tilt-hover" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 52, color: "var(--orange)", lineHeight: 1 }}>{t2.pct}</div>
                <div style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", marginTop: 6 }}>discount</div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "#fff", margin: "16px 0 6px" }}>{t2.band}</div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--on-navy-muted)", margin: 0 }}>{lang === "FR" ? t2.noteFR : t2.noteEN}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Section bg="#fff" max={820} pad="96px 32px">
        <Heading eyebrow={t.admissionsBand.eyebrow} title={t.admissionsPage.faqTitle} align="center" />
        <FAQList />
      </Section>
    </PageFrame>
  );
}

function StartCta() {
  const apply = useApply();
  const { t } = useLang();
  return (
    <div className="reveal" style={{ marginTop: 32, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <button className="btn btn-primary btn-lg" onClick={apply}>{t.admissionsPage.cta} <ArrowRight size={15} /></button>
      <span style={{ fontSize: 13.5, color: "var(--fg3)" }}>
        {t.admissionsPage.questions}{" "}
        <a href="mailto:admissions@daust.org" style={{ color: "var(--navy)", fontWeight: 600 }} className="link-underline">admissions@daust.org</a>
      </span>
    </div>
  );
}

function FAQList() {
  const { t } = useLang();
  const [open, setOpen] = useState(0);
  return (
    <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 10 }}>
      {t.admissionsPage.faq.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q} className="reveal" style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: isOpen ? "var(--subtle)" : "#fff", transition: "background 0.15s" }}>
            <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 }}>{q}</span>
              {isOpen ? <Minus size={18} color="var(--orange)" /> : <Plus size={18} color="var(--orange)" />}
            </button>
            {isOpen && <p className="fade-in-down" style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--fg2)", margin: 0, padding: "0 20px 20px" }}>{a}</p>}
          </div>
        );
      })}
    </div>
  );
}
