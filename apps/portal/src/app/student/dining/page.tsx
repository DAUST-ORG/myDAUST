"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import {
  type DiningOrder,
  type DiningPass,
  type MenuItem,
  chooseMealPlan,
  createDiningOrder,
  getDiningPass,
  getMenu,
  getMyDiningOrders,
  payDiningOrder,
} from "@/lib/api";

const TABS = ["Pass", "Weekend orders", "My plan"] as const;
type Tab = (typeof TABS)[number];
const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
const PLANS = [
  { type: "full", label: "Full pension", note: "Breakfast · lunch · dinner, every weekday" },
  { type: "half", label: "Half pension", note: "Breakfast · lunch (no dinner)" },
  { type: "none", label: "No plan", note: "Pay per weekend order only" },
];
const STATUS_BADGE: Record<string, string> = { cart: "pending", paid: "partial", preparing: "partial", ready: "completed", collected: "completed", cancelled: "overdue" };

export default function StudentDiningPage() {
  const [tab, setTab] = useState<Tab>("Pass");
  const [pass, setPass] = useState<DiningPass | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    getDiningPass().then(setPass).catch(() => {});
    getMenu().then(setMenu).catch(() => {});
    getMyDiningOrders().then(setOrders).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const cartTotal = Object.entries(cart).reduce((s, [id, q]) => s + (menu.find((m) => m.id === id)?.priceXof ?? 0) * q, 0);

  async function placeOrder() {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([menuItemId, qty]) => ({ menuItemId, qty }));
    if (items.length === 0) return;
    const { id } = await createDiningOrder(items);
    await payDiningOrder(id);
    setCart({});
    load();
    setTab("Weekend orders");
  }

  return (
    <>
      <p className="eyebrow">Campus dining</p>
      <h1 className="page-title">Dining</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={tab === t ? "primary" : ""}>{t}</button>)}
      </div>

      {tab === "Pass" && pass && (
        <div className="card" style={{ maxWidth: 420, textAlign: "center", margin: "0 auto" }}>
          <p className="muted" style={{ fontSize: 13 }}>Show this at the dining hall entrance</p>
          <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
            <QrCode value={pass.token} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{pass.name}</div>
          <div className="muted">{pass.studentNo}</div>
          <div style={{ marginTop: 12 }}>
            {pass.active ? <span className="badge completed">{pass.plan} plan · active</span> : <span className="badge overdue">No active plan</span>}
          </div>
        </div>
      )}

      {tab === "Weekend orders" && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="card" style={{ flex: 2 }}>
            <p className="h1" style={{ fontSize: 16 }}>Weekend menu</p>
            <table>
              <thead><tr><th>Item</th><th>Price</th><th>Qty</th></tr></thead>
              <tbody>
                {menu.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong>{m.description && <div className="muted" style={{ fontSize: 12 }}>{m.description}</div>}</td>
                    <td>{xof(m.priceXof)}</td>
                    <td>
                      <input type="number" min={0} value={cart[m.id] ?? 0} onChange={(e) => setCart({ ...cart, [m.id]: Math.max(0, Number(e.target.value)) })} style={{ width: 60 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="h1" style={{ fontSize: 16 }}>Checkout</p>
            <div style={{ display: "flex", justifyContent: "space-between", margin: "12px 0", fontSize: 18, fontWeight: 700 }}>
              <span>Total</span><span>{xof(cartTotal)}</span>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Paid via Wave / Orange Money (PayTech).</p>
            <button className="primary" onClick={placeOrder} disabled={cartTotal === 0} style={{ width: "100%", marginTop: 8 }}>Pay & order</button>
            <p className="h1" style={{ fontSize: 14, marginTop: 18 }}>My orders</p>
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} style={{ borderTop: "1px solid var(--divider)", padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                  <strong>{xof(o.totalXof)}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "My plan" && (
        <div className="row">
          {PLANS.map((p) => (
            <div key={p.type} className="card" style={{ flex: 1, borderTop: pass?.plan === p.type ? "3px solid var(--daust-orange)" : undefined }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{p.label}</div>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{p.note}</p>
              <button className={pass?.plan === p.type ? "" : "primary"} disabled={pass?.plan === p.type} onClick={() => chooseMealPlan(p.type).then(load)} style={{ marginTop: 12 }}>
                {pass?.plan === p.type ? "Current plan" : "Choose"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
