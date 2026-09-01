"use client";

import { useCallback, useMemo, useState } from "react";
import type { FormDetail, FormSectionDef, FormFieldDef } from "@/lib/api";

interface Props {
  form: FormDetail;
  answers: Record<string, unknown>;
  onChange: (answers: Record<string, unknown>) => void;
  disabled?: boolean;
}

interface Condition {
  fieldId?: string;
  operator?: string;
  value?: string;
  conditions?: Condition[];
}

function evaluateCondition(
  cond: Condition | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  if ("fieldId" in cond && cond.fieldId && cond.operator) {
    const val = answers[cond.fieldId];
    switch (cond.operator) {
      case "equals":
        return String(val) === cond.value;
      case "not_equals":
        return String(val) !== cond.value;
      case "contains":
        return typeof val === "string" && val.includes(cond.value ?? "");
      case "not_empty":
        return val !== null && val !== undefined && String(val).trim() !== "";
      case "is_true":
        return val === true || val === "true";
      case "is_false":
        return val === false || val === "false";
      default:
        return true;
    }
  }
  if ("operator" in cond && "conditions" in cond && Array.isArray(cond.conditions)) {
    const results = cond.conditions.map((c) => evaluateCondition(c, answers));
    return cond.operator === "and"
      ? results.every(Boolean)
      : results.some(Boolean);
  }
  return true;
}

export default function FormRenderer({ form, answers, onChange, disabled }: Props) {
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const handleFieldChange = useCallback(
    (fieldId: string, value: unknown) => {
      onChange({ ...answers, [fieldId]: value });
      setTouched((prev) => {
        const next = new Set(prev);
        next.add(fieldId);
        return next;
      });
    },
    [answers, onChange],
  );

  const sections = useMemo(() => {
    return form.sections.filter((s) =>
      evaluateCondition(s.conditionJson as Condition | null, answers),
    );
  }, [form.sections, answers]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {form.title && (
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--daust-navy)" }}>
          {form.title}
        </h2>
      )}
      {form.description && (
        <p style={{ color: "var(--fg3)", marginTop: -12 }}>
          {form.description}
        </p>
      )}
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          answers={answers}
          onChange={handleFieldChange}
          disabled={disabled}
          touched={touched}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  answers,
  onChange,
  disabled,
  touched,
}: {
  section: FormSectionDef;
  answers: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  disabled?: boolean;
  touched: Set<string>;
}) {
  const visibleFields = useMemo(
    () =>
      section.fields.filter((f) =>
        evaluateCondition(f.conditionJson as Condition | null, answers),
      ),
    [section.fields, answers],
  );

  if (visibleFields.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 14,
          color: "var(--daust-navy)",
        }}
      >
        {section.title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {visibleFields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(v) => onChange(field.id, v)}
            disabled={disabled}
            showRequired={touched.has(field.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  showRequired,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  showRequired?: boolean;
}) {
  const options = field.optionsJson ?? [];
  const missing = field.required && showRequired && (value === null || value === undefined || value === "");

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 4,
          color: "var(--fg1)",
        }}
      >
        {field.label}
        {field.required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {field.type === "text" && (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: `1px solid ${missing ? "var(--danger)" : "var(--border)"}`,
            borderRadius: 6,
            fontSize: 14,
            background: disabled ? "var(--surface-2)" : "var(--bg)",
          }}
        />
      )}
      {field.type === "textarea" && (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: `1px solid ${missing ? "var(--danger)" : "var(--border)"}`,
            borderRadius: 6,
            fontSize: 14,
            resize: "vertical",
            background: disabled ? "var(--surface-2)" : "var(--bg)",
          }}
        />
      )}
      {field.type === "select" && (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: `1px solid ${missing ? "var(--danger)" : "var(--border)"}`,
            borderRadius: 6,
            fontSize: 14,
            background: disabled ? "var(--surface-2)" : "var(--bg)",
          }}
        >
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {field.type === "checkbox" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span style={{ fontSize: 13 }}>
            {options.length > 0 ? options[0]!.label : "Yes"}
          </span>
        </label>
      )}
      {field.type === "date" && (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: `1px solid ${missing ? "var(--danger)" : "var(--border)"}`,
            borderRadius: 6,
            fontSize: 14,
            background: disabled ? "var(--surface-2)" : "var(--bg)",
          }}
        />
      )}
      {missing && (
        <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 2 }}>
          This field is required
        </p>
      )}
    </div>
  );
}
