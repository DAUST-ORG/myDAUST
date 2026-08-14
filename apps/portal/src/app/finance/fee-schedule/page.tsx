"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CircleDollarSign,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type FeePlan,
  type FeePlanComponent,
  getFeePlan,
  replaceFeePlan,
} from "@/lib/api";
import { splitAnnualAmount } from "@/components/InvoiceComponentManager";
import { formatDate, formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
} from "@/components/ui";

interface DateDraft {
  id: string;
  label: string;
  dueOn: string;
}

interface ComponentDraft extends FeePlanComponent {
  description: string;
}

const REQUIRED_COMPONENTS = new Set(["tuition", "housing", "cafeteria"]);

function toInt(value: string): number {
  return Math.max(0, Math.round(Number(value.replace(/[^\d]/g, "")) || 0));
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function legacyComponents(plan: FeePlan): ComponentDraft[] {
  return [
    {
      key: "tuition",
      label: "Tuition",
      description: "Annual academic tuition",
      costCenterCode: "9100",
      annualAmountXof: plan.totals.tuition,
      defaultSelected: true,
      sortOrder: 0,
    },
    {
      key: "housing",
      label: "Housing",
      description: "Annual student housing",
      costCenterCode: "3700",
      annualAmountXof: plan.totals.housing,
      defaultSelected: true,
      sortOrder: 1,
    },
    {
      key: "cafeteria",
      label: "Cafeteria",
      description: "Annual cafeteria plan",
      costCenterCode: "3600",
      annualAmountXof: plan.totals.cafeteria,
      defaultSelected: true,
      sortOrder: 2,
    },
  ].filter((component) => component.annualAmountXof > 0);
}

function componentsOf(plan: FeePlan): ComponentDraft[] {
  const source = plan.components ?? legacyComponents(plan);
  return [...source]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((component, index) => ({
      ...component,
      description: component.description ?? "",
      sortOrder: index,
    }));
}

function createComponentKey(existing: ComponentDraft[]): string {
  const used = new Set(existing.map((component) => component.key));
  let key = `charge_${Date.now().toString(36)}`.slice(0, 40);
  let suffix = 1;
  while (used.has(key)) {
    key = `charge_${Date.now().toString(36)}_${suffix++}`.slice(0, 40);
  }
  return key;
}

export default function FeeSchedulePage() {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<DateDraft[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    getFeePlan()
      .then((next) => {
        setPlan(next);
        setError(null);
      })
      .catch((caught: Error) => setError(caught.message));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(
    () => [...(plan?.rows ?? [])].sort((a, b) => a.sequence - b.sequence),
    [plan],
  );
  const approvedComponents = useMemo(
    () => (plan ? componentsOf(plan) : []),
    [plan],
  );
  const approvedTotal =
    plan?.packageTotalXof ??
    approvedComponents.reduce(
      (sum, component) =>
        sum + (component.defaultSelected ? component.annualAmountXof : 0),
      0,
    );
  const approvedSplit = splitAnnualAmount(approvedTotal, rows.length);
  const draftTotal = components.reduce(
    (sum, component) =>
      sum + (component.defaultSelected ? component.annualAmountXof : 0),
    0,
  );
  const draftSplit = splitAnnualAmount(draftTotal, dates.length);
  const year = plan?.academicYearLabel ?? "";

  function openEditor() {
    if (!plan) return;
    setDates(
      rows.map((row) => ({
        id: row.id,
        label: row.label,
        dueOn: toDateInput(row.dueOn),
      })),
    );
    setComponents(componentsOf(plan));
    setReason("");
    setModalError(null);
    setNote(null);
    setOpen(true);
  }

  function editDate(index: number, patch: Partial<DateDraft>) {
    setDates((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function editComponent(index: number, patch: Partial<ComponentDraft>) {
    setComponents((current) =>
      current.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component,
      ),
    );
  }

  function addComponent() {
    setComponents((current) => [
      ...current,
      {
        key: createComponentKey(current),
        label: "",
        description: "",
        costCenterCode: "9100",
        annualAmountXof: 0,
        defaultSelected: true,
        sortOrder: current.length,
      },
    ]);
  }

  function removeComponent(index: number) {
    setComponents((current) =>
      current
        .filter((_, componentIndex) => componentIndex !== index)
        .map((component, sortOrder) => ({ ...component, sortOrder })),
    );
  }

  async function saveSchedule() {
    if (!reason.trim()) {
      setModalError(
        "Explain why the institution-wide fees or dates are changing.",
      );
      return;
    }
    if (dates.some((row) => !row.label.trim() || !row.dueOn)) {
      setModalError("Every payment needs a label and due date.");
      return;
    }
    const keys = new Set<string>();
    const invalidComponent = components.find((component) => {
      const duplicateKey = keys.has(component.key);
      keys.add(component.key);
      return (
        !/^[a-z][a-z0-9_]{0,39}$/.test(component.key) ||
        duplicateKey ||
        !component.label.trim() ||
        component.label.trim().length > 80 ||
        component.description.trim().length > 240 ||
        !component.costCenterCode.trim() ||
        component.costCenterCode.trim().length > 8 ||
        component.annualAmountXof <= 0
      );
    });
    if (invalidComponent || draftTotal <= 0) {
      setModalError(
        "Every charge needs a unique name, cost center, and positive annual amount; at least one charge must be included.",
      );
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      const result = await replaceFeePlan({
        academicYearLabel: plan?.academicYearLabel ?? undefined,
        reason: reason.trim(),
        rows: dates.map((row) => ({
          id: row.id,
          label: row.label.trim(),
          dueOn: row.dueOn,
        })),
        components: components.map((component, sortOrder) => ({
          id: component.id,
          key: component.key,
          label: component.label.trim(),
          description: component.description.trim() || undefined,
          costCenterCode: component.costCenterCode.trim(),
          annualAmountXof: component.annualAmountXof,
          defaultSelected: component.defaultSelected,
          sortOrder,
        })),
      });
      setOpen(false);
      setNote(
        result.applied
          ? "Fee revision approved and applied. Standard student totals and payment dates now use this package."
          : "Fee and payment-schedule revision submitted for administrator approval. Student accounts remain unchanged until approval.",
      );
      if (result.applied) load();
    } catch (caught) {
      setModalError(
        caught instanceof Error
          ? caught.message
          : "Could not update the fees and payment schedule.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !plan) {
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title="Fees & Payment Schedule"
        subtitle={`Set annual charges first, then choose when the resulting total is due${year ? ` · ${year}` : ""}`}
        actions={
          plan && rows.length > 0 ? (
            <Button
              variant="navy"
              icon={<Pencil size={15} />}
              onClick={openEditor}
            >
              Edit fees & dates
            </Button>
          ) : undefined
        }
      />

      {note && (
        <p className="card" role="status" style={{ color: "var(--success)" }}>
          {note}
        </p>
      )}
      {error && plan && (
        <p className="card" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {!plan && <p className="muted">Loading…</p>}

      {plan && rows.length === 0 && (
        <EmptyState
          title="No fee schedule for the active year"
          note="Seed the institution fee plan to populate this screen."
        />
      )}

      {plan && rows.length > 0 && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Standard package"
              value={formatXof(approvedTotal)}
              sub={`${approvedComponents.filter((component) => component.defaultSelected).length} annual charges included`}
              icon={<CircleDollarSign size={16} />}
            />
            <Stat
              label="Payment dates"
              value={rows.length}
              sub="the package total is divided across these dates"
              icon={<CalendarClock size={16} />}
            />
            <Stat
              label="Approved revision"
              value={plan.revision ?? "—"}
              sub={year || "Active academic year"}
              icon={<Check size={16} />}
            />
          </div>

          <div className="fee-page-grid">
            <Card
              title="Annual charge catalog"
              action={<Badge tone="success">Source of total</Badge>}
            >
              <p
                className="muted"
                style={{ margin: "-4px 0 10px", fontSize: 12 }}
              >
                Included charges make up the standard package. Catalog-only
                charges can be added to an individual student later.
              </p>
              <div className="fee-component-list">
                {approvedComponents.map((component) => (
                  <div className="fee-component-row" key={component.key}>
                    <span
                      className={`fee-component-marker${component.defaultSelected ? " selected" : ""}`}
                      aria-hidden
                    >
                      {component.defaultSelected ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </span>
                    <span className="fee-component-copy">
                      <strong>{component.label}</strong>
                      <small>
                        {component.description ||
                          `Cost center ${component.costCenterCode}`}
                      </small>
                    </span>
                    <span className="fee-component-money">
                      <strong>{formatXof(component.annualAmountXof)}</strong>
                      <small>annual</small>
                    </span>
                    <Badge
                      tone={component.defaultSelected ? "success" : "neutral"}
                    >
                      {component.defaultSelected ? "Included" : "Optional"}
                    </Badge>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  borderTop: "1px solid var(--border)",
                  marginTop: 10,
                  paddingTop: 13,
                }}
              >
                <strong>Standard annual total</strong>
                <strong
                  style={{
                    color: "var(--daust-navy)",
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatXof(approvedTotal)}
                </strong>
              </div>
            </Card>

            <Card
              title="Resulting payment schedule"
              action={<Badge tone="navy">Calculated</Badge>}
            >
              <p
                className="muted"
                style={{ margin: "-4px 0 12px", fontSize: 12 }}
              >
                Dates control when money is due. They do not define separate
                tuition or service fees.
              </p>
              <div className="fee-installment-flow">
                {rows.map((row, index) => (
                  <div key={row.id}>
                    <span>{row.label}</span>
                    <strong>{formatXof(approvedSplit[index] ?? 0)}</strong>
                    <small>
                      {row.dueOn ? formatDate(row.dueOn) : "No due date"}
                    </small>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 11 }}>
                Whole-FCFA remainders are assigned deterministically from the
                first payment onward so the split always reconciles exactly.
              </p>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit fees & payment dates"
        width={820}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={busy}
              onClick={saveSchedule}
            >
              {busy ? "Submitting…" : "Submit revision"}
            </Button>
          </>
        }
      >
        <div className="fee-component-pending" style={{ marginBottom: 18 }}>
          <CalendarClock size={16} aria-hidden />
          <span>
            This is an institution-wide change for{" "}
            <strong>{year || "the active year"}</strong>. A bursar submission
            requires administrator approval.
          </span>
        </div>
        {modalError && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {modalError}
          </p>
        )}

        <section aria-labelledby="annual-fees-heading">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 6,
            }}
          >
            <div>
              <h4 id="annual-fees-heading" style={{ margin: 0 }}>
                1. Set annual charges
              </h4>
              <p
                className="muted"
                style={{ margin: "3px 0 0", fontSize: 11.5 }}
              >
                Included charges form the package total. Optional charges remain
                available for individual accounts.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={addComponent}
            >
              Add global charge
            </Button>
          </div>

          {components.map((component, index) => (
            <div className="fee-editor-component-grid" key={component.key}>
              <Field label="Charge name">
                <Input
                  value={component.label}
                  onChange={(value) => editComponent(index, { label: value })}
                  placeholder="e.g. Insurance"
                />
              </Field>
              <Field label="Annual amount" hint="FCFA">
                <Input
                  value={component.annualAmountXof || ""}
                  onChange={(value) =>
                    editComponent(index, { annualAmountXof: toInt(value) })
                  }
                  inputMode="numeric"
                  align="right"
                />
              </Field>
              <Field label="Cost center">
                <Input
                  value={component.costCenterCode}
                  onChange={(value) =>
                    editComponent(index, { costCenterCode: value.slice(0, 8) })
                  }
                  placeholder="9100"
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 38,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--fg2)",
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={component.defaultSelected}
                    onChange={(event) =>
                      editComponent(index, {
                        defaultSelected: event.target.checked,
                      })
                    }
                  />
                  Include
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  title={
                    REQUIRED_COMPONENTS.has(component.key)
                      ? "Core catalog charges can be excluded but not deleted."
                      : "Delete global charge"
                  }
                  disabled={REQUIRED_COMPONENTS.has(component.key)}
                  onClick={() => removeComponent(index)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
              <label style={{ gridColumn: "1 / -1", display: "grid", gap: 5 }}>
                <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>
                  Description (optional)
                </span>
                <input
                  value={component.description}
                  onChange={(event) =>
                    editComponent(index, {
                      description: event.target.value.slice(0, 240),
                    })
                  }
                  maxLength={240}
                  placeholder="Describe what this annual charge covers"
                />
              </label>
            </div>
          ))}

          <div className="fee-component-total-change" style={{ marginTop: 12 }}>
            <span>
              Included package total <strong>{formatXof(draftTotal)}</strong>
            </span>
            <span className="muted">
              {
                components.filter((component) => component.defaultSelected)
                  .length
              }{" "}
              of {components.length} charges included
            </span>
          </div>
        </section>

        <section
          aria-labelledby="payment-dates-heading"
          style={{ marginTop: 24 }}
        >
          <h4 id="payment-dates-heading" style={{ margin: 0 }}>
            2. Set payment dates
          </h4>
          <p className="muted" style={{ margin: "3px 0 10px", fontSize: 11.5 }}>
            The package total is split automatically; only the labels and dates
            are edited here.
          </p>
          <div style={{ display: "grid", gap: 9 }}>
            {dates.map((row, index) => (
              <div className="fee-editor-schedule-grid" key={row.id}>
                <Field label={`Payment ${index + 1}`}>
                  <Input
                    value={row.label}
                    onChange={(value) => editDate(index, { label: value })}
                  />
                </Field>
                <Field label="Due date">
                  <Input
                    type="date"
                    value={row.dueOn}
                    onChange={(value) => editDate(index, { dueOn: value })}
                  />
                </Field>
                <Field label="Calculated amount" hint="Read-only">
                  <Input
                    value={formatXof(draftSplit[index] ?? 0)}
                    onChange={() => {}}
                    disabled
                    align="right"
                  />
                </Field>
              </div>
            ))}
          </div>
        </section>

        <Field
          label="Reason for revision"
          hint="Included in the administrator approval record with the before-and-after fees and dates."
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Explain why the institution-wide package is changing"
          />
        </Field>
      </Modal>
    </>
  );
}
