"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  type BillingCatalogAdjustmentDefinition,
  type BillingCatalogServiceOption,
  type BillingCatalogView,
  getBillingCatalog,
  getBillingCatalogYears,
  requestBillingCatalogChange,
} from "@/lib/api";
import { formatDateTime, formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";

type ServiceKind = BillingCatalogServiceOption["kind"];
type ServiceCalculation = BillingCatalogServiceOption["calculation"];
type AdjustmentBasis = BillingCatalogAdjustmentDefinition["basis"];
type AdjustmentCalculation = BillingCatalogAdjustmentDefinition["calculation"];
type AdjustmentStacking = BillingCatalogAdjustmentDefinition["stacking"];
type AdjustmentEffect = BillingCatalogAdjustmentDefinition["effect"];

interface ServiceDraft {
  id?: string;
  academicYearLabel: string;
  createdAt?: string;
  updatedAt?: string;
  kind: ServiceKind;
  code: string;
  label: string;
  description: string;
  calculation: ServiceCalculation;
  amountXof: string;
  percentageBasisPoints: string;
  basisServiceKind: ServiceKind | "";
  costCenterCode: string;
  refundable: boolean;
  defaultSelected: boolean;
  active: boolean;
  sortOrder: string;
}

interface AdjustmentDraft {
  id?: string;
  academicYearLabel: string;
  createdAt?: string;
  updatedAt?: string;
  key: string;
  label: string;
  description: string;
  basis: AdjustmentBasis;
  calculation: AdjustmentCalculation;
  stacking: AdjustmentStacking;
  effect: AdjustmentEffect;
  percentageBasisPoints: string;
  fixedAmountXof: string;
  requiresApproval: boolean;
  active: boolean;
  sortOrder: string;
}

const SERVICE_KINDS: { value: ServiceKind; label: string }[] = [
  { value: "housing", label: "Housing" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "insurance", label: "Insurance" },
  { value: "housing_caution", label: "Housing caution" },
];

const SERVICE_CALCULATIONS: {
  value: ServiceCalculation;
  label: string;
}[] = [
  { value: "fixed", label: "Fixed XOF amount" },
  {
    value: "percentage_of_service",
    label: "Percentage of another service",
  },
];

const ADJUSTMENT_BASES: { value: AdjustmentBasis; label: string }[] = [
  { value: "tuition", label: "Tuition" },
  { value: "housing", label: "Housing" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "insurance", label: "Insurance" },
  { value: "housing_caution", label: "Housing caution" },
  { value: "gross_charges", label: "All gross charges" },
  { value: "manual", label: "Manual basis" },
];

const ADJUSTMENT_CALCULATIONS: {
  value: AdjustmentCalculation;
  label: string;
}[] = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed XOF amount" },
  { value: "manual", label: "Reviewed manual amount" },
];

const ADJUSTMENT_STACKING: {
  value: AdjustmentStacking;
  label: string;
}[] = [
  { value: "additive", label: "Additive" },
  { value: "sequential", label: "Sequential" },
  { value: "exclusive", label: "Exclusive" },
];

const ADJUSTMENT_EFFECTS: { value: AdjustmentEffect; label: string }[] = [
  { value: "discount", label: "Discount" },
  { value: "charge", label: "Charge" },
];

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const CANONICAL_INSURANCE_CODE = "annual";
const CANONICAL_CAUTION_CODE = "housing_10_percent";
const COST_CENTER_BY_KIND: Record<ServiceKind, string> = {
  housing: "3700",
  cafeteria: "3600",
  insurance: "9100",
  housing_caution: "3700",
};

const editorGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 12,
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  paddingTop: 2,
};

function serviceToDraft(option: BillingCatalogServiceOption): ServiceDraft {
  return {
    id: option.id,
    academicYearLabel: option.academicYearLabel,
    createdAt: option.createdAt,
    updatedAt: option.updatedAt,
    kind: option.kind,
    code: option.code,
    label: option.label,
    description: option.description ?? "",
    calculation: option.calculation,
    amountXof: option.amountXof == null ? "" : String(option.amountXof),
    percentageBasisPoints:
      option.percentageBasisPoints == null
        ? ""
        : String(option.percentageBasisPoints),
    basisServiceKind: option.basisServiceKind ?? "",
    costCenterCode: option.costCenterCode,
    refundable: option.refundable,
    defaultSelected: option.defaultSelected,
    active: option.active,
    sortOrder: String(option.sortOrder),
  };
}

function adjustmentToDraft(
  definition: BillingCatalogAdjustmentDefinition,
): AdjustmentDraft {
  return {
    id: definition.id,
    academicYearLabel: definition.academicYearLabel,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
    key: definition.key,
    label: definition.label,
    description: definition.description ?? "",
    basis: definition.basis,
    calculation: definition.calculation,
    stacking: definition.stacking,
    effect: definition.effect,
    percentageBasisPoints:
      definition.percentageBasisPoints == null
        ? ""
        : String(definition.percentageBasisPoints),
    fixedAmountXof:
      definition.fixedAmountXof == null
        ? ""
        : String(definition.fixedAmountXof),
    requiresApproval: definition.requiresApproval,
    active: definition.active,
    sortOrder: String(definition.sortOrder),
  };
}

