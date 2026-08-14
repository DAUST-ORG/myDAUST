"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import {
  type DiningOrder,
  type DiningPass,
  type MenuItem,
  type PaymentSubmissionSummary,
  type ProofPaymentMethod,
  changeResumablePaymentMethod,
  chooseMealPlan,
  createDiningOrder,
  fileUrl,
  getDiningPass,
  getMenu,
  getMyDiningOrders,
  listMyPaymentAttempts,
  payDiningOrder,
  submitResumablePaymentProof,
} from "@/lib/api";
import { type DiningToday, getDiningToday } from "@/lib/api-dining";
import { PageHeader, Segmented } from "@/components/ui";
import { ProofPaymentPanel } from "@/components/ProofPaymentPanel";

const TABS = ["Home", "Pass", "Weekend orders", "My plan"] as const;
type Tab = (typeof TABS)[number];
const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

const MEALS = [
  {
    key: "breakfast",
    label: "Breakfast",
    window: "07:00 – 09:00",
    startHour: 7,
  },
  { key: "lunch", label: "Lunch", window: "12:00 – 14:00", startHour: 12 },
  { key: "dinner", label: "Dinner", window: "19:00 – 21:00", startHour: 19 },
] as const;

/** The next meal from now: first period whose start hour is still ahead, else tomorrow's breakfast. */
function nextMeal(now = new Date()) {
  const upcoming = MEALS.find((m) => now.getHours() < m.startHour);
  return upcoming
    ? { ...upcoming, tomorrow: false }
    : { ...MEALS[0], tomorrow: true };
}
const PLANS = [
  {
    type: "full",
    label: "Full pension",
    note: "Breakfast · lunch · dinner, every weekday",
  },
  {
    type: "half",
    label: "Half pension",
    note: "Breakfast · lunch (no dinner)",
  },
  { type: "none", label: "No plan", note: "Pay per weekend order only" },
];
const STATUS_BADGE: Record<string, string> = {
  cart: "pending",
  paid: "partial",
  preparing: "partial",
  ready: "completed",
  collected: "completed",
  cancelled: "overdue",
};

