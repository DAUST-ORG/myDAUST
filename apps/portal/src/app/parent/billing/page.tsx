"use client";

import { useEffect, useState } from "react";
import { type StudentAccount, getChildAccount } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ChildSwitcher } from "../ChildSwitcher";
import { useChildren } from "../useChildren";

export default function ParentBilling() {
  const { children, active, activeId, select, error } = useChildren();
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    setAccount(null);
    setLoadError(null);
    getChildAccount(activeId).then(setAccount).catch((e: Error) => setLoadError(e.message));
  }, [activeId]);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) return <EmptyState title="No students linked to your account" />;

  const balance = account?.totals.balance ?? 0;
  const settled = balance <= 0;

  return (
    <>
      <PageHeader
        eyebrow="Fees & payment"
        title="Billing"
        subtitle={active ? `${active.name} · ${active.studentNo}` : undefined}
      />

      <ChildSwitcher children={children} activeId={activeId} onSelect={select} />

      {loadError && <p className="card" style={{ color: "var(--danger)" }}>{loadError}</p>}
      {!account && !loadError && <p className="muted">Loading account…</p>}

      {account && (
        <>
          <div
            style={{
              background: "var(--grad-brand)",
              color: "#fff",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              marginBottom: 18,
              boxShadow: "var(--shadow-navy)",
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>
              {settled ? "Account settled" : "Balance due"}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 800, margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>
              {settled ? formatXof(0) : formatXof(balance)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {settled
                ? "Thank you — there is nothing outstanding."
                : `Billed ${formatXof(account.totals.billed)} · paid ${formatXof(account.totals.paid)}`}
            </div>
            {!settled && (
              <p style={{ fontSize: 12.5, opacity: 0.85, margin: "14px 0 0", lineHeight: 1.6 }}>
                To pay, use the DAUST payment portal at <strong>payment.daust.net</strong> with the
                student ID <strong>{account.student.studentNo}</strong> and your child&apos;s date of
                birth. Payments post to this account immediately.
              </p>
            )}
          </div>

          <Card title="Charges on account">
            {account.invoices.length === 0 ? (
              <EmptyState title="No charges yet" />
            ) : (
              account.invoices.map((inv) => {
                const isCredit = inv.total < 0;
                return (
                  <div key={inv.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--divider)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: isCredit ? "var(--success-500)" : "var(--fg1)" }}>
                        {inv.description ?? (isCredit ? "Account credit" : `Tuition — ${inv.term}`)}
                      </span>
                      {!isCredit && <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>}
                      <span style={{ flex: 1 }} />
                      {isCredit ? (
                        <span style={{ fontWeight: 700, color: "var(--success-500)", fontVariantNumeric: "tabular-nums" }}>
                          −{formatXof(-inv.total)}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatXof(inv.paid)} / {formatXof(inv.total)}
                        </span>
                      )}
                    </div>
                    {!isCredit && inv.installments.length > 0 && (
                      <table style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>#</th><th>Due</th>
                            <th style={{ textAlign: "right" }}>Amount</th>
                            <th style={{ textAlign: "right" }}>Paid</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.installments.map((i) => (
                            <tr key={i.id}>
                              <td>{i.sequence}</td>
                              <td style={{ whiteSpace: "nowrap" }}>{formatDate(i.dueDate)}</td>
                              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatXof(i.amountDue)}</td>
                              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatXof(i.amountPaid)}</td>
                              <td><span className={`badge ${i.status}`}>{i.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
            )}
          </Card>
        </>
      )}
    </>
  );
}