function draftDigest(
  serviceOptions: ServiceDraft[],
  adjustmentDefinitions: AdjustmentDraft[],
) {
  return JSON.stringify({ serviceOptions, adjustmentDefinitions });
}

function integer(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function percentageLabel(basisPoints: string) {
  const parsed = integer(basisPoints);
  return parsed == null
    ? "Percentage not set"
    : `${(parsed / 100).toFixed(2)}%`;
}

function serviceAmountLabel(option: ServiceDraft) {
  if (option.calculation === "percentage_of_service") {
    return `${percentageLabel(option.percentageBasisPoints)} of ${option.basisServiceKind || "service"}`;
  }
  const amount = integer(option.amountXof);
  return amount == null ? "Amount not set" : formatXof(amount);
}

function adjustmentAmountLabel(definition: AdjustmentDraft) {
  if (definition.calculation === "manual") return "Amount reviewed per student";
  if (definition.calculation === "percentage") {
    return percentageLabel(definition.percentageBasisPoints);
  }
  const amount = integer(definition.fixedAmountXof);
  return amount == null ? "Amount not set" : formatXof(amount);
}

function recordMetadata(
  id: string | undefined,
  academicYearLabel: string,
  createdAt?: string,
  updatedAt?: string,
) {
  if (!id) return `New proposal row · ${academicYearLabel}`;
  const created = createdAt ? formatDateTime(createdAt) : "unknown";
  const updated = updatedAt ? formatDateTime(updatedAt) : "unknown";
  return `Record ${id} · ${academicYearLabel} · created ${created} · updated ${updated}`;
}

function validateDraft(
  serviceOptions: ServiceDraft[],
  adjustmentDefinitions: AdjustmentDraft[],
  reason: string,
) {
  if (!reason.trim()) return "A reason is required for administrator review.";
  if (reason.trim().length > 1000) {
    return "The review reason must be 1,000 characters or fewer.";
  }
  if (serviceOptions.length < 4 || serviceOptions.length > 100) {
    return "The proposal needs between 4 and 100 service options.";
  }

  const serviceKeys = new Set<string>();
  const serviceByKey = new Map<string, ServiceDraft>();
  const requiredNone = new Set([
    "housing:none",
    "cafeteria:none",
    "insurance:none",
    "housing_caution:none",
  ]);
  const activeDefaults = new Map<ServiceKind, number>();

  for (const option of serviceOptions) {
    const code = option.code.trim();
    const key = `${option.kind}:${code || "(blank)"}`;
    if (!CODE_PATTERN.test(code)) {
      return `${key} needs a lowercase code beginning with a letter; use only letters, numbers, and underscores.`;
    }
    if (serviceKeys.has(key)) return `Service option ${key} is duplicated.`;
    serviceKeys.add(key);
    serviceByKey.set(key, option);
    requiredNone.delete(key);
    if (!option.label.trim() || option.label.trim().length > 120) {
      return `${key} needs a label of 120 characters or fewer.`;
    }
    if (option.description.trim().length > 500) {
      return `${key} has a description longer than 500 characters.`;
    }
    if (option.costCenterCode.trim() !== COST_CENTER_BY_KIND[option.kind]) {
      return `${key} must use cost center ${COST_CENTER_BY_KIND[option.kind]}.`;
    }
    const sortOrder = integer(option.sortOrder);
    if (sortOrder == null || sortOrder > 999) {
      return `${key} needs a whole-number sort order from 0 to 999.`;
    }
    if (option.defaultSelected && option.active) {
      activeDefaults.set(
        option.kind,
        (activeDefaults.get(option.kind) ?? 0) + 1,
      );
    }
    if (option.calculation === "fixed") {
      const amount = integer(option.amountXof);
      if (amount == null || amount > 2_000_000_000) {
        return `${key} needs a whole-XOF fixed amount between 0 and 2,000,000,000.`;
      }
      if (option.code === "none" && amount !== 0) {
        return `${key} is a no-service option and must remain 0 FCFA.`;
      }
      if (option.active && option.code !== "none" && amount === 0) {
        return `${key} cannot be active until it has an approved positive price.`;
      }
    } else {
      const percentage = integer(option.percentageBasisPoints);
      if (
        percentage == null ||
        percentage < 1 ||
        percentage > 10_000 ||
        option.kind !== "housing_caution" ||
        option.basisServiceKind !== "housing"
      ) {
        return `${key} must be a housing-caution percentage from 0.01% to 100%, based on housing.`;
      }
    }
    if (option.code === "none" && option.calculation !== "fixed") {
      return `${key} is a no-service option and must use a fixed 0 FCFA amount.`;
    }
    if (
      option.kind === "cafeteria" &&
      !["none", "half", "full"].includes(option.code)
    ) {
      return `${key} cannot be synchronized with Dining. Cafeteria codes must be none, half, or full.`;
    }
  }

  if (requiredNone.size > 0) {
    return `Required zero-charge options are missing: ${[...requiredNone].join(", ")}.`;
  }
  const requiredActive = [
    "housing:none",
    "cafeteria:none",
    "insurance:none",
    `insurance:${CANONICAL_INSURANCE_CODE}`,
    "housing_caution:none",
    `housing_caution:${CANONICAL_CAUTION_CODE}`,
  ];
  const missingActive = requiredActive.filter(
    (key) => !serviceByKey.get(key)?.active,
  );
  if (missingActive.length > 0) {
    return `Required active billing options are missing: ${missingActive.join(", ")}.`;
  }
  const insurance = serviceByKey.get(`insurance:${CANONICAL_INSURANCE_CODE}`)!;
  if (
    insurance.calculation !== "fixed" ||
    (integer(insurance.amountXof) ?? 0) <= 0
  ) {
    return `insurance:${CANONICAL_INSURANCE_CODE} must remain the active paid annual insurance option.`;
  }
  const caution = serviceByKey.get(
    `housing_caution:${CANONICAL_CAUTION_CODE}`,
  )!;
  if (
    caution.calculation !== "percentage_of_service" ||
    caution.basisServiceKind !== "housing" ||
    (integer(caution.percentageBasisPoints) ?? 0) <= 0
  ) {
    return `housing_caution:${CANONICAL_CAUTION_CODE} must remain the active housing percentage caution.`;
  }
  const unsupportedToggle = serviceOptions.find(
    (option) =>
      option.active &&
      ((option.kind === "insurance" &&
        option.code !== "none" &&
        option.code !== CANONICAL_INSURANCE_CODE) ||
        (option.kind === "housing_caution" &&
          option.code !== "none" &&
          option.code !== CANONICAL_CAUTION_CODE)),
  );
  if (unsupportedToggle) {
    return `${unsupportedToggle.kind}:${unsupportedToggle.code} cannot be selected by billing profiles. Keep it inactive or use the supported canonical code.`;
  }
  const duplicateDefault = [...activeDefaults].find(([, count]) => count > 1);
  if (duplicateDefault) {
    return `${duplicateDefault[0]} has more than one active default option.`;
  }

  const adjustmentKeys = new Set<string>();
  for (const definition of adjustmentDefinitions) {
    const key = definition.key.trim() || "(blank)";
    if (!CODE_PATTERN.test(definition.key.trim())) {
      return `${key} needs a lowercase adjustment key beginning with a letter; use only letters, numbers, and underscores.`;
    }
    if (adjustmentKeys.has(key)) {
      return `Adjustment definition ${key} is duplicated.`;
    }
    adjustmentKeys.add(key);
    if (!definition.label.trim() || definition.label.trim().length > 120) {
      return `${key} needs a label of 120 characters or fewer.`;
    }
    if (definition.description.trim().length > 500) {
      return `${key} has a description longer than 500 characters.`;
    }
    const sortOrder = integer(definition.sortOrder);
    if (sortOrder == null || sortOrder > 999) {
      return `${key} needs a whole-number sort order from 0 to 999.`;
    }
    if (definition.calculation === "percentage") {
      const percentage = integer(definition.percentageBasisPoints);
      if (percentage == null || percentage < 1 || percentage > 10_000) {
        return `${key} needs a percentage from 0.01% to 100%.`;
      }
    }
    if (definition.calculation === "fixed") {
      const amount = integer(definition.fixedAmountXof);
      if (amount == null || amount < 1 || amount > 2_000_000_000) {
        return `${key} needs a positive whole-XOF fixed amount no greater than 2,000,000,000.`;
      }
    }
    if (definition.calculation === "manual" && !definition.requiresApproval) {
      return `${key} is manual and must require approval.`;
    }
  }
  return null;
}

function ServiceOptionEditor({
  option,
  index,
  disabled,
  onChange,
}: {
  option: ServiceDraft;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<ServiceDraft>) => void;
}) {
  const fixed = option.calculation === "fixed";
  return (
    <fieldset
      disabled={disabled}
      style={{
        border: 0,
        borderTop: index === 0 ? 0 : "1px solid var(--border)",
        margin: 0,
        padding: index === 0 ? "2px 0 18px" : "20px 0 18px",
        minWidth: 0,
      }}
    >
      <legend style={{ width: "100%", padding: 0, marginBottom: 13 }}>
        <span
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <strong
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: 15,
                color: "var(--fg1)",
              }}
            >
              {option.label || "Unnamed service option"}
            </strong>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {option.kind}:{option.code || "new"} ·{" "}
              {serviceAmountLabel(option)}
            </span>
          </span>
          <span style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Badge tone={option.active ? "success" : "neutral"}>
              {option.active ? "Active" : "Inactive"}
            </Badge>
            {option.defaultSelected && <Badge tone="navy">Default</Badge>}
            {option.refundable && <Badge tone="info">Refundable</Badge>}
          </span>
        </span>
      </legend>

      <div style={editorGrid}>
        <Field label="Service kind">
          <Select
            ariaLabel={`Service kind for ${option.label || `row ${index + 1}`}`}
            value={option.kind}
            onChange={(value) => onChange({ kind: value as ServiceKind })}
            options={SERVICE_KINDS}
            disabled={disabled || Boolean(option.id)}
          />
        </Field>
        <Field
          label="Code"
          hint={
            option.id
              ? "Stable identifier. Add a new option instead of renaming this code."
              : "Lowercase stable identifier; it cannot be renamed after creation."
          }
        >
          <Input
            value={option.code}
            onChange={(code) => onChange({ code })}
            disabled={disabled || Boolean(option.id)}
          />
        </Field>
        <Field label="Display label">
          <Input
            value={option.label}
            onChange={(label) => onChange({ label })}
            disabled={disabled}
          />
        </Field>
        <Field label="Calculation">
          <Select
            ariaLabel={`Calculation for ${option.label || `row ${index + 1}`}`}
            value={option.calculation}
            onChange={(value) =>
              onChange(
                value === "fixed"
                  ? {
                      calculation: "fixed",
                      percentageBasisPoints: "",
                      basisServiceKind: "",
                    }
                  : {
                      calculation: "percentage_of_service",
                      amountXof: "",
                    },
              )
            }
            options={SERVICE_CALCULATIONS}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Fixed amount (FCFA)"
          hint={
            fixed
              ? "Whole XOF, including zero."
              : "Not used for percentage pricing."
          }
        >
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={option.amountXof}
            onChange={(amountXof) => onChange({ amountXof })}
            disabled={disabled || !fixed}
          />
        </Field>
        <Field
          label="Percentage (basis points)"
          hint="1,000 basis points = 10.00%."
        >
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={option.percentageBasisPoints}
            onChange={(percentageBasisPoints) =>
              onChange({ percentageBasisPoints })
            }
            disabled={disabled || fixed}
          />
        </Field>
        <Field
          label="Percentage basis service"
          hint="Only housing caution may use percentage pricing."
        >
          <Select
            ariaLabel={`Percentage basis for ${option.label || `row ${index + 1}`}`}
            value={option.basisServiceKind}
            onChange={(value) =>
              onChange({ basisServiceKind: value as ServiceKind | "" })
            }
            options={[{ value: "", label: "Not applicable" }, ...SERVICE_KINDS]}
            disabled={disabled || fixed}
          />
        </Field>
        <Field label="Cost center">
          <Input
            value={option.costCenterCode}
            onChange={(costCenterCode) => onChange({ costCenterCode })}
            disabled={disabled}
          />
        </Field>
        <Field label="Sort order">
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={option.sortOrder}
            onChange={(sortOrder) => onChange({ sortOrder })}
            disabled={disabled}
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Description">
          <Textarea
            rows={2}
            value={option.description}
            onChange={(description) => onChange({ description })}
            disabled={disabled}
          />
        </Field>
      </div>

      <div style={{ ...toggleRow, marginTop: 13 }}>
        <Toggle
          checked={option.active}
          onChange={(active) => onChange({ active })}
          disabled={disabled}
          label="Active"
        />
        <Toggle
          checked={option.defaultSelected}
          onChange={(defaultSelected) => onChange({ defaultSelected })}
          disabled={disabled}
          label="Selected by default"
        />
        <Toggle
          checked={option.refundable}
          onChange={(refundable) => onChange({ refundable })}
          disabled={disabled}
          label="Refundable"
        />
      </div>

      <p
        className="muted"
        style={{
          margin: "13px 0 0",
          fontSize: 10.5,
          overflowWrap: "anywhere",
        }}
      >
        {recordMetadata(
          option.id,
          option.academicYearLabel,
          option.createdAt,
          option.updatedAt,
        )}
      </p>
    </fieldset>
  );
}

