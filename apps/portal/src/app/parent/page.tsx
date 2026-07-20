"use client";

import { GraduationCap, Layers, UserCheck, Wallet } from "lucide-react";
import { formatXof } from "@/lib/format";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { ChildSwitcher } from "./ChildSwitcher";
import { useChildren } from "./useChildren";

export default function ParentDashboard() {
  const { children, active, activeId, select, error } = useChildren();

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) {
    return (
      <EmptyState
        title="No students linked to your account"
        note="Contact the registrar's office to have your child linked to this account."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Guardian access"
        title="Family overview"
        subtitle={
          children.length > 1
            ? `You are following ${children.length} students.`
            : `Following ${children[0]?.name}.`
        }
      />

      <ChildSwitcher children={children} activeId={activeId} onSelect={select} />

      {active && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Cumulative GPA"
              value={active.gpa.toFixed(2)}
              sub={active.standing}
              icon={<GraduationCap size={16} />}
            />
            <Stat
              label="Credits earned"
              value={active.completedCredits}
              sub="toward the degree"
              icon={<Layers size={16} />}
            />
            <Stat
              label="Balance due"
              value={active.balance <= 0 ? "0 FCFA" : formatXof(active.balance)}
              sub={active.balance <= 0 ? "Settled — thank you" : "See Billing to pay"}
              tone={active.balance > 0 ? "var(--danger)" : "var(--success)"}
              icon={<Wallet size={16} />}
            />
            <Stat
              label="Programme"
              value={<span style={{ fontSize: 16 }}>{active.program}</span>}
              sub={active.yearLevel ? `Year ${active.yearLevel}` : undefined}
              icon={<UserCheck size={16} />}
            />
          </div>

          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              You are viewing <strong>{active.name}</strong> ({active.studentNo})
              {active.relation ? ` — ${active.relation.toLowerCase()}` : ""}. Use the sidebar to
              review grades and attendance, or to settle outstanding fees. Records are read-only;
              contact the registrar for corrections.
            </p>
          </div>
        </>
      )}
    </>
  );
}
