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
