"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarRange, Plane, Wallet } from "lucide-react";
import { Panel } from "@/components/Panel";
import { type FacultyOverview, type Me, getFacultyOverview, getMe } from "@/lib/api";

export default function FacultyProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<FacultyOverview | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    getFacultyOverview().then(setOverview).catch(() => {});
  }, []);

  if (!me) return <p className="muted">Loading…</p>;

  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const links: { label: string; sub: string; href: string; icon: typeof Wallet; color: string }[] = [
    { label: "Pay & Payslips", sub: "Monthly payslips and estimates", href: "/faculty/pay", icon: Wallet, color: "var(--daust-navy)" },
    { label: "Leave & Absence", sub: "Request and track leave", href: "/faculty/leave", icon: Plane, color: "var(--daust-orange)" },
    { label: "Room Booking", sub: "Reserve classrooms and labs", href: "/faculty/booking", icon: CalendarRange, color: "#2e7d52" },
  ];

  return (
    <>
      <p className="eyebrow">Campus</p>
      <h1 className="page-title">My Profile</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20, alignItems: "start", marginTop: 16 }}>
        <Panel title="Identity">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%", background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)" }}>{me.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{me.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {me.roles.map((r) => (
              <span key={r} className="badge" style={{ textTransform: "capitalize" }}>{r.replace(/_/g, " ")}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="kpi">
              <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em" }}>Active courses</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>
                {overview ? overview.kpis.activeCourses : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em" }}>Students taught</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>
                {overview ? overview.kpis.studentsTaught : "—"}
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Profile details are managed by HR — contact the registrar for corrections.
          </p>
        </Panel>

        <Panel title="Quick links" pad="4px 20px 14px">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderBottom: i < links.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${l.color} 14%, white)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <l.icon size={17} color={l.color} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--fg1)" }}>{l.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{l.sub}</div>
                </div>
              </div>
            </Link>
          ))}
        </Panel>
      </div>
    </>
  );
}
