"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, GraduationCap, Home, Repeat, ShieldCheck, UserPlus, Utensils, Plus, Minus } from "lucide-react";
import { FEE_STRUCTURE, SCHOLARSHIP_TIERS } from "@mydaust/shared";
import { type PublicFee, type PublicTier, getFees, getScholarships } from "@/lib/api";
import { PageFrame, useApply } from "@/components/PageFrame";
import { Heading, Section } from "@/components/site";

const TRACKS = [
  {
    title: "First-Year Undergraduate",
    icon: UserPlus,
    steps: [
      "Submit the online application",
      "Submit official documents to the Office of Admissions (high-school diploma or equivalent)",
      "Submit transcripts from 11th & 12th grades (Première and Terminale)",
      "Pay the application fee of 30,000 FCFA",
    ],
  },
  {
    title: "Transfer Student",
    icon: Repeat,
    steps: [
      "Submit the online application",
      "Submit official degree transcripts from your previous school",
      "Pay the application fee of 30,000 FCFA",
    ],
  },
];

const fmt = (n: number) => n.toLocaleString("en-US");

const FEE_ICONS: Record<string, typeof GraduationCap> = {
  tuition: GraduationCap,
  housing: Home,
  cafeteria: Utensils,
  application_fee: FileText,
  insurance: ShieldCheck,
};

// Offline fallbacks (shared seed constants); replaced by the director's live values on load.
const FALLBACK_FEES: PublicFee[] = [
  { key: "tuition", label: "Tuition", minXof: FEE_STRUCTURE.tuitionPerYear, maxXof: null, period: "year", note: "Half per semester · monthly installments available" },
  { key: "housing", label: "Housing", minXof: FEE_STRUCTURE.housingPerYear, maxXof: null, period: "year", note: "Optional · on-campus residence" },
  { key: "cafeteria", label: "Cafeteria", minXof: FEE_STRUCTURE.cafeteriaPerYear, maxXof: null, period: "year", note: "Optional · full pension meal plan" },
  { key: "application_fee", label: "Application Fee", minXof: FEE_STRUCTURE.applicationFee, maxXof: null, period: "one-time", note: "One-time, paid with your application" },
  { key: "insurance", label: "Insurance", minXof: FEE_STRUCTURE.insurancePerYear, maxXof: null, period: "year", note: "Annual student insurance" },
];
const FALLBACK_TIERS = SCHOLARSHIP_TIERS.map((t, i) => ({ id: String(i), minScore: t.minScore, pct: t.pct, band: t.band, note: t.note ?? null }));

function feeCard(f: PublicFee) {
  return {
    label: f.label,
    amount: f.maxXof != null ? `${fmt(f.minXof)} – ${fmt(f.maxXof)}` : fmt(f.minXof),
    unit: f.period === "one-time" ? "FCFA" : `FCFA / ${f.period}`,
    note: f.note ?? "",
    primary: f.key === "tuition",
    icon: FEE_ICONS[f.key] ?? FileText,
  };
}

const FAQS = [
  ["Is DAUST recognized by the Government?", "Yes. DAUST is nationally and internationally recognized, with habilitation from ANAQ-Sup."],
  ["Do I need to speak English to be admitted?", "No. After admission, DAUST offers a one-semester Intensive English Program (IEP) for non-English speakers."],
  ["Can I transfer to an American university after two years?", "Yes. We have a 2+2 partnership with the University of Nebraska (UNL) for a joint Bachelor in Mechanical Engineering."],
  ["Will I get a job after my degree?", "To this day, 100% of DAUST graduates are fully employed."],
];

