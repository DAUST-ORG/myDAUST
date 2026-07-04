import { ChevronRight } from "lucide-react";

export function Panel({
  title,
  action,
  onAction,
  pad = 20,
  children,
  style,
}: {
  title?: string;
  action?: string;
  onAction?: () => void;
  pad?: number | string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--gray-100)",
        borderRadius: 16,
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16.5, color: "var(--fg1)" }}>
            {title}
          </h3>
          {action && (
            <button
              onClick={onAction}
              style={{
                border: "none",
                background: "none",
                color: "var(--daust-navy)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: 0,
              }}
            >
              {action} <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}
