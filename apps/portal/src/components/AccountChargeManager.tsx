"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, WalletCards } from "lucide-react";
import {
  type AccountInvoice,
  type CostCenter,
  type FeePlan,
  type StudentAccount,
  addCharge,
  applyDiscount,
  getCostCenters,
  getStudentAccount,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { InvoiceComponentManager } from "@/components/InvoiceComponentManager";
import {
  Button,
  Field,
  IconButton,
  Input,
  Select,
  Tabs,
} from "@/components/ui";

const TABS = [
  { value: "package", label: "Package charges" },
  { value: "custom", label: "One-off charge" },
  { value: "credit", label: "Discount / credit" },
];

const MAX_INSTALLMENTS = 24;
const DEFAULT_COST_CENTER = "9100";

type ChargePreset = {
  id: string;
  label: string;
  amountXof: number;
  costCenterCode: string;
  source: "account" | "catalog";
};

interface CustomRow {
  dueDate: string;
  amount: string;
  label: string;
}

function digits(value: string): number {
  const only = value.replace(/[^0-9]/g, "");
  return only ? Number(only) : 0;
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keep the current code selectable while the chart is still loading. */
function costCenterOptions(centers: CostCenter[], current: string) {
  const options = centers.map((center) => ({
    value: center.code,
    label: `${center.code} — ${center.name}`,
  }));
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

/**
 * Every charge a bursar can put on one student, in one panel: the approved
 * catalog components of the standard package, a free-form one-off charge, and a
 * free-form discount. All three submit to the approval rail — nothing here
 * writes to the student's account directly.
 *
 * Catalog awards are deliberately NOT duplicated here. A BillingAdjustmentDefinition
 * carries basis, calculation, stacking and effect, and is applied through the
 * annual billing profile; the credit tab links there rather than growing a second,
 * weaker award path.
 */
export function AccountChargeManager({
  studentId,
  invoice,
  feePlan,
  onSubmitted,
  onOpenAnnualProfile,
}: {
  studentId: string;
  invoice?: AccountInvoice;
  feePlan?: FeePlan | null;
  onSubmitted: (message: string) => void;
  /** Hands off to BillingProfileEditor, the canonical home of catalog awards. */
  onOpenAnnualProfile?: () => void;
}) {
  const [tab, setTab] = useState<string>(
    invoice?.packageType === "standard_full" ? "package" : "custom",
  );
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStudentAccount(studentId)
      .then((next) => active && setAccount(next))
      .catch(() => active && setAccount(null));
    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    let active = true;
    getCostCenters()
      .then((next) => active && setCostCenters(next))
      .catch(() => active && setCostCenters([]));
    return () => {
      active = false;
    };
  }, []);

  const submit = useCallback(
    async (work: () => Promise<{ applied: boolean }>, noun: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await work();
        onSubmitted(
          result.applied
            ? `${noun} approved and applied`
            : `${noun} submitted for administrator approval`,
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : `Could not submit the ${noun.toLowerCase()}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [onSubmitted],
  );

  const packageAvailable = invoice?.packageType === "standard_full";

  return (
    <section className="account-charge-manager">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {error && (
        <p className="fee-component-error" role="alert">
          {error}
        </p>
      )}

      {tab === "package" &&
        (packageAvailable && invoice ? (
          <InvoiceComponentManager
            invoice={invoice}
            onSubmitted={onSubmitted}
          />
        ) : (
          <div className="fee-component-legacy-note">
            <span>
              Catalog charges are included or excluded on the approved standard
              package. This student has none for the active year — assign the
              package first, or bill the charge as a one-off.
            </span>
          </div>
        ))}

      {tab === "custom" && (
        <CustomChargeForm
          studentId={studentId}
          account={account}
          feePlan={feePlan}
          costCenters={costCenters}
          busy={busy}
          onSubmit={(input) => submit(() => addCharge(input), "Charge")}
        />
      )}

      {tab === "credit" && (
        <>
          {onOpenAnnualProfile && (
            <div className="charge-award-handoff">
              <span>
                <strong>Awarding from the catalog?</strong> A scholarship or
                discount defined in the Billing Catalog carries its own basis,
                rate and stacking rules, so it is granted on the student&apos;s
                annual profile rather than as a loose credit.
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={<WalletCards size={14} />}
                onClick={onOpenAnnualProfile}
              >
                Annual profile
              </Button>
            </div>
          )}
          <CreditForm
            studentId={studentId}
            costCenters={costCenters}
            busy={busy}
            onSubmit={(input) => submit(() => applyDiscount(input), "Credit")}
          />
        </>
      )}
    </section>
  );
}

/**
 * Presets are the charges this student already carries plus the approved catalog,
 * so a bursar repeats a real charge instead of retyping one. They only prefill —
 * every field stays editable and the amount is whatever is submitted.
 */
function chargePresets(
  account: StudentAccount | null,
  feePlan?: FeePlan | null,
): ChargePreset[] {
  const seen = new Set<string>();
  const presets: ChargePreset[] = [];
  const push = (preset: ChargePreset) => {
    const key = `${preset.label}|${preset.amountXof}|${preset.costCenterCode}`;
    if (seen.has(key)) return;
    seen.add(key);
    presets.push(preset);
  };

  for (const row of account?.invoices ?? []) {
    if (row.packageType !== "custom" || !row.description) continue;
    push({
      id: `account:${row.id}`,
      label: row.description,
      amountXof: row.total,
      costCenterCode: "9100",
      source: "account",
    });
  }
  for (const component of feePlan?.components ?? []) {
    push({
      id: `catalog:${component.key}`,
      label: component.label,
      amountXof: component.annualAmountXof,
      costCenterCode: component.costCenterCode,
      source: "catalog",
    });
  }
  return presets;
}

function CustomChargeForm({
  studentId,
  account,
  feePlan,
  costCenters,
  busy,
  onSubmit,
}: {
  studentId: string;
  account: StudentAccount | null;
  feePlan?: FeePlan | null;
  costCenters: CostCenter[];
  busy: boolean;
  onSubmit: (input: {
    studentIds: string[];
    description: string;
    amountXof: number;
    costCenterCode?: string;
    dueDate?: string;
    installments?: { dueDate: string; amountXof: number; label?: string }[];
    requestReason: string;
  }) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [costCenterCode, setCostCenterCode] = useState(DEFAULT_COST_CENTER);
  const [dueDate, setDueDate] = useState(todayInput());
  const [split, setSplit] = useState(false);
  const [rows, setRows] = useState<CustomRow[]>([]);
  const [preset, setPreset] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const presets = useMemo(
    () => chargePresets(account, feePlan),
    [account, feePlan],
  );
  const amountXof = digits(amount);
  const scheduled = split
    ? rows.reduce((sum, row) => sum + digits(row.amount), 0)
    : amountXof;
  const reconciles = !split || (rows.length > 0 && scheduled === amountXof);
  const datesComplete = !split || rows.every((row) => row.dueDate);
  const valid =
    !busy &&
    description.trim().length > 0 &&
    amountXof > 0 &&
    reconciles &&
    datesComplete &&
    reason.trim().length > 0;

  function applyPreset(next: ChargePreset) {
    setDescription(next.label);
    setAmount(String(next.amountXof));
    setCostCenterCode(next.costCenterCode);
    setPreset(next.id);
  }

  function toggleSplit(next: boolean) {
    setSplit(next);
    if (next && rows.length === 0) {
      setRows([
        { dueDate: dueDate || todayInput(), amount: amount, label: "" },
      ]);
    }
  }

  function editRow(index: number, patch: Partial<CustomRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <>
      {presets.length > 0 && (
        <div className="charge-preset-row">
          {presets.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`charge-preset${preset === row.id ? " selected" : ""}`}
              onClick={() => applyPreset(row)}
            >
              {row.label}
              <small>{formatXof(row.amountXof)}</small>
            </button>
          ))}
        </div>
      )}
      {presets.length > 0 && (
        <p className="charge-preset-hint">
          Charges already on this account and the approved catalog. Picking one
          only fills the form below.
        </p>
      )}

      <Field label="Description *">
        <Input
          value={description}
          onChange={(value) => {
            setDescription(value.slice(0, 160));
            setPreset(null);
          }}
          placeholder="e.g. Laboratory replacement fee"
        />
      </Field>

      <div className="charge-form-grid">
        <Field label="Amount (XOF) *">
          <Input
            value={amount}
            onChange={(value) => {
              setAmount(String(digits(value) || ""));
              setPreset(null);
            }}
            align="right"
            inputMode="numeric"
            placeholder="0"
            invalid={amount.length > 0 && amountXof <= 0}
          />
        </Field>
        <Field label="Cost center *">
          <Select
            value={costCenterCode}
            onChange={setCostCenterCode}
            options={costCenterOptions(costCenters, costCenterCode)}
          />
        </Field>
      </div>

      <label className="charge-split-toggle">
        <input
          type="checkbox"
          checked={split}
          onChange={(event) => toggleSplit(event.target.checked)}
        />
        <span>Split this charge across several payment dates</span>
      </label>

      {split ? (
        <div className="charge-installments">
          {rows.map((row, index) => (
            <div key={index} className="charge-installment-row">
              <Input
                type="date"
                value={row.dueDate}
                onChange={(value) => editRow(index, { dueDate: value })}
              />
              <Input
                value={row.label}
                onChange={(value) =>
                  editRow(index, { label: value.slice(0, 80) })
                }
                placeholder={`Payment ${index + 1}`}
              />
              <Input
                value={row.amount}
                onChange={(value) =>
                  editRow(index, { amount: String(digits(value) || "") })
                }
                align="right"
                inputMode="numeric"
                placeholder="0"
              />
              <IconButton
                label={`Remove payment ${index + 1}`}
                tone="danger"
                disabled={rows.length <= 1}
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
          <div className="charge-installment-foot">
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              disabled={rows.length >= MAX_INSTALLMENTS}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { dueDate: todayInput(), amount: "", label: "" },
                ])
              }
            >
              Add a payment
            </Button>
            <span className={reconciles ? "" : "mismatch"}>
              {formatXof(scheduled)} scheduled of {formatXof(amountXof)}
              {reconciles ? "" : " — the payments must add up to the total"}
            </span>
          </div>
        </div>
      ) : (
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={setDueDate} />
        </Field>
      )}

      <Field
        label="Reason for this charge *"
        hint="The administrator sees this reason when deciding the request."
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Explain why this charge belongs on this student's account"
        />
      </Field>

      <div className="fee-component-submit">
        <span>
          The charge is billed as its own line on the student&apos;s account
          once an administrator approves it.
        </span>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onSubmit({
              studentIds: [studentId],
              description: description.trim(),
              amountXof,
              costCenterCode,
              ...(split
                ? {
                    installments: rows.map((row) => ({
                      dueDate: row.dueDate,
                      amountXof: digits(row.amount),
                      ...(row.label.trim() ? { label: row.label.trim() } : {}),
                    })),
                  }
                : { dueDate }),
              requestReason: reason.trim(),
            })
          }
        >
          {busy ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </>
  );
}

/**
 * The ScholarshipDefinition catalog is not on main yet, so a credit is entered
 * free-form here. When the catalog ships this grows an award picker that resolves
 * the label, cost center and rate server-side.
 */
function CreditForm({
  studentId,
  costCenters,
  busy,
  onSubmit,
}: {
  studentId: string;
  costCenters: CostCenter[];
  busy: boolean;
  onSubmit: (input: {
    studentId: string;
    label: string;
    amountXof: number;
    kind?: "discount" | "scholarship";
    costCenterCode?: string;
    requestReason: string;
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"discount" | "scholarship">("discount");
  const [costCenterCode, setCostCenterCode] = useState(DEFAULT_COST_CENTER);
  const [reason, setReason] = useState("");

  const amountXof = digits(amount);
  const valid =
    !busy &&
    label.trim().length > 0 &&
    amountXof > 0 &&
    reason.trim().length > 0;

  return (
    <>
      <div className="charge-form-grid">
        <Field label="Kind *">
          <Select
            value={kind}
            onChange={(next) => setKind(next as "discount" | "scholarship")}
            options={[
              { value: "discount", label: "Discount" },
              { value: "scholarship", label: "Scholarship" },
            ]}
          />
        </Field>
        <Field label="Cost center *">
          <Select
            value={costCenterCode}
            onChange={setCostCenterCode}
            options={costCenterOptions(costCenters, costCenterCode)}
          />
        </Field>
      </div>

      <Field label="Label *">
        <Input
          value={label}
          onChange={(value) => setLabel(value.slice(0, 160))}
          placeholder="e.g. Mention Bien — 15% of tuition"
        />
      </Field>

      <Field label="Amount (XOF) *">
        <Input
          value={amount}
          onChange={(value) => setAmount(String(digits(value) || ""))}
          align="right"
          inputMode="numeric"
          placeholder="0"
          invalid={amount.length > 0 && amountXof <= 0}
        />
      </Field>

      <Field
        label="Reason for this credit *"
        hint="The administrator sees this reason when deciding the request."
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Explain why this student qualifies"
        />
      </Field>

      <div className="fee-component-submit">
        <span>
          The credit is posted as a negative line on the student&apos;s account
          once an administrator approves it.
        </span>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onSubmit({
              studentId,
              label: label.trim(),
              amountXof,
              kind,
              costCenterCode,
              requestReason: reason.trim(),
            })
          }
        >
          {busy ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </>
  );
}
