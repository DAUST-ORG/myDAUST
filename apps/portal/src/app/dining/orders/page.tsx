"use client";

import { useCallback, useEffect, useState } from "react";
import { type AdminDiningOrder, advanceDiningOrder, getAdminDiningOrders } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
const COLUMNS: { key: string; label: string; next?: string }[] = [
  { key: "paid", label: "Paid", next: "preparing" },
  { key: "preparing", label: "Preparing", next: "ready" },
  { key: "ready", label: "Ready", next: "collected" },
  { key: "collected", label: "Collected" },
];

export default function DiningOrdersPage() {
  const [orders, setOrders] = useState<AdminDiningOrder[]>([]);
  const load = useCallback(() => {
    getAdminDiningOrders().then(setOrders).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function advance(id: string, next: string) {
    await advanceDiningOrder(id, next);
    load();
  }

  return (
    <>
      <p className="eyebrow">Kitchen</p>
      <h1 className="page-title">Weekend Orders</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => o.status === col.key);
          return (
            <div key={col.key} style={{ background: "var(--gray-50)", borderRadius: 14, padding: 12, minHeight: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{col.label}</span>
                <span className="badge pending">{items.length}</span>
              </div>
              {items.map((o) => (
                <div key={o.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{o.student}</div>
                  <div className="muted" style={{ fontSize: 12, margin: "4px 0" }}>{o.items.join(", ")}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 13 }}>{xof(o.totalXof)}</strong>
                    {col.next && <button onClick={() => advance(o.id, col.next!)} style={{ fontSize: 12 }}>→ {col.next}</button>}
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Empty</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
