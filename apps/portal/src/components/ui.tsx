"use client";

// Shared design-system primitives for the admin portal, matched to the
// design/daust-admin-design prototype (PageHeader, Tabs, Avatar, Badge,
// Drawer, Modal, SearchInput, Select) plus a small column-sort helper.
// All styling rides the existing globals.css tokens.

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

// ---------- PageHeader ----------
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 22,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && (
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14, maxWidth: "64ch" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

// ---------- Tabs ----------
export interface TabDef {
  value: string;
  label: string;
}
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 22, overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.value === active;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              border: "none",
              background: "none",
              padding: "10px 14px",
              marginBottom: -1,
              borderBottom: `2px solid ${on ? "var(--daust-navy)" : "transparent"}`,
              color: on ? "var(--daust-navy)" : "var(--fg3)",
              fontWeight: on ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
              borderRadius: 0,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Avatar (photo or deterministic initials) ----------
const AVATAR_COLORS = ["#153b6a", "#1d4a82", "#2e7d52", "#b4531a", "#7a4bd6", "#0f7d8c", "#c0392b", "#4d5965"];
export function Avatar({ name, size = 36, src }: { name: string; size?: number; src?: string | null }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

// ---------- Badge ----------
export type BadgeTone = "navy" | "success" | "warning" | "error" | "info" | "neutral" | "teal";
const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  navy: { bg: "var(--bg-tint)", fg: "var(--daust-navy)" },
  teal: { bg: "#dff1ef", fg: "#0f7d8c" },
  success: { bg: "#e3f5ec", fg: "var(--success)" },
  warning: { bg: "#fdf1dd", fg: "var(--warning)" },
  error: { bg: "#fbe6e3", fg: "var(--danger)" },
  info: { bg: "#e6eefb", fg: "var(--info)" },
  neutral: { bg: "var(--gray-50)", fg: "var(--fg2)" },
};
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  const t = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ---------- SearchInput ----------
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-pill)",
        padding: "8px 14px",
        width,
        minWidth: 220,
      }}
    >
      <Search size={15} color="var(--daust-steel)" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--fg1)" }}
      />
    </div>
  );
}

// ---------- Select ----------
export interface SelectOption {
  value: string;
  label: string;
}
export function Select({
  value,
  onChange,
  options,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (SelectOption | string)[];
  style?: React.CSSProperties;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

// ---------- Drawer (right slide-over) ----------
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.34)", backdropFilter: "blur(2px)" }} />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(100%, " + width + "px)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          animation: "ui-slide-in 180ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>{footer}</div>}
      </aside>
    </div>
  );
}

// ---------- Modal (centered) ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.34)", backdropFilter: "blur(2px)" }} />
      <div
        style={{
          position: "relative",
          width: "min(100%, " + width + "px)",
          maxHeight: "90vh",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          animation: "ui-pop-in 160ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Field (label + control) ----------
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{hint}</span>}
    </label>
  );
}

// ---------- Column sort helper ----------
export interface SortState {
  key: string;
  dir: "asc" | "desc";
}
export function useSort(initial?: SortState) {
  const [sort, setSort] = useState<SortState | null>(initial ?? null);
  function toggle(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function apply<R>(rows: R[], accessors: Record<string, (r: R) => string | number | null | undefined>): R[] {
    if (!sort) return rows;
    const acc = accessors[sort.key];
    if (!acc) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }
  return { sort, toggle, apply };
}

/** Sortable table header cell. `align="right"` for numeric columns. */
export function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const on = sort?.key === sortKey;
  return (
    <th style={{ cursor: "pointer", userSelect: "none", textAlign: align }} onClick={() => onSort(sortKey)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {label}
        {on ? (
          sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
        ) : (
          <ChevronDown size={13} style={{ opacity: 0.25 }} />
        )}
      </span>
    </th>
  );
}

/* ============================================================================
   DAUST design-system atoms (design/Student information system design (1)/_ds).
   Added for the SIS redesign. The capsule/pill is the core shape, navy is the
   primary and orange the single CTA accent used sparingly.
   ============================================================================ */

// ---------- Button ----------
export type ButtonVariant =
  | "primary"
  | "navy"
  | "secondary"
  | "outline"
  | "outlineLight"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "6px 14px", fontSize: 12.5 },
  md: { padding: "9px 18px", fontSize: 13.5 },
  lg: { padding: "12px 24px", fontSize: 15 },
};

const BTN_VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  // Orange is the CTA: used for the one primary action on a screen, never as a wash.
  primary: { background: "var(--cta)", color: "#fff", border: "1px solid transparent" },
  navy: { background: "var(--daust-navy)", color: "#fff", border: "1px solid transparent" },
  secondary: { background: "var(--surface-2)", color: "var(--daust-navy)", border: "1px solid var(--border)" },
  outline: { background: "transparent", color: "var(--daust-navy)", border: "1px solid var(--daust-navy)" },
  outlineLight: { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.5)" },
  ghost: { background: "transparent", color: "var(--fg2)", border: "1px solid transparent" },
  danger: { background: "var(--error-500)", color: "#fff", border: "1px solid transparent" },
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  disabled,
  onClick,
  type = "button",
  title,
  full,
  children,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="sis-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: "var(--radius-pill)",
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        width: full ? "100%" : undefined,
        whiteSpace: "nowrap",
        ...BTN_SIZES[size],
        ...BTN_VARIANTS[variant],
      }}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