function AdjustmentEditor({
  definition,
  index,
  disabled,
  onChange,
}: {
  definition: AdjustmentDraft;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<AdjustmentDraft>) => void;
}) {
  return (
    <fieldset
      disabled={disabled}
      style={{
        border: 0,
        borderTop: index === 0 ? 0 : "1px solid var(--border)",
        margin: 0,
        padding: index === 0 ? "2px 0 18px" : "20px 0 18px",
        minWidth: 0,
      }}
    >
      <legend style={{ width: "100%", padding: 0, marginBottom: 13 }}>
        <span
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <strong
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: 15,
                color: "var(--fg1)",
              }}
            >
              {definition.label || "Unnamed adjustment definition"}
            </strong>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {definition.key || "new"} · {definition.effect} ·{" "}
              {adjustmentAmountLabel(definition)}
            </span>
          </span>
          <span style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Badge tone={definition.active ? "success" : "neutral"}>
              {definition.active ? "Active" : "Inactive"}
            </Badge>
            <Badge tone={definition.effect === "discount" ? "info" : "warning"}>
              {definition.effect === "discount" ? "Discount" : "Charge"}
            </Badge>
            {definition.requiresApproval && (
              <Badge tone="navy">Approval required</Badge>
            )}
          </span>
        </span>
      </legend>

      <div style={editorGrid}>
        <Field
          label="Definition key"
          hint={
            definition.id
              ? "Stable identifier. Add a new definition instead of renaming this key."
              : "Lowercase stable identifier; it cannot be renamed after creation."
          }
        >
          <Input
            value={definition.key}
            onChange={(key) => onChange({ key })}
            disabled={disabled || Boolean(definition.id)}
          />
        </Field>
        <Field label="Display label">
          <Input
            value={definition.label}
            onChange={(label) => onChange({ label })}
            disabled={disabled}
          />
        </Field>
        <Field label="Basis">
          <Select
            ariaLabel={`Basis for ${definition.label || `row ${index + 1}`}`}
            value={definition.basis}
            onChange={(basis) => onChange({ basis: basis as AdjustmentBasis })}
            options={ADJUSTMENT_BASES}
            disabled={disabled}
          />
        </Field>
        <Field label="Calculation">
          <Select
            ariaLabel={`Calculation for ${definition.label || `row ${index + 1}`}`}
            value={definition.calculation}
            onChange={(value) => {
              const calculation = value as AdjustmentCalculation;
              onChange({
                calculation,
                percentageBasisPoints:
                  calculation === "percentage"
                    ? definition.percentageBasisPoints
                    : "",
                fixedAmountXof:
                  calculation === "fixed" ? definition.fixedAmountXof : "",
                requiresApproval:
                  calculation === "manual" ? true : definition.requiresApproval,
              });
            }}
            options={ADJUSTMENT_CALCULATIONS}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Percentage (basis points)"
          hint="1,000 basis points = 10.00%."
        >
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={definition.percentageBasisPoints}
            onChange={(percentageBasisPoints) =>
              onChange({ percentageBasisPoints })
            }
            disabled={disabled || definition.calculation !== "percentage"}
          />
        </Field>
        <Field
          label="Fixed amount (FCFA)"
          hint="A fixed adjustment must be positive."
        >
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={definition.fixedAmountXof}
            onChange={(fixedAmountXof) => onChange({ fixedAmountXof })}
            disabled={disabled || definition.calculation !== "fixed"}
          />
        </Field>
        <Field label="Stacking behavior">
          <Select
            ariaLabel={`Stacking behavior for ${definition.label || `row ${index + 1}`}`}
            value={definition.stacking}
            onChange={(stacking) =>
              onChange({ stacking: stacking as AdjustmentStacking })
            }
            options={ADJUSTMENT_STACKING}
            disabled={disabled}
          />
        </Field>
        <Field label="Financial effect">
          <Select
            ariaLabel={`Financial effect for ${definition.label || `row ${index + 1}`}`}
            value={definition.effect}
            onChange={(effect) =>
              onChange({ effect: effect as AdjustmentEffect })
            }
            options={ADJUSTMENT_EFFECTS}
            disabled={disabled}
          />
        </Field>
        <Field label="Sort order">
          <Input
            type="number"
            inputMode="numeric"
            align="right"
            value={definition.sortOrder}
            onChange={(sortOrder) => onChange({ sortOrder })}
            disabled={disabled}
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Description">
          <Textarea
            rows={2}
            value={definition.description}
            onChange={(description) => onChange({ description })}
            disabled={disabled}
          />
        </Field>
      </div>

      <div style={{ ...toggleRow, marginTop: 13 }}>
        <Toggle
          checked={definition.active}
          onChange={(active) => onChange({ active })}
          disabled={disabled}
          label="Active"
        />
        <Toggle
          checked={definition.requiresApproval}
          onChange={(requiresApproval) => onChange({ requiresApproval })}
          disabled={disabled || definition.calculation === "manual"}
          label="Requires approval"
        />
        {definition.calculation === "manual" && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            Manual amounts always require approval.
          </span>
        )}
      </div>

      <p
        className="muted"
        style={{
          margin: "13px 0 0",
          fontSize: 10.5,
          overflowWrap: "anywhere",
        }}
      >
        {recordMetadata(
          definition.id,
          definition.academicYearLabel,
          definition.createdAt,
          definition.updatedAt,
        )}
      </p>
    </fieldset>
  );
}

