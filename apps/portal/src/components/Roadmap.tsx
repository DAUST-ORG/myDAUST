import { Check } from "lucide-react";
import type { RoadmapPhase } from "@/lib/api";

export function Roadmap({ phases }: { phases: RoadmapPhase[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
      {phases.map((p, i) => {
        const color = p.status === "done" ? "#2e7d52" : p.status === "current" ? "var(--daust-orange)" : "var(--gray-300)";
        return (
          <div key={p.id} style={{ flex: 1, minWidth: 110, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i < phases.length - 1 && (
              <div style={{ position: "absolute", top: 15, left: "50%", right: "-50%", height: 3, background: p.status === "done" ? "#2e7d52" : "var(--gray-100)" }} />
            )}
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: p.status === "upcoming" ? "#fff" : color, border: `2.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, color: "#fff", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
              {p.status === "done" ? <Check size={16} /> : <span style={{ color: p.status === "current" ? "#fff" : "var(--gray-300)" }}>{i + 1}</span>}
            </div>
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: p.status === "upcoming" ? "var(--fg3)" : "var(--fg1)" }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 10.5, maxWidth: 100, margin: "2px auto 0", lineHeight: 1.3 }}>{p.short}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
