"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import {
  type DiningOrder,
  type DiningEligibility,
  type DiningToday,
  type DiningPass,
  type MenuItem,
  type PaymentSubmissionSummary,
  type ProofPaymentMethod,
  changeResumablePaymentMethod,
  chooseMealPlan,
  createDiningOrder,
  fileUrl,
  getDiningPass,
  getDiningEligibility,
  getDiningToday,
  getMenu,
  getMyDiningOrders,
  listMyPaymentAttempts,
  payDiningOrder,
  submitResumablePaymentProof,
} from "@/lib/api";
import { PageHeader, Segmented } from "@/components/ui";
import { ProofPaymentPanel } from "@/components/ProofPaymentPanel";

const TABS = ["Home", "Pass", "Weekend orders", "My plan"] as const;
type Tab = (typeof TABS)[number];
const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

const PERIODS = ["breakfast", "lunch", "dinner"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/** Shipped defaults; replaced by the dining office's configured windows once loaded. */
const FALLBACK_WINDOWS: Record<Period, { start: string; end: string }> = {
  breakfast: { start: "07:00", end: "09:00" },
  lunch: { start: "12:00", end: "14:00" },
  dinner: { start: "19:00", end: "21:00" },
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function buildMeals(
  windows: Record<Period, { start: string; end: string }> = FALLBACK_WINDOWS,
) {
  return PERIODS.map((key) => {
    const w = windows[key] ?? FALLBACK_WINDOWS[key];
    return {
      key,
      label: PERIOD_LABELS[key],
      window: `${w.start} \u2013 ${w.end}`,
      startMin: minutes(w.start),
      endMin: minutes(w.end),
    };
  });
}

type Meal = ReturnType<typeof buildMeals>[number];

/**
 * The meal to lead with: the one being served right now, else the next one to open.
 * Picking purely on start time — as this did before — makes a lunch being served at 12:30
 * read "Upcoming", which is the opposite of what the student needs at 12:30.
 */
function nextMeal(meals: Meal[], now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const open = meals.find((m) => t >= m.startMin && t < m.endMin);
  if (open) return { ...open, tomorrow: false, openNow: true };
  const ahead = meals.find((m) => t < m.startMin);
  return ahead
    ? { ...ahead, tomorrow: false, openNow: false }
    : { ...meals[0]!, tomorrow: true, openNow: false };
}

/** Which period the entrance would check for right now. */
function currentPeriod(now = new Date()) {
  const h = now.getHours();
  if (h < 11) return "breakfast";
  if (h < 17) return "lunch";
  return "dinner";
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
  const [eligibility, setEligibility] = useState<DiningEligibility | null>(
    null,
  );
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
    getDiningEligibility(currentPeriod())
      .then(setEligibility)
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
          const meals = buildMeals(today?.mealWindows);
          const next = nextMeal(meals);
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
                    {next.openNow
                      ? "Serving now"
                      : `Next meal${next.tomorrow ? " · tomorrow" : ""}`}
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
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {next.openNow && (
                      <span className="badge partial">Open now</span>
                    )}
                    {pass?.active ? (
                      <span className="badge completed">
                        {pass.plan} plan · active
                      </span>
                    ) : (
                      <span className="badge overdue">No active plan</span>
                    )}
                  </div>
                  {/* The same verdict the entrance will produce, so nobody is
                      surprised at the door. */}
                  {eligibility && (
                    <p
                      className="muted"
                      style={{
                        fontSize: 12,
                        marginTop: 10,
                        color: eligibility.serve
                          ? "var(--success)"
                          : "var(--danger)",
                      }}
                    >
                      At the entrance: {eligibility.reason}
                    </p>
                  )}
                </div>
                <div className="card" style={{ flex: 3 }}>
                  <p className="h1" style={{ fontSize: 15, marginBottom: 8 }}>
                    Today&rsquo;s meals
                  </p>
                  {meals.map((m) => {
                    const done = served.has(m.key);
                    const nowMin =
                      new Date().getHours() * 60 + new Date().getMinutes();
                    const openNow = nowMin >= m.startMin && nowMin < m.endMin;
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
                        ) : openNow ? (
                          <span className="badge partial">Open now</span>
                        ) : isNext ? (
                          <span className="badge partial">Up next</span>
                        ) : nowMin >= m.endMin ? (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Closed
                          </span>
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
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Choosing a plan sets which meals your pass covers. Billing is
            handled by the Finance office — cafeteria is charged with tuition
            and housing.
          </p>
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
        </>
      )}
    </>
  );
}
