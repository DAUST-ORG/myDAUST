"use client";

import { useEffect, useMemo, useState } from "react";
import { type FeePlan, type StudentAccountRow, getCurrentTerm, getFeePlan, listStudentAccounts } from "@/lib/api";
import { formatXof, formatXofAbbrev } from "@/lib/format";
import { Avatar, Badge, Card, PageHeader, Stat } from "@/components/ui";

/** Above this balance an account reads as overdue rather than merely due. */
const OVERDUE_XOF = 400_000;

export default function FinanceDashboard() {
  const [accounts, setAccounts] = useState<StudentAccountRow[] | null>(null);
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStudentAccounts().then(setAccounts).catch((e: Error) => setError(e.message));
    getFeePlan().then(setPlan).catch(() => setPlan(null));
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => setTerm(null));
  }, []);

  const owing = useMemo(
    () => (accounts ?? []).filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance),
    [accounts],
  );

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const outstanding = owing.reduce((sum, r) => sum + r.balance, 0);
  const total = accounts?.length ?? 0;
  const period = term ?? plan?.academicYearLabel;
  const eyebrow = period ? `Finance · ${period}` : "Finance";

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title="Bursar Dashboard"
        subtitle="Billing, collections and student accounts at a glance."
      />

      {!accounts && <p className="muted">Loading…</p>}

      {accounts && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Outstanding"
              value={formatXofAbbrev(outstanding)}
              sub="FCFA due"
              tone="var(--danger)"
            />
            <Stat
              label="Accounts with holds"
              value={owing.length}
              sub="unpaid balance"
              tone="var(--daust-orange)"
            />
            <Stat
              label="Cleared accounts"
              value={total - owing.length}
              sub="zero balance"
              tone="var(--success-500)"
            />
            <Stat label="Total accounts" value={total} />
          </div>

          <Card title="Accounts needing attention" action={<span className="muted" style={{ fontSize: 12.5 }}>Outstanding balances</span>}>
            {owing.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every account is settled.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {owing.map((r) => (
                  <div
                    key={r.id}
                    className="sis-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Avatar name={r.name} size={40} src={r.photoUrl} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                        {[r.program, formatXof(r.balance)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Badge tone={r.balance >= OVERDUE_XOF ? "warning" : "navy"}>
                      {r.balance >= OVERDUE_XOF ? "Overdue" : "Due"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
