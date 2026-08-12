"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Pencil } from "lucide-react";
import {
  type FeePlan,
  type FeePlanRow,
  getFeePlan,
  replaceFeePlan,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
} from "@/components/ui";

interface RowDraft {
  label: string;
  dueOn: string;
  tuition: number;
  housing: number;
  cafeteria: number;
}

/** Strips separators so "1 071 250" and "1,071,250" both parse. */
function toInt(v: string): number {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function draftOf(r: FeePlanRow): RowDraft {
  return {
    label: r.label,
    dueOn: toDateInput(r.dueOn),
    tuition: r.amountTuitionXof,
    housing: r.amountHousingXof,
    cafeteria: r.amountCafeteriaXof,
  };
}

export default function FeeSchedulePage() {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    getFeePlan()
      .then(setPlan)
      .catch((e: Error) => setError(e.message));
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
    setReason("");
    setModalError(null);
    setNote(null);
    setOpen(true);
  }

  function edit(id: string, current: RowDraft, patch: Partial<RowDraft>) {
    setDrafts((d) => ({ ...d, [id]: { ...current, ...d[id], ...patch } }));
  }

  async function saveSchedule() {
    if (!reason.trim()) {
      setModalError("Explain why this institution-wide schedule is changing.");
      return;
    }
    if (
      rows.some((row) => {
        const draft = drafts[row.id] ?? draftOf(row);
        return !draft.label.trim() || !draft.dueOn;
      })
    ) {
      setModalError("Every installment needs a label and due date.");
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      const result = await replaceFeePlan({
        academicYearLabel: plan?.academicYearLabel ?? undefined,
        reason: reason.trim(),
        rows: rows.map((row) => {
          const draft = drafts[row.id] ?? draftOf(row);
          const full = draft.tuition + draft.housing + draft.cafeteria;
          return {
            id: row.id,
            label: draft.label.trim(),
            dueOn: draft.dueOn,
            amountFullXof: full,
            amountTuitionXof: draft.tuition,
            amountHousingXof: draft.housing,
            amountCafeteriaXof: draft.cafeteria,
          };
        }),
      });
      setOpen(false);
      setNote(
        result.applied
          ? "Schedule revision approved and applied. Every linked current-year standard plan now uses these dates and amounts."
          : "Schedule change submitted for administrator approval. Student accounts remain unchanged until it is approved.",
      );
      if (result.applied) load();
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "Could not update the fee schedule.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );

  const year = plan?.academicYearLabel ?? "";
  const totals = plan?.totals ?? {
    full: 0,
    tuition: 0,
    housing: 0,
    cafeteria: 0,
  };

  return (
    <>
      <PageHeader
        title="Tuition & Fees"
        subtitle={`Manage tuition rates and payment plan${year ? ` · effective ${year}` : ""}`}
      />

      {note && (
        <p className="card" style={{ color: "var(--success-500)" }}>
          {note}
        </p>
      )}
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
            <Stat
              label="Yearly tuition"
              value={formatXof(totals.tuition)}
              sub="per year"
            />
            <Stat
              label="Yearly housing"
              value={formatXof(totals.housing)}
              sub="per year"
            />
            <Stat
              label="Yearly cafeteria"
              value={formatXof(totals.cafeteria)}
              sub="per year"
            />
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
                  Approved revision {plan?.revision ?? "—"} · {rows.length}{" "}
                  installments across {semesters.join(" and ")} semesters
                  {year ? ` · ${year}` : ""}
                </span>
                <Button
                  variant="navy"
                  size="sm"
                  icon={<Pencil size={14} />}
                  onClick={openEditor}
                >
                  Edit plan
                </Button>
              </div>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Installment</th>
                    <th style={{ textAlign: "right" }}>Tuition</th>
                    <th style={{ textAlign: "right" }}>Housing</th>
                    <th style={{ textAlign: "right" }}>Cafeteria</th>
                    <th style={{ textAlign: "right" }}>Full package</th>
                  </tr>
                </thead>
                <tbody>
                  {semesters.map((sem) => (
                    <Fragment key={sem}>
                      <tr>
                        <td
                          colSpan={5}
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
                              <div
                                style={{ fontSize: 12, color: "var(--fg3)" }}
                              >
                                {r.dueOn ? formatDate(r.dueOn) : "No due date"}
                              </div>
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatXof(r.amountTuitionXof)}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatXof(r.amountHousingXof)}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatXof(r.amountCafeteriaXof)}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                                fontWeight: 700,
                              }}
                            >
                              {formatXof(r.amountFullXof)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                  <tr style={{ background: "var(--surface-2)" }}>
                    <td style={{ fontWeight: 800 }}>Annual total</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatXof(totals.tuition)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatXof(totals.housing)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatXof(totals.cafeteria)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatXof(totals.full)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={busy}
              onClick={saveSchedule}
            >
              Submit schedule revision
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          Approved changes update every linked current-year standard plan
          immediately{year ? ` · ${year}` : ""}. An unchanged submission records
          the administrator&apos;s explicit review before conversion.
        </p>
        {modalError && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {modalError}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            marginBottom: 16,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-bg)",
          }}
        >
          <CalendarClock
            size={16}
            style={{ color: "var(--daust-navy)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: "var(--fg3)",
            }}
          >
            Academic year
          </span>
          <strong style={{ fontSize: 13.5 }}>{year || "—"}</strong>
          <span style={{ flex: 1 }} />
          <Badge tone="neutral">Auto-filled · active</Badge>
        </div>

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
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                      padding: 14,
                      marginTop: 10,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <Field label="Installment">
                      <Input
                        value={d.label}
                        onChange={(v) => edit(r.id, d, { label: v })}
                      />
                    </Field>
                    <Field label="Due date">
                      <Input
                        type="date"
                        value={d.dueOn}
                        onChange={(v) => edit(r.id, d, { dueOn: v })}
                      />
                    </Field>
                    <Field label="Tuition" hint="FCFA">
                      <Input
                        value={d.tuition}
                        onChange={(v) => {
                          const tuition = toInt(v);
                          edit(r.id, d, { tuition });
                        }}
                        align="right"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Housing" hint="FCFA">
                      <Input
                        value={d.housing}
                        onChange={(v) => {
                          const housing = toInt(v);
                          edit(r.id, d, { housing });
                        }}
                        align="right"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Cafeteria" hint="FCFA">
                      <Input
                        value={d.cafeteria}
                        onChange={(v) => {
                          const cafeteria = toInt(v);
                          edit(r.id, d, { cafeteria });
                        }}
                        align="right"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field
                      label="Full package"
                      hint="Tuition + housing + cafeteria"
                    >
                      <Input
                        value={formatXof(d.tuition + d.housing + d.cafeteria)}
                        onChange={() => {}}
                        disabled
                        align="right"
                      />
                    </Field>
                  </div>
                );
              })}
          </div>
        ))}

        <Field
          label="Reason for change"
          hint="Included in the administrator approval record."
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Amounts are in FCFA. Approved dates and component amounts propagate
          without replacing installment IDs or payment history.
        </p>
      </Modal>
    </>
  );
}
