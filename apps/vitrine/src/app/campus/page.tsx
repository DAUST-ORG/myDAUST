"use client";

import { CalendarDays, Home, Trophy, Users } from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { Heading, Section, TriDash } from "@/components/site";

const LIFE = [
  { icon: Users, title: "Student Organizations", desc: "Robotics, coding, entrepreneurship and cultural clubs led entirely by students." },
  { icon: Trophy, title: "Sports & Wellness", desc: "Football, basketball and fitness facilities — plus the beaches of Somone nearby." },
  { icon: CalendarDays, title: "Events & Traditions", desc: "DAUST Impact, the Career Fair and flagship celebrations of African talent." },
  { icon: Home, title: "Residential Campus", desc: "On-campus housing and dining create a close, supportive community." },
];

const STATS: [string, string][] = [
  ["1000+", "Guests & Attendees"],
  ["100+", "Student Projects"],
  ["15+", "Student Clubs"],
  ["12+", "Nationalities"],
];

export default function CampusPage() {
  return (
    <PageFrame active="Campus">
      <Hero />
      <Section bg="#fff">
        <div style={{ maxWidth: 760 }}>
          <div className="eyebrow">Life @ DAUST</div>
          <h2 className="h2" style={{ color: "var(--fg1)", margin: "14px 0 0" }}>A home away from home.</h2>
          <div style={{ margin: "20px 0 24px" }}><TriDash /></div>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: "0 0 18px" }}>
            DAUST offers a powerfully positive environment — a residential campus in the natural resort town of
            Somone where students live, learn and build lifelong friendships.
          </p>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--fg2)", margin: 0 }}>
            Between the labs and lecture halls, life here is full: student organizations, sports, cultural events
            and a tight-knit community drawn from across Africa.
          </p>
        </div>
      </Section>
      <Section bg="var(--subtle)">
        <Heading eyebrow="Get Involved" title="More than a degree" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24, marginTop: 48 }}>
          {LIFE.map((it) => (
            <div key={it.title} style={{ borderTop: "3px solid var(--orange)", background: "#fff", borderRadius: "4px 4px 16px 16px", padding: "28px 26px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <it.icon size={23} color="#fff" />
              </div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17.5, color: "var(--fg1)", marginBottom: 8 }}>{it.title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg2)", margin: 0 }}>{it.desc}</p>
            </div>
          ))}
        </div>
      </Section>
      <ImpactStats />
    </PageFrame>
  );
}

function Hero() {
  return (
    <section style={{ background: "linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
        <div className="eyebrow">Life @ DAUST</div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(32px,4vw,52px)", margin: "14px auto 0", maxWidth: 760 }}>
          Campus life in Somone
        </h1>
        <p className="lead" style={{ color: "var(--on-navy-muted)", margin: "16px auto 0", maxWidth: 620 }}>
          Shaping futures and creating opportunities — on a residential campus in one of Senegal&rsquo;s most beautiful natural settings.
        </p>
      </div>
    </section>
  );
}

function ImpactStats() {
  return (
    <section style={{ background: "var(--navy)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "74px 32px" }}>
        <div className="eyebrow">DAUST Impact · Career Fair 2026</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 28, marginTop: 28 }}>
          {STATS.map(([v, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 42, color: "var(--orange)", lineHeight: 1 }}>{v}</div>
              <div style={{ color: "var(--on-navy-muted)", fontSize: 13.5, marginTop: 8 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