export default function StudentDiningPage() {
  const [tab, setTab] = useState<Tab>("Home");
  const [pass, setPass] = useState<DiningPass | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [today, setToday] = useState<DiningToday | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [attempts, setAttempts] = useState<PaymentSubmissionSummary[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderAmount, setSelectedOrderAmount] = useState(0);

  const load = useCallback(() => {
    getDiningPass()
      .then(setPass)
      .catch(() => {});
    getMenu()
      .then(setMenu)
      .catch(() => {});
    getMyDiningOrders()
      .then(setOrders)
      .catch(() => {});
    getDiningToday()
      .then(setToday)
      .catch(() => {});
    listMyPaymentAttempts()
      .then(setAttempts)
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const cartTotal = Object.entries(cart).reduce(
    (s, [id, q]) => s + (menu.find((m) => m.id === id)?.priceXof ?? 0) * q,
    0,
  );

  async function placeOrder() {
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, qty]) => ({ menuItemId, qty }));
    if (items.length === 0) return;
    const { id } = await createDiningOrder(items);
    setSelectedOrderId(id);
    setSelectedOrderAmount(cartTotal);
    setCart({});
    load();
    setTab("Weekend orders");
  }

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const paymentAmount = selectedOrder?.totalXof ?? selectedOrderAmount;
  const selectedAttempt =
    attempts.find(
      (attempt) =>
        attempt.diningOrderId === selectedOrderId &&
        ["awaiting_proof", "submitted"].includes(attempt.status),
    ) ?? null;

  async function startOrderPayment(method: ProofPaymentMethod) {
    if (!selectedOrderId) throw new Error("Choose an order");
    const next = await payDiningOrder(selectedOrderId, method);
    setAttempts((rows) => [next, ...rows.filter((row) => row.id !== next.id)]);
    return next;
  }

  async function changeOrderPayment(id: string, method: ProofPaymentMethod) {
    const current = attempts.find((attempt) => attempt.id === id);
    if (!current?.resumeToken) throw new Error("Resume token is missing");
    const next = await changeResumablePaymentMethod(
      current.resumeToken,
      id,
      method,
    );
    setAttempts((rows) => rows.map((row) => (row.id === id ? next : row)));
    return next;
  }

  async function uploadOrderProof(id: string, proof: File) {
    const current = attempts.find((attempt) => attempt.id === id);
    if (!current?.resumeToken) throw new Error("Resume token is missing");
    const next = await submitResumablePaymentProof(
      current.resumeToken,
      id,
      proof,
    );
    setAttempts((rows) => rows.map((row) => (row.id === id ? next : row)));
    return next;
  }

  return (
    <>
      <PageHeader
        title="Dining & Meal Plan"
        subtitle={
          pass?.plan
            ? `${pass.plan} plan · ${pass.active ? "active" : "inactive"}`
            : "Meal plan"
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Segmented
          options={TABS.map((t) => ({ value: t, label: t }))}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      {tab === "Home" &&
        (() => {
          const next = nextMeal();
          const served = new Set(today?.scannedPeriods ?? []);
          return (
            <>
              <div
                className="row"
                style={{ alignItems: "stretch", marginBottom: 16 }}
              >
                <div
                  className="card"
                  style={{
                    flex: 2,
                    borderTop: "3px solid var(--daust-orange)",
                  }}
                >
                  <p className="eyebrow" style={{ marginBottom: 4 }}>
                    Next meal{next.tomorrow ? " · tomorrow" : ""}
                  </p>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: 26,
                    }}
                  >
                    {next.label}
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>
                    {next.window}
                  </p>
                  <div style={{ marginTop: 12 }}>
                    {pass?.active ? (
                      <span className="badge completed">
                        {pass.plan} plan · active
                      </span>
                    ) : (
                      <span className="badge overdue">No active plan</span>
                    )}
                  </div>
                </div>
                <div className="card" style={{ flex: 3 }}>
                  <p className="h1" style={{ fontSize: 15, marginBottom: 8 }}>
                    Today&rsquo;s meals
                  </p>
                  {MEALS.map((m) => {
                    const done = served.has(m.key);
                    const isNext =
                      m.key === next.key && !next.tomorrow && !done;
                    return (
                      <div
                        key={m.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "9px 0",
                          borderBottom: "1px solid var(--divider)",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: isNext ? "var(--daust-orange)" : undefined,
                            }}
                          >
                            {m.label}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {m.window}
                          </div>
                        </div>
                        {done ? (
                          <span className="badge completed">Served</span>
                        ) : isNext ? (
                          <span className="badge partial">Up next</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Upcoming
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="row">
                {(
                  [
                    ["Pass", "My dining pass", "Show the QR at the entrance"],
                    [
                      "Weekend orders",
                      "Weekend menu",
                      "Order & pay for weekend meals",
                    ],
                    ["My plan", "Meal plan", "Review or change your plan"],
                  ] as const
                ).map(([target, title, note]) => (
                  <button
                    key={target}
                    onClick={() => setTab(target)}
                    className="card"
                    style={{
                      flex: 1,
                      textAlign: "left",
                      cursor: "pointer",
                      background: "var(--surface, #fff)",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {title}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 12, marginTop: 4 }}
                    >
                      {note}
                    </div>
                  </button>
                ))}
              </div>
            </>
          );
        })()}

      {tab === "Pass" && pass && (
        <div
          className="card"
          style={{ maxWidth: 420, textAlign: "center", margin: "0 auto" }}
        >
          <p className="muted" style={{ fontSize: 13 }}>
            Show this at the dining hall entrance
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              margin: "16px 0",
            }}
          >
            <QrCode value={pass.token} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 20,
            }}
          >
            {pass.name}
          </div>
          <div className="muted">{pass.studentNo}</div>
          <div style={{ marginTop: 12 }}>
            {pass.active ? (
              <span className="badge completed">{pass.plan} plan · active</span>
            ) : (
              <span className="badge overdue">No active plan</span>
            )}
          </div>
        </div>
      )}

      {tab === "Weekend orders" && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="card" style={{ flex: 2 }}>
            <p className="h1" style={{ fontSize: 16 }}>
              Weekend menu
            </p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {menu.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {m.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fileUrl(m.imageUrl)}
                            alt={m.name}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <div>
                          <strong>{m.name}</strong>
                          {m.description && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {m.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{xof(m.priceXof)}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={cart[m.id] ?? 0}
                        onChange={(e) =>
                          setCart({
                            ...cart,
                            [m.id]: Math.max(0, Number(e.target.value)),
                          })
                        }
                        style={{ width: 60 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="h1" style={{ fontSize: 16 }}>
              Checkout
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                margin: "12px 0",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              <span>Total</span>
              <span>{xof(cartTotal)}</span>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Create the order, then pay by Wave, Orange Money, or bank and
              upload proof.
            </p>
            <button
              className="primary"
              onClick={placeOrder}
              disabled={cartTotal === 0}
              style={{ width: "100%", marginTop: 8 }}
            >
              Create order
            </button>
            {selectedOrderId && paymentAmount > 0 && (
              <div style={{ marginTop: 14 }}>
                <ProofPaymentPanel
                  amountXof={paymentAmount}
                  attempt={selectedAttempt}
                  onStart={startOrderPayment}
                  onChangeMethod={changeOrderPayment}
                  onUploadProof={uploadOrderProof}
                />
              </div>
            )}
            <p className="h1" style={{ fontSize: 14, marginTop: 18 }}>
              My orders
            </p>
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
              <div
                key={o.id}
                style={{
                  borderTop: "1px solid var(--divider)",
                  padding: "8px 0",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span className={`badge ${STATUS_BADGE[o.status]}`}>
                    {o.status}
                  </span>
                  <strong>{xof(o.totalXof)}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </div>
                {o.status === "cart" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(o.id);
                      setSelectedOrderAmount(o.totalXof);
                    }}
                    style={{ marginTop: 7 }}
                  >
                    {attempts.some((attempt) => attempt.diningOrderId === o.id)
                      ? "Resume payment"
                      : "Pay order"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "My plan" && (
        <div className="row">
          {PLANS.map((p) => (
            <div
              key={p.type}
              className="card"
              style={{
                flex: 1,
                borderTop:
                  pass?.plan === p.type
                    ? "3px solid var(--daust-orange)"
                    : undefined,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {p.label}
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {p.note}
              </p>
              <button
                className={pass?.plan === p.type ? "" : "primary"}
                disabled={pass?.plan === p.type}
                onClick={() => chooseMealPlan(p.type).then(load)}
                style={{ marginTop: 12 }}
              >
                {pass?.plan === p.type ? "Current plan" : "Choose"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
