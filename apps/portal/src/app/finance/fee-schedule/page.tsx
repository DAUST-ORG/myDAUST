"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { type FeePlan, type FeePlanRow, getFeePlan, updateFeePlanRow } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Button, Card, EmptyState, Eyebrow, Field, Input, Modal, PageHeader, Stat } from "@/components/ui";

interface RowDraft {
  label: string;
  dueOn: string;
  full: number;
  tuition: number;
}

/** Strips separators so "1 071 250" and "1,071,250" both parse. */
function toInt(v: string): number {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function draftOf(r: FeePlanRow): RowDraft {
  return { label: r.label, dueOn: toDateInput(r.dueOn), full: r.amountFullXof, tuition: r.amountTuitionXof };
}

function changed(r: FeePlanRow, d: RowDraft): boolean {
  return (
    d.label !== r.label ||
    d.dueOn !== toDateInput(r.dueOn) ||
    d.full !== r.amountFullXof ||
    d.tuition !== r.amountTuitionXof
  );
}

export default function FeeSchedulePage() {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getFeePlan().then(setPlan).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(
    () => [...(plan?.rows ?? [])].sort((a, b) => a.sequence - b.sequence),
    [plan],
  );

  // Semesters in installment order, so the table reads Fall then Spring without hardcoding either.
  const semesters = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.semester)) seen.push(r.semester);
    return seen;
  }, [rows]);

  function openEditor() {
    setDrafts(Object.fromEntries(rows.map((r) => [r.id, draftOf(r)])));
    setNote(null);
    setOpen(true);
  }

  function edit(id: string, current: RowDraft, patch: Partial<RowDraft>) {
    setDrafts((d) => ({ ...d, [id]: { ...current, ...d[id], ...patch } }));
  }

  async function saveSchedule() {
    const dirty = rows
      .map((r) => ({ row: r, draft: drafts[r.id] }))
      .filter((e): e is { row: FeePlanRow; draft: RowDraft } => !!e.draft && changed(e.row, e.draft));
    if (dirty.length === 0) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      for (const { row, draft: d } of dirty) {
        await updateFeePlanRow(row.id, {
          label: d.label,
          dueOn: d.dueOn || undefined,
          amountFullXof: d.full,
          amountTuitionXof: d.tuition,
        });
      }
      setOpen(false);
      setNote("Fee schedule updated. Invoices already raised are unchanged.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the fee schedule.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const year = plan?.academicYearLabel ?? "";
  const totals = plan?.totals ?? { full: 0, tuition: 0 };
  const housingAndCafeteria = totals.full - totals.tuition;

  return (
    <>
      <PageHeader
        title="Tuition & Fees"
        subtitle={`Manage tuition rates and payment plan${year ? ` · effective ${year}` : ""}`}
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
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat label="Yearly tuition" value={formatXof(totals.tuition)} sub="per year" />
            <Stat label="Yearly housing + cafeteria" value={formatXof(housingAndCafeteria)} sub="per year" />
            <Stat
              label="Full annual package"
              value={formatXof(totals.full)}
              sub="tuition + housing + cafeteria"
            />
          </div>

          <Card
            title="Fee Schedule"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {rows.length} installments across {semesters.join(" and ")}
                  {year ? ` · ${year}` : ""}
                </span>
                <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={openEditor}>
                  Edit plan
                </Button>
              </div>
            }
          >
            <table>
              <thead>
                <tr>
                  <th>Installment</th>
                  <th style={{ textAlign: "right", width: 220 }}>Tuition + cafeteria + housing</th>
                  <th style={{ textAlign: "right", width: 150 }}>Tuition only</th>
                </tr>
              </thead>
              <tbody>
                {semesters.map((sem) => (
                  <Fragment key={sem}>
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          fontSize: 11,
                          letterSpacing: ".1em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: "var(--daust-navy)",
                        }}
                      >
                        {sem}
                      </td>
                    </tr>
                    {rows
                      .filter((r) => r.semester === sem)
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.label}</div>
                            <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                              {r.dueOn ? formatDate(r.dueOn) : "No due date"}
                            </div>
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {formatXof(r.amountFullXof)}
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {formatXof(r.amountTuitionXof)}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
                <tr style={{ background: "var(--surface-2)" }}>
                  <td style={{ fontWeight: 800 }}>Annual total</td>
                  <td style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {formatXof(totals.full)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {formatXof(totals.tuition)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Fee Schedule"
        width={640}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="navy" icon={<Check size={15} />} disabled={busy} onClick={saveSchedule}>
              Save schedule
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
          Adjust installment dates and amounts{year ? ` · ${year}` : ""}
        </p>

        {semesters.map((sem) => (
          <div key={sem} style={{ marginBottom: 18 }}>
            <Eyebrow>{sem}</Eyebrow>
            {rows
              .filter((r) => r.semester === sem)
              .map((r) => {
                const d = drafts[r.id] ?? draftOf(r);
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      padding: 14,
                      marginTop: 10,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <Field label="Installment">
                      <Input value={d.label} onChange={(v) => edit(r.id, d, { label: v })} />
                    </Field>
                    <Field label="Due date">
                      <Input type="date" value={d.dueOn} onChange={(v) => edit(r.id, d, { dueOn: v })} />
                    </Field>
                    <Field label="Tuition + cafeteria + housing" hint="FCFA">
                      <Input
                        value={d.full}
                        onChange={(v) => edit(r.id, d, { full: toInt(v) })}
                        align="right"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Tuition only" hint="FCFA">
                      <Input
                        value={d.tuition}
                        onChange={(v) => edit(r.id, d, { tuition: toInt(v) })}
                        align="right"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                );
              })}
          </div>
        ))}

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Amounts are in FCFA. Annual totals recalculate automatically from the installment amounts.
        </p>
      </Modal>
    </>
  );
}
