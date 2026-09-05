"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDiningBudgets,
  getDiningSchedule,
  setDiningSchedule,
  upsertDiningBudget,
  type DiningBudgetRow,
  type DiningScheduleDay,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type DraftRow = { menuItemId: string; plannedQty: number };

export default function DiningPlanningPage() {
  const [week, setWeek] = useState(todayKey);
  const [days, setDays] = useState<DiningScheduleDay[]>([]);
  const [orderable, setOrderable] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [draft, setDraft] = useState<Record<string, DraftRow[]>>({});
  const [addItem, setAddItem] = useState<Record<string, string>>({});
  const [addQty, setAddQty] = useState<Record<string, string>>({});
  const [budgets, setBudgets] = useState<DiningBudgetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bDate, setBDate] = useState(todayKey);
  const [bPeriod, setBPeriod] = useState<string>("lunch");
  const [bServings, setBServings] = useState("");
  const [bCost, setBCost] = useState("720");
  const [bNotes, setBNotes] = useState("");

  const load = useCallback(() => {
    const end = addDays(week, 6);
    getDiningSchedule(week)
      .then((res) => {
        setDays(res.days);
        setOrderable(res.orderableItems);
        const next: Record<string, DraftRow[]> = {};
        for (const day of res.days) {
          for (const p of day.periods) {
            next[`${day.date}|${p.period}`] = p.items.map((i) => ({
              menuItemId: i.menuItemId,
              plannedQty: i.plannedQty,
            }));
          }
        }
        setDraft(next);
      })
      .catch((e: Error) => setError(e.message));
    getDiningBudgets(week, end)
      .then(setBudgets)
      .catch((e: Error) => setError(e.message));
  }, [week]);
  useEffect(load, [load]);

  const nameById = useMemo(
    () => new Map(orderable.map((i) => [i.id, i.name] as const)),
    [orderable],
  );

  async function saveService(date: string, period: string) {
    const key = `${date}|${period}`;
    setBusy(key);
    setError(null);
    try {
      await setDiningSchedule({
        date,
        period,
        items: (draft[key] ?? []).filter((r) => r.menuItemId),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveBudget() {
    if (!bDate || !bServings) return;
    setBusy("budget");
    setError(null);
    try {
      await upsertDiningBudget({
        date: bDate,
        period: bPeriod,
        plannedServings: Math.max(1, Math.round(Number(bServings) || 0)),
        costPerServingXof: Math.max(0, Math.round(Number(bCost) || 0)),
        notes: bNotes.trim() || undefined,
      });
      setBServings("");
      setBNotes("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Meal Planning"
        subtitle="Weekly kitchen plan and per-service budgets"
      />
      {error && (
        <Card>
          <EmptyState title="Something went wrong" note={error} />
        </Card>
      )}
      <Card>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Week starting
            </p>
            <Input type="date" value={week} onChange={setWeek} width={180} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Saving a service replaces its whole plan — the kitchen always sees
            the last save.
          </p>
        </div>
      </Card>
      <div style={{ height: 16 }} />
      {days.map((day) => (
        <div key={day.date} style={{ marginBottom: 16 }}>
          <Card>
            <p className="h1" style={{ fontSize: 15, marginBottom: 10 }}>
              {day.date}
            </p>
            {PERIODS.map((period) => {
              const key = `${day.date}|${period}`;
              const served =
                day.periods.find((p) => p.period === period)?.served ?? 0;
              const rows = draft[key] ?? [];
              return (
                <div
                  key={period}
                  style={{
                    borderTop: "1px solid var(--divider)",
                    padding: "10px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <strong style={{ textTransform: "capitalize" }}>
                      {period}
                    </strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Served: {served}
                    </span>
                  </div>
                  {rows.map((row, i) => (
                    <div
                      key={`${row.menuItemId}-${i}`}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Select
                          value={row.menuItemId}
                          ariaLabel="Menu item"
                          onChange={(v) =>
                            setDraft((d) => ({
                              ...d,
                              [key]: rows.map((r, j) =>
                                j === i ? { ...r, menuItemId: v } : r,
                              ),
                            }))
                          }
                          options={orderable.map((o) => ({
                            value: o.id,
                            label: o.name,
                          }))}
                        />
                      </div>
                      <Input
                        value={String(row.plannedQty)}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            [key]: rows.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    plannedQty: Math.max(
                                      0,
                                      Math.round(Number(v) || 0),
                                    ),
                                  }
                                : r,
                            ),
                          }))
                        }
                        width={90}
                        inputMode="numeric"
                        placeholder="Covers"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            [key]: rows.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 6,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <Select
                        value={addItem[key] ?? ""}
                        ariaLabel="Add menu item"
                        onChange={(v) =>
                          setAddItem((d) => ({ ...d, [key]: v }))
                        }
                        options={[
                          { value: "", label: "Add an item…" },
                          ...orderable.map((o) => ({
                            value: o.id,
                            label: o.name,
                          })),
                        ]}
                      />
                    </div>
                    <Input
                      value={addQty[key] ?? ""}
                      onChange={(v) => setAddQty((d) => ({ ...d, [key]: v }))}
                      placeholder="Covers"
                      width={90}
                      inputMode="numeric"
                    />
                    <Button
                      size="sm"
                      disabled={!addItem[key]}
                      onClick={() => {
                        if (!addItem[key]) return;
                        setDraft((d) => ({
                          ...d,
                          [key]: [
                            ...rows,
                            {
                              menuItemId: addItem[key]!,
                              plannedQty: Math.max(
                                0,
                                Math.round(Number(addQty[key]) || 0),
                              ),
                            },
                          ],
                        }));
                        setAddItem((d) => ({ ...d, [key]: "" }));
                        setAddQty((d) => ({ ...d, [key]: "" }));
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy === key}
                      onClick={() => void saveService(day.date, period)}
                    >
                      Save {period}
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
      <Card>
        <p className="h1" style={{ fontSize: 15, marginBottom: 4 }}>
          Service budgets
        </p>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Planned cost is servings × unit cost; actual cost reprices what was
          served at the same unit cost.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 2fr auto",
            gap: 10,
            alignItems: "end",
            marginBottom: 14,
          }}
        >
          <Input type="date" value={bDate} onChange={setBDate} />
          <Select
            value={bPeriod}
            ariaLabel="Budget period"
            onChange={setBPeriod}
            options={PERIODS.map((p) => ({ value: p, label: p }))}
          />
          <Input
            value={bServings}
            onChange={setBServings}
            placeholder="Servings"
            inputMode="numeric"
          />
          <Input
            value={bCost}
            onChange={setBCost}
            placeholder="Cost/serving XOF"
            inputMode="numeric"
          />
          <Input
            value={bNotes}
            onChange={setBNotes}
            placeholder="Notes (optional)"
          />
          <Button
            variant="primary"
            disabled={busy === "budget" || !bServings}
            onClick={() => void saveBudget()}
          >
            Save budget
          </Button>
        </div>
        {budgets.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No budgets this week yet.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th style={{ textAlign: "right" }}>Planned</th>
                <th style={{ textAlign: "right" }}>Served</th>
                <th style={{ textAlign: "right" }}>Planned cost</th>
                <th style={{ textAlign: "right" }}>Actual cost</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td>{b.date}</td>
                  <td style={{ textTransform: "capitalize" }}>{b.period}</td>
                  <td style={{ textAlign: "right" }}>{b.plannedServings}</td>
                  <td style={{ textAlign: "right" }}>{b.served}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatXof(b.plannedCostXof)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatXof(b.actualCostXof)}{" "}
                    {b.served > b.plannedServings && (
                      <Badge tone="warning">over plan</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