export default function AdmissionsPage() {
  const [fees, setFees] = useState<PublicFee[]>(FALLBACK_FEES);
  const [tiers, setTiers] = useState<PublicTier[]>(FALLBACK_TIERS);
  useEffect(() => {
    getFees().then(setFees).catch(() => {});
    getScholarships().then(setTiers).catch(() => {});
  }, []);
  const COST = fees.map(feeCard);
  const TIERS = tiers.map((t) => ({ pct: `${t.pct}%`, band: t.band, note: t.note ?? "" }));
  return (
    <PageFrame active="Admissions">
      <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
          <div className="eyebrow">Admissions · September 2026</div>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 760 }}>Join us at DAUST</h1>
          <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 580 }}>
            Want an elite American engineering education while staying close to home? Admissions for the September 2026 intake are open now.
          </p>
        </div>
      </section>

      <Section bg="#fff">
        <Heading eyebrow="Admission Procedures" title="How to apply" sub="Two simple tracks — pick the one that fits you." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 26, marginTop: 44 }}>
          {TRACKS.map((t) => (
            <div key={t.title} style={{ background: "var(--subtle)", borderRadius: 18, padding: "34px 32px", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
                <div style={{ width: 52, height: 52, borderRadius: 13, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <t.icon size={24} color="#fff" />
                </div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 21 }}>{t.title}</div>
              </div>
              {t.steps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 16, paddingBottom: i < t.steps.length - 1 ? 18 : 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(--orange)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{i + 1}</span>
                    {i < t.steps.length - 1 && <span style={{ flex: 1, width: 2, background: "var(--border)", marginTop: 4 }} />}
                  </div>
                  <span style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--fg2)", paddingTop: 4 }}>{s}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <StartCta />
      </Section>

      <Section bg="var(--subtle)">
        <Heading eyebrow="Cost of Attendance" title="An elite education, at a fraction of the cost" sub="A top American-style engineering education in Senegal, at a fraction of the cost of studying in the USA, UK or Canada." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 22, marginTop: 44 }}>
          {COST.map((c) => (
            <div key={c.label} style={{ background: c.primary ? "var(--navy)" : "#fff", borderRadius: 16, padding: "28px 26px", border: c.primary ? "none" : "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: c.primary ? "rgba(255,255,255,.12)" : "var(--subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <c.icon size={20} color={c.primary ? "#fff" : "var(--navy)"} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", color: c.primary ? "#fff" : "var(--fg2)" }}>{c.label}</span>
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: c.primary ? "#fff" : "var(--navy)", lineHeight: 1 }}>{c.amount}</div>
              <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--orange)", marginTop: 6 }}>{c.unit}</div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: c.primary ? "var(--on-navy-muted)" : "var(--fg3)", margin: "12px 0 0" }}>{c.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <section style={{ background: "var(--navy)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
        <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "80px 32px" }}>
          <Heading eyebrow="Scholarships & Financial Aid" title="Merit scholarships, awarded on your BAC" sub="Your Baccalauréat results automatically unlock a tuition discount — talent should never be limited by means." align="center" onNavy />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 22, marginTop: 44 }}>
            {TIERS.map((t) => (
              <div key={t.pct} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 18, padding: "32px 28px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 56, color: "var(--orange)", lineHeight: 1 }}>{t.pct}</div>
                <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", marginTop: 8 }}>discount</div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, color: "#fff", margin: "16px 0 8px" }}>{t.band}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--on-navy-muted)", margin: 0 }}>{t.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section bg="#fff" max={860}>
        <Heading eyebrow="Questions" title="Frequently asked" align="center" />
        <FAQList />
      </Section>
    </PageFrame>
  );
}

function StartCta() {
  const apply = useApply();
  return (
    <div style={{ marginTop: 32, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <button className="btn btn-primary btn-lg" onClick={apply}>Start your application <ArrowRight size={16} /></button>
      <span style={{ fontSize: 14, color: "var(--fg3)" }}>Questions? <a href="mailto:admissions@daust.org" style={{ color: "var(--navy)", fontWeight: 600 }}>admissions@daust.org</a></span>
    </div>
  );
}

function FAQList() {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
      {FAQS.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q} style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: isOpen ? "var(--subtle)" : "#fff" }}>
            <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "20px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16.5 }}>{q}</span>
              {isOpen ? <Minus size={20} color="var(--orange)" /> : <Plus size={20} color="var(--orange)" />}
            </button>
            {isOpen && <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--fg2)", margin: 0, padding: "0 22px 22px" }}>{a}</p>}
          </div>
        );
      })}
    </div>
  );
}
