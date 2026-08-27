"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  type DiningSettings,
  getDiningSettings,
  updateDiningSettings,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Toggle,
} from "@/components/ui";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;
const PERIOD_LABELS: Record<(typeof PERIODS)[number], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default function DiningSettingsPage() {
  const [form, setForm] = useState<DiningSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDiningSettings()
      .then(setForm)
      .catch((e: Error) => setError(e.message));
  }, []);

  function patch(next: Partial<DiningSettings>) {
    setForm((f) => (f ? { ...f, ...next } : f));
    setSaved(false);
  }

  function patchWindow(
    period: (typeof PERIODS)[number],
    edge: "start" | "end",
    value: string,
  ) {
    setForm((f) =>
      f
        ? {
            ...f,
            mealWindows: {
              ...f.mealWindows,
              [period]: { ...f.mealWindows[period], [edge]: value },
            },
          }
        : f,
    );
    setSaved(false);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const next = await updateDiningSettings(form);
      setForm(next);
      setSaved(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <>
        <PageHeader title="Settings" subtitle="Service rules" />
        {error ? (
          <EmptyState title="Could not load settings" note={error} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Settings"
        subtitle="Every control here is read by the station or the student's screen"
        actions={
          <>
            {saved && <Badge tone="success">Saved</Badge>}
            <Button variant="primary" disabled={saving} onClick={save}>
              Save settings
            </Button>
          </>
        }
      />

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Service windows">
          <p style={{ color: "var(--fg3)", fontSize: 12, marginBottom: 12 }}>
            Sets the station&rsquo;s default period and the &ldquo;next
            meal&rdquo; card on the student&rsquo;s screen.
          </p>
          {PERIODS.map((p) => (
            <div
              key={p}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                alignItems: "end",
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, paddingBottom: 9 }}>
                {PERIOD_LABELS[p]}
              </div>
              <Field label="Opens">
                <Input
                  type="time"
                  value={form.mealWindows[p].start}
                  onChange={(v) => patchWindow(p, "start", v)}
                />
              </Field>
              <Field label="Closes">
                <Input
                  type="time"
                  value={form.mealWindows[p].end}
                  onChange={(v) => patchWindow(p, "end", v)}
                />
              </Field>
            </div>
          ))}
        </Card>

        <Card title="Entrance rules">
          <div style={{ marginBottom: 16 }}>
            <Toggle
              checked={form.enforcePayment}
              onChange={(v) => patch({ enforcePayment: v })}
              label="Refuse students with overdue charges"
            />
            <p
              style={{
                color: form.enforcePayment ? "var(--warning)" : "var(--fg3)",
                fontSize: 11.5,
                marginTop: 6,
                display: "flex",
                gap: 6,
              }}
            >
              {form.enforcePayment && (
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              )}
              <span>
                While this is on, a student carrying any overdue installment is
                turned away at the door with &ldquo;Payment not confirmed for
                this term&rdquo;. Staff can still wave them through, and every
                override is audited.
              </span>
            </p>
          </div>

          <Toggle
            checked={form.blockSecondScan}
            onChange={(v) => patch({ blockSecondScan: v })}
            label="One meal per service per student"
          />
          <p style={{ color: "var(--fg3)", fontSize: 11.5, marginTop: 6 }}>
            Turn off only for an open service where seconds are allowed.
          </p>
        </Card>

        <Card title="Weekend orders">
          <Toggle
            checked={form.weekendOrdering}
            onChange={(v) => patch({ weekendOrdering: v })}
            label="Accept weekend orders"
          />
          <div style={{ marginTop: 14 }}>
            <Field
              label="Order cutoff"
              hint="Last time an order may be placed for the next service"
            >
              <Input
                type="time"
                value={form.orderCutoff}
                onChange={(v) => patch({ orderCutoff: v })}
              />
            </Field>
          </div>
        </Card>

        <Card title="Costing">
          <Field
            label="Food & operating cost per meal (XOF)"
            hint="Feeds the gross-margin figure on Finances"
          >
            <Input
              value={form.costPerMealXof}
              inputMode="numeric"
              onChange={(v) => patch({ costPerMealXof: Number(v) || 0 })}
            />
          </Field>
          {/* Plan pricing is a fee-schedule concern. Cafeteria is a core fee component
              pinned to cost center 3600; a second price here would be a second source
              of truth for real money. */}
          <p style={{ color: "var(--fg3)", fontSize: 11.5, marginTop: 14 }}>
            Meal-plan pricing is not set here — cafeteria is billed with tuition
            and housing.{" "}
            <Link href="/finance/fee-schedule" style={{ fontWeight: 600 }}>
              Open the fee schedule
            </Link>
          </p>
        </Card>
      </div>
    </>
  );
}
