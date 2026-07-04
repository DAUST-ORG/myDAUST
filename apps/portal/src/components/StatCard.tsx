import type { LucideIcon } from "lucide-react";

export function StatCard({
  value,
  label,
  icon: Icon,
  color = "var(--daust-navy)",
  trend,
  onClick,
}: {
  value: React.ReactNode;
  label: string;
  icon: LucideIcon;
  color?: string;
  trend?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        background: "var(--surface)",
        border: "1px solid var(--gray-100)",
        borderRadius: 16,
        padding: 20,
        boxShadow: "var(--shadow-sm)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: `color-mix(in srgb, ${color} 12%, white)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={21} color={color} />
        </div>
        {trend && <span className="badge completed">{trend}</span>}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, color: "var(--fg1)", marginTop: 14, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--fg3)", marginTop: 5 }}>{label}</div>
    </div>
  );
}