// ---------- IconButton ----------
export function IconButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="sis-btn"
      style={{
        width: 34,
        height: 34,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: tone === "danger" ? "var(--error-500)" : "var(--fg2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---------- Card ----------
export function Card({
  title,
  action,
  pad = true,
  lift,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  pad?: boolean;
  lift?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={lift ? "sis-card sis-lift" : "sis-card"}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: pad ? 18 : 0,
      }}
    >
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          {typeof title === "string" ? (
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>{title}</h3>
          ) : (
            title
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ---------- Stat (KPI tile) ----------
export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? "sis-card sis-lift" : "sis-card"}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: 16,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        {icon && (
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--radius-md)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--accent-bg)",
              color: "var(--daust-navy)",
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg3)" }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1.1,
          color: tone ?? "var(--fg1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--fg3)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ---------- Progress ----------
export function Progress({
  pct,
  tone = "var(--daust-navy)",
  height = 8,
  label,
}: {
  pct: number;
  tone?: string;
  height?: number;
  label?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--fg3)", marginBottom: 6 }}>
          {label}
          <span style={{ fontWeight: 700, color: "var(--fg2)", fontVariantNumeric: "tabular-nums" }}>{clamped}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height, background: "var(--gray-100)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}
      >
        <div style={{ width: `${clamped}%`, height: "100%", background: tone, borderRadius: "var(--radius-pill)", transition: `width var(--dur-slow) var(--ease-standard)` }} />
      </div>
    </div>
  );
}

// ---------- EmptyState ----------
export function EmptyState({
  icon,
  title,
  note,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--fg3)" }}>
      {icon && <div style={{ marginBottom: 10, opacity: 0.5, display: "flex", justifyContent: "center" }}>{icon}</div>}
      <p style={{ margin: 0, fontWeight: 600, color: "var(--fg2)", fontSize: 14 }}>{title}</p>
      {note && <p style={{ margin: "6px 0 0", fontSize: 13 }}>{note}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ---------- Segmented (pill group) ----------
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="sis-btn"
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-pill)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid ${on ? "var(--daust-navy)" : "var(--border)"}`,
              background: on ? "var(--daust-navy)" : "var(--surface)",
              color: on ? "#fff" : "var(--fg2)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Toggle ----------
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 23,
          padding: 2,
          borderRadius: "var(--radius-pill)",
          border: "none",
          background: checked ? "var(--daust-navy)" : "var(--gray-200)",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          transition: `background var(--dur-fast) var(--ease-standard)`,
        }}
      >
        <span
          style={{
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow-xs)",
            transform: `translateX(${checked ? 17 : 0}px)`,
            transition: `transform var(--dur-fast) var(--ease-standard)`,
          }}
        />
      </button>
      {label && <span style={{ fontSize: 13.5, color: "var(--fg2)" }}>{label}</span>}
    </label>
  );
}

// ---------- Input ----------
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  invalid,
  align,
  width,
  inputMode,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  invalid?: boolean;
  align?: "left" | "right";
  width?: number | string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
}) {
  return (
    <input
      value={value}
      type={type}
      inputMode={inputMode}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: width ?? "100%",
        padding: "9px 12px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${invalid ? "var(--error-500)" : "var(--border)"}`,
        background: disabled ? "var(--surface-2)" : "var(--surface)",
        color: "var(--fg1)",
        fontSize: 13.5,
        fontFamily: "var(--font-body)",
        textAlign: align,
        outline: "none",
      }}
    />
  );
}

// ---------- Brand: TriDash / Eyebrow / SectionTitle ----------
export function TriDash({ onNavy, size = "md" }: { onNavy?: boolean; size?: "sm" | "md" }) {
  return (
    <div className={`tri-dash${size === "sm" ? " sm" : ""}${onNavy ? " on-navy" : ""}`} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

export function Eyebrow({ children, onNavy }: { children: React.ReactNode; onNavy?: boolean }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "var(--tracking-wider)",
        textTransform: "uppercase",
        color: onNavy ? "rgba(255,255,255,.55)" : "var(--daust-orange)",
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "22px 0 12px", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>{title}</h2>
        {sub && <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- BarChart (simple horizontal/vertical bars) ----------
export function BarChart({
  data,
  height = 140,
  tone = "var(--daust-navy)",
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div
              title={`${d.label}: ${d.value}`}
              style={{
                width: "100%",
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 3 : 0,
                background: tone,
                borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                transition: `height var(--dur-slow) var(--ease-standard)`,
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--fg3)", whiteSpace: "nowrap" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