export default function BillingCatalogPage() {
  const [years, setYears] = useState<
    Awaited<ReturnType<typeof getBillingCatalogYears>>
  >([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [catalog, setCatalog] = useState<BillingCatalogView | null>(null);
  const [serviceOptions, setServiceOptions] = useState<ServiceDraft[]>([]);
  const [adjustmentDefinitions, setAdjustmentDefinitions] = useState<
    AdjustmentDraft[]
  >([]);
  const [baselineDigest, setBaselineDigest] = useState("");
  const [reason, setReason] = useState("");
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingByYear, setPendingByYear] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let current = true;
    getBillingCatalogYears()
      .then((result) => {
        if (!current) return;
        setYears(result);
        const preferred =
          result.find((year) => year.status === "active") ?? result[0];
        setSelectedYear((existing) => existing || preferred?.label || "");
        setError(null);
      })
      .catch((caught: Error) => {
        if (current) setError(caught.message);
      })
      .finally(() => {
        if (current) setLoadingYears(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const loadCatalog = useCallback(async (academicYearLabel: string) => {
    if (!academicYearLabel) return;
    setLoadingCatalog(true);
    setError(null);
    setNotice(null);
    try {
      const result = await getBillingCatalog(academicYearLabel);
      const nextServices = result.serviceOptions.map(serviceToDraft);
      const nextAdjustments =
        result.adjustmentDefinitions.map(adjustmentToDraft);
      setCatalog(result);
      setServiceOptions(nextServices);
      setAdjustmentDefinitions(nextAdjustments);
      setBaselineDigest(draftDigest(nextServices, nextAdjustments));
      setReason("");
    } catch (caught) {
      setCatalog(null);
      setServiceOptions([]);
      setAdjustmentDefinitions([]);
      setBaselineDigest("");
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the billing catalog.",
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog(selectedYear);
  }, [loadCatalog, selectedYear]);

  const currentDigest = useMemo(
    () => draftDigest(serviceOptions, adjustmentDefinitions),
    [adjustmentDefinitions, serviceOptions],
  );
  const dirty = Boolean(catalog) && currentDigest !== baselineDigest;
  const pendingRequestId = pendingByYear[selectedYear];
  const editorDisabled = submitting || Boolean(pendingRequestId);

  function patchService(index: number, patch: Partial<ServiceDraft>) {
    setServiceOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    );
    setError(null);
    setNotice(null);
  }

  function patchAdjustment(index: number, patch: Partial<AdjustmentDraft>) {
    setAdjustmentDefinitions((current) =>
      current.map((definition, definitionIndex) =>
        definitionIndex === index ? { ...definition, ...patch } : definition,
      ),
    );
    setError(null);
    setNotice(null);
  }

  function addServiceOption() {
    setServiceOptions((current) => [
      ...current,
      {
        academicYearLabel: selectedYear,
        kind: "housing",
        code: "",
        label: "",
        description: "",
        calculation: "fixed",
        amountXof: "0",
        percentageBasisPoints: "",
        basisServiceKind: "",
        costCenterCode: "3700",
        refundable: false,
        defaultSelected: false,
        active: false,
        sortOrder: String(current.length),
      },
    ]);
    setNotice(null);
  }

  function addRequiredNoneOptions() {
    const existing = new Set(
      serviceOptions.map((option) => `${option.kind}:${option.code.trim()}`),
    );
    const missing = SERVICE_KINDS.filter(
      ({ value }) => !existing.has(`${value}:none`),
    ).map<ServiceDraft>(({ value, label }, offset) => ({
      academicYearLabel: selectedYear,
      kind: value,
      code: "none",
      label: `No ${label.toLowerCase()}`,
      description: `No ${label.toLowerCase()} service selected for this academic year.`,
      calculation: "fixed",
      amountXof: "0",
      percentageBasisPoints: "",
      basisServiceKind: "",
      costCenterCode: COST_CENTER_BY_KIND[value],
      refundable: false,
      defaultSelected: true,
      active: true,
      sortOrder: String(serviceOptions.length + offset),
    }));
    setServiceOptions((current) => [...current, ...missing]);
    setNotice(null);
  }

  function addAdjustmentDefinition() {
    setAdjustmentDefinitions((current) => [
      ...current,
      {
        academicYearLabel: selectedYear,
        key: "",
        label: "",
        description: "",
        basis: "manual",
        calculation: "manual",
        stacking: "additive",
        effect: "discount",
        percentageBasisPoints: "",
        fixedAmountXof: "",
        requiresApproval: true,
        active: false,
        sortOrder: String(current.length),
      },
    ]);
    setNotice(null);
  }

  function resetProposal() {
    if (!catalog) return;
    const nextServices = catalog.serviceOptions.map(serviceToDraft);
    const nextAdjustments =
      catalog.adjustmentDefinitions.map(adjustmentToDraft);
    setServiceOptions(nextServices);
    setAdjustmentDefinitions(nextAdjustments);
    setReason("");
    setError(null);
    setNotice("Proposed edits were reset to the approved catalog.");
  }

  async function submitProposal() {
    if (!catalog) return;
    const validationError = validateDraft(
      serviceOptions,
      adjustmentDefinitions,
      reason,
    );
    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestBillingCatalogChange({
        academicYearLabel: selectedYear,
        expectedCatalogFingerprint: catalog.catalogFingerprint,
        reason: reason.trim(),
        serviceOptions: serviceOptions.map((option) => ({
          ...(option.id ? { id: option.id } : {}),
          kind: option.kind,
          code: option.code.trim(),
          label: option.label.trim(),
          description: option.description.trim() || null,
          calculation: option.calculation,
          amountXof:
            option.calculation === "fixed" ? integer(option.amountXof) : null,
          percentageBasisPoints:
            option.calculation === "percentage_of_service"
              ? integer(option.percentageBasisPoints)
              : null,
          basisServiceKind:
            option.calculation === "percentage_of_service"
              ? option.basisServiceKind || null
              : null,
          costCenterCode: option.costCenterCode.trim(),
          refundable: option.refundable,
          defaultSelected: option.defaultSelected,
          active: option.active,
          sortOrder: integer(option.sortOrder) ?? 0,
        })),
        adjustmentDefinitions: adjustmentDefinitions.map((definition) => ({
          ...(definition.id ? { id: definition.id } : {}),
          key: definition.key.trim(),
          label: definition.label.trim(),
          description: definition.description.trim() || null,
          basis: definition.basis,
          calculation: definition.calculation,
          stacking: definition.stacking,
          effect: definition.effect,
          percentageBasisPoints:
            definition.calculation === "percentage"
              ? integer(definition.percentageBasisPoints)
              : null,
          fixedAmountXof:
            definition.calculation === "fixed"
              ? integer(definition.fixedAmountXof)
              : null,
          requiresApproval: definition.requiresApproval,
          active: definition.active,
          sortOrder: integer(definition.sortOrder) ?? 0,
        })),
      });

      if (result.applied) {
        setNotice(
          `Catalog revision ${result.request.id} was approved and applied. Refreshing the authoritative catalog…`,
        );
        await loadCatalog(selectedYear);
      } else {
        setPendingByYear((current) => ({
          ...current,
          [selectedYear]: result.request.id,
        }));
        setNotice(
          `Approval request ${result.request.id} was submitted. The approved catalog and student billing remain unchanged until an administrator approves it.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit the billing catalog proposal.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const yearOptions = years.map((year) => ({
    value: year.label,
    label: `${year.label} · ${year.status}`,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Finance configuration"
        title="Annual Billing Catalog"
        subtitle="Propose annual service prices and scholarship rules without changing an approved student bill directly."
        actions={
          <Field label="Academic year">
            <Select
              ariaLabel="Billing catalog academic year"
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
              disabled={loadingYears || submitting}
              style={{ minWidth: 210 }}
            />
          </Field>
        }
      />

      <div
        role="note"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 11,
          padding: "13px 15px",
          marginBottom: 16,
          border:
            "1px solid color-mix(in srgb, var(--daust-navy) 24%, var(--border))",
          borderRadius: "var(--radius-lg)",
          background:
            "color-mix(in srgb, var(--daust-navy) 5%, var(--surface))",
          color: "var(--fg2)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <ShieldCheck
          size={18}
          aria-hidden
          style={{ color: "var(--daust-navy)", flexShrink: 0, marginTop: 1 }}
        />
        <span>
          <strong style={{ color: "var(--fg1)" }}>
            Administrator approval is required.
          </strong>{" "}
          Saving this screen creates a review request only. Current profiles,
          invoices, Dining access, and Housing assignments do not change until
          that request is separately approved.
        </span>
      </div>

      {notice && (
        <p
          className="card"
          role="status"
          aria-live="polite"
          style={{ color: "var(--success)", marginBottom: 16 }}
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          className="card"
          role="alert"
          style={{ color: "var(--danger)", marginBottom: 16 }}
        >
          {error}
        </p>
      )}

      {(loadingYears || loadingCatalog) && (
        <p className="muted" role="status" aria-live="polite">
          Loading the authoritative billing catalog…
        </p>
      )}

      {!loadingYears && years.length === 0 && (
        <Card>
          <EmptyState
            icon={<CalendarRange size={24} />}
            title="No academic years are available"
            note="Create an academic year before proposing a billing catalog."
          />
        </Card>
      )}

      {catalog && !loadingCatalog && (
        <div aria-busy={submitting}>
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="eyebrow">Approved concurrency baseline</div>
                <h2
                  style={{
                    margin: "2px 0 4px",
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                  }}
                >
                  {catalog.academicYearLabel}
                </h2>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  {catalog.serviceOptions.length} service options ·{" "}
                  {catalog.adjustmentDefinitions.length} adjustment definitions
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {pendingRequestId ? (
                  <Badge tone="warning">Approval pending</Badge>
                ) : dirty ? (
                  <Badge tone="info">Proposed edits</Badge>
                ) : (
                  <Badge tone="success">Matches approved catalog</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RefreshCcw size={14} />}
                  onClick={() => void loadCatalog(selectedYear)}
                  disabled={submitting || dirty}
                  title={
                    dirty
                      ? "Reset the proposal before refreshing the approved catalog"
                      : "Refresh the approved catalog"
                  }
                >
                  Refresh
                </Button>
              </div>
            </div>
            <p
              className="muted"
              title={catalog.catalogFingerprint}
              style={{
                borderTop: "1px solid var(--border)",
                margin: "14px 0 0",
                paddingTop: 11,
                fontSize: 10.5,
                overflowWrap: "anywhere",
              }}
            >
              Expected catalog fingerprint: {catalog.catalogFingerprint}
            </p>
          </Card>

          <div style={{ height: 16 }} />

          <Card
            title={
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                  }}
                >
                  Service options
                </h2>
                <p
                  className="muted"
                  style={{ margin: "3px 0 0", fontSize: 11.5 }}
                >
                  Housing, cafeteria, insurance, and refundable caution pricing.
                </p>
              </div>
            }
            action={
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={addRequiredNoneOptions}
                  disabled={
                    editorDisabled ||
                    SERVICE_KINDS.every(({ value }) =>
                      serviceOptions.some(
                        (option) =>
                          option.kind === value && option.code === "none",
                      ),
                    )
                  }
                >
                  Add missing “none” options
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={addServiceOption}
                  disabled={editorDisabled}
                >
                  Add option
                </Button>
              </div>
            }
          >
            {serviceOptions.length === 0 ? (
              <EmptyState
                icon={<SlidersHorizontal size={24} />}
                title="No service options for this year"
                note="Begin with the required zero-charge options, then add priced services. Nothing is applied before approval."
                action={
                  <Button
                    size="sm"
                    variant="navy"
                    onClick={addRequiredNoneOptions}
                    disabled={editorDisabled}
                  >
                    Add required options
                  </Button>
                }
              />
            ) : (
              serviceOptions.map((option, index) => (
                <ServiceOptionEditor
                  key={option.id ?? `new-service-${index}`}
                  option={option}
                  index={index}
                  disabled={editorDisabled}
                  onChange={(patch) => patchService(index, patch)}
                />
              ))
            )}
          </Card>

          <div style={{ height: 16 }} />

          <Card
            title={
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                  }}
                >
                  Scholarship & adjustment definitions
                </h2>
                <p
                  className="muted"
                  style={{ margin: "3px 0 0", fontSize: 11.5 }}
                >
                  Calculation basis, stacking, financial effect, and approval
                  policy.
                </p>
              </div>
            }
            action={
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={addAdjustmentDefinition}
                disabled={editorDisabled}
              >
                Add definition
              </Button>
            }
          >
            {adjustmentDefinitions.length === 0 ? (
              <EmptyState
                title="No adjustment definitions for this year"
                note="Add a definition when Finance is ready to propose a scholarship, charge, or reviewed manual adjustment."
                action={
                  <Button
                    size="sm"
                    variant="navy"
                    onClick={addAdjustmentDefinition}
                    disabled={editorDisabled}
                  >
                    Add definition
                  </Button>
                }
              />
            ) : (
              adjustmentDefinitions.map((definition, index) => (
                <AdjustmentEditor
                  key={definition.id ?? `new-adjustment-${index}`}
                  definition={definition}
                  index={index}
                  disabled={editorDisabled}
                  onChange={(patch) => patchAdjustment(index, patch)}
                />
              ))
            )}
          </Card>

          <div style={{ height: 16 }} />

          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
                gap: 18,
                alignItems: "end",
              }}
            >
              <Field
                label="Reason for this catalog revision"
                hint="Required. This explanation is included in the administrator's approval record."
              >
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(value) => {
                    setReason(value);
                    setError(null);
                  }}
                  placeholder="Describe the approved policy or price source behind these proposed changes."
                  invalid={!reason.trim() && dirty}
                  disabled={editorDisabled}
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant="ghost"
                  onClick={resetProposal}
                  disabled={!dirty || editorDisabled}
                >
                  Reset proposal
                </Button>
                <Button
                  variant="primary"
                  icon={<Save size={15} />}
                  onClick={() => void submitProposal()}
                  disabled={
                    !dirty ||
                    !reason.trim() ||
                    submitting ||
                    Boolean(pendingRequestId)
                  }
                >
                  {submitting
                    ? "Submitting request…"
                    : pendingRequestId
                      ? "Approval pending"
                      : "Request administrator approval"}
                </Button>
              </div>
            </div>
            <p
              className="muted"
              style={{
                borderTop: "1px solid var(--border)",
                margin: "15px 0 0",
                paddingTop: 11,
                fontSize: 11.5,
              }}
            >
              Submitting uses the fingerprint shown above. If the approved
              catalog changed while you were editing, the request is rejected so
              you can refresh and review the new baseline.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
