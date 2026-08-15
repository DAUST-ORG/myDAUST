"use client";

import { GraduationCap, Layers, UserCheck, Wallet } from "lucide-react";
import {
  accountBalanceLabel,
  accountPresentation,
  resolveAccountSummary,
} from "@/components/AccountBalance";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { ChildSwitcher } from "./ChildSwitcher";
import { useChildren } from "./useChildren";

export default function ParentDashboard() {
  const { children, active, activeId, select, error } = useChildren();

  if (error)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) {
    return (
      <EmptyState
        title="No students linked to your account"
        note="Contact the registrar's office to have your child linked to this account."
      />
    );
  }
  const accountSummary = resolveAccountSummary(active?.summary, {
    balanceXof: active?.balance ?? 0,
  });
  const accountMeta = accountPresentation(accountSummary);

  return (
    <>
      <PageHeader
        eyebrow="Guardian access"
        title="Family overview"
        subtitle="Select a child to view their academics, attendance and billing."
      />

      <ChildSwitcher
        children={children}
        activeId={activeId}
        onSelect={select}
      />

      {active && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Cumulative GPA"
              value={active.gpa === null ? "—" : active.gpa.toFixed(2)}
              sub={active.standing}
              icon={<GraduationCap size={16} />}
            />
            <Stat
              label="Credits"
              value={
                active.requiredCredits
                  ? `${active.completedCredits} / ${active.requiredCredits}`
                  : active.completedCredits
              }
              sub={active.requiredCredits ? "earned / required" : "earned"}
              icon={<Layers size={16} />}
            />
            <Stat
              label="Attendance"
              value={
                active.attendanceRate === null
                  ? "—"
                  : `${active.attendanceRate}%`
              }
              sub="this term"
              tone={
                active.attendanceRate === null ? undefined : "var(--success)"
              }
              icon={<UserCheck size={16} />}
            />
            <Stat
              label="Account balance"
              value={accountBalanceLabel(accountSummary)}
              sub={
                <span
                  style={{
                    color:
                      accountSummary.standing === "on_time" &&
                      accountSummary.dueTodayXof > 0
                        ? "var(--warning)"
                        : undefined,
                  }}
                >
                  {accountMeta.description}
                </span>
              }
              tone={accountMeta.color}
              icon={<Wallet size={16} />}
            />
          </div>

          <div className="card">
            <p className="h1" style={{ fontSize: 16, marginBottom: 6 }}>
              {active.name}
            </p>
            <p
              className="muted"
              style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}
            >
              {active.program}
              {active.academicProgress.level
                ? ` · Level ${active.academicProgress.level.code}`
                : ""}
              {active.academicProgress.inProgressCredits
                ? ` · ${active.academicProgress.inProgressCredits} credits in progress`
                : ""}{" "}
              · use the sidebar to view grades, attendance and billing. Records
              are read-only; contact the registrar for corrections.
            </p>
          </div>
        </>
      )}
    </>
  );
}
