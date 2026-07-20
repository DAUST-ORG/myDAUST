"use client";

import { useCallback, useEffect, useState } from "react";
import { type FeePlan, getFeePlan, updateFeePlanRow } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";

/** Strips separators so "1 071 250" and "1,071,250" both parse. */
function toInt(v: string): number {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
}

export default function FeeSchedulePage() {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { full: number; tuition: number }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getFeePlan().then(setPlan).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function edit(id: string, field: "full" | "tuition", value: string, current: { full: number; tuition: number }) {
    setEdits((e) => ({
      ...e,
      [id]: { ...current, ...e[id], [field]: toInt(value) },
    }));
  }

  async function save(id: string) {
    const change = edits[id];
    if (!change) return;
    setBusy(true);
    setNote(null);
    try {
      await updateFeePlanRow(id, { amountFullXof: change.full, amountTuitionXof: change.tuition });
      setEdits((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      setNote("Fee schedule updated. Invoices already raised are unchanged.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the fee schedule.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const rows = plan?.rows ?? [];
  // Live totals reflect unsaved edits so staff can see the annual figure before saving.
  const totals = rows.reduce(
    (acc, r) => {
      const e = edits[r.id];
      return {
        full: acc.full + (e?.full ?? r.amountFullXof),
        tuition: acc.tuition + (e?.tuition ?? r.amountTuitionXof),
      };
    },
    { full: 0, tuition: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Fee structure"
        title="Fee schedule"
        subtitle="The institution-wide payment plan. Editing it changes what new invoices are seeded with; invoices already raised keep their own installments."
        actions={plan?.academicYearLabel ? <Badge tone="info">{plan.academicYearLabel}</Badge> : undefined}
      />

      {note && <p className="card" style={{ color: "var(--success-500)" }}>{note}</p>}
      {!plan && <p className="muted">Loading…</p>}

      {plan && rows.length === 0 && (
        <EmptyState
          title="No fee schedule for the active year"
          note="Seed the institution fee plan to populate this screen."
        />
      )}

      {rows.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Installment</th>
                <th>Semester</th>
                <th>Due</th>
                <th style={{ textAlign: "right" }}>Tuition + cafeteria + housing</th>
                <th style={{ textAlign: "right" }}>Tuition only</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = edits[r.id];
                const dirty = !!e && (e.full !== r.amountFullXof || e.tuition !== r.amountTuitionXof);
                const current = { full: r.amountFullXof, tuition: r.amountTuitionXof };
                return (
                  <tr key={r.id}>
                    <td>{r.sequence}</td>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td>{r.semester}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.dueOn ? formatDate(r.dueOn) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <Input
                        value={e?.full ?? r.amountFullXof}
                        onChange={(v) => edit(r.id, "full", v, current)}
                        align="right"
                        width={130}
                        inputMode="numeric"
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Input
                        value={e?.tuition ?? r.amountTuitionXof}
                        onChange={(v) => edit(r.id, "tuition", v, current)}
                        align="right"
                        width={130}
                        inputMode="numeric"
                      />
                    </td>
                    <td>
                      {dirty && (
                        <Button variant="navy" size="sm" disabled={busy} onClick={() => save(r.id)}>
                          Save
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={4} style={{ fontWeight: 700 }}>Annual total</td>
                <td style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {formatXof(totals.full)}
                </td>
                <td style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {formatXof(totals.tuition)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
