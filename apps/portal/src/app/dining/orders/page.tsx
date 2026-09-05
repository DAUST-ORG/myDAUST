"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AdminDiningOrder,
  advanceDiningOrder,
  cancelAdminDiningOrder,
  getAdminDiningOrders,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  cart: "warning",
  paid: "info",
  preparing: "warning",
  ready: "success",
  collected: "neutral",
  cancelled: "error",
};

/** Fulfilment only. Payment is verified by Finance; the console never moves money. */
const NEXT_STEP: Record<string, "preparing" | "ready" | "collected"> = {
  paid: "preparing",
  preparing: "ready",
  ready: "collected",
};

const STATUS_LABEL: Record<string, string> = {
  cart: "Awaiting payment",
  paid: "Paid",
  preparing: "Preparing",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
};

export default function DiningOrdersPage() {
  const [rows, setRows] = useState<AdminDiningOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminDiningOrders()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function advance(id: string, status: string) {
    setBusy(id);
    try {
      await advanceDiningOrder(id, status);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Staff cancel of an unpaid cart. Paid orders stay on the Finance refund path. */
  async function cancel(id: string) {
    setBusy(id);
    try {
      await cancelAdminDiningOrder(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Weekend Orders"
        subtitle={`${rows.length} orders, including unpaid carts`}
      />
      <Card pad={false}>
        {error ? (
          <EmptyState title="Could not load orders" note={error} />
        ) : !rows.length ? (
          <EmptyState
            title="No orders yet"
            note="Paid weekend orders arrive here for the kitchen to work through."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Items</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
                <th>Placed</th>
                <th style={{ textAlign: "right" }}>Advance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const next = NEXT_STEP[o.status];
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.student}</td>
                    <td style={{ color: "var(--fg3)" }}>
                      {o.items.join(" · ")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(o.totalXof)}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </td>
                    <td style={{ color: "var(--fg3)" }}>
                      {formatDate(o.createdAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {next ? (
                        <Button
                          size="sm"
                          disabled={busy === o.id}
                          onClick={() => advance(o.id, next)}
                        >
                          Mark {(STATUS_LABEL[next] ?? next).toLowerCase()}
                        </Button>
                      ) : o.status === "cart" ? (
                        <Button
                          size="sm"
                          disabled={busy === o.id}
                          onClick={() => cancel(o.id)}
                        >
                          Cancel cart
                        </Button>
                      ) : (
                        <span style={{ color: "var(--fg3)", fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
