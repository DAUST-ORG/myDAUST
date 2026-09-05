"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustDiningInventory,
  createDiningInventoryItem,
  getDiningInventory,
  toggleDiningInventory,
  type DiningInventoryRow,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SearchInput,
} from "@/components/ui";

export default function DiningInventoryPage() {
  const [rows, setRows] = useState<DiningInventoryRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [reorder, setReorder] = useState("");
  const [cost, setCost] = useState("");

  const load = useCallback(() => {
    getDiningInventory()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? rows.filter((r) => r.name.toLowerCase().includes(needle))
      : rows;
  }, [rows, q]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!name.trim()) return;
    await run("new", () =>
      createDiningInventoryItem({
        name: name.trim(),
        unit: unit.trim() || "pcs",
        reorderLevel: Number(reorder) || 0,
        costPerUnitXof: Math.max(0, Math.round(Number(cost) || 0)),
      }),
    );
    setName("");
    setUnit("pcs");
    setReorder("");
    setCost("");
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Inventory"
        subtitle={`${rows.length} stocked items · ledger is append-only`}
      />
      {error && (
        <Card>
          <EmptyState title="Something went wrong" note={error} />
        </Card>
      )}
      <Card>
        <p className="h1" style={{ fontSize: 15, marginBottom: 10 }}>
          New item
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <Input value={name} onChange={setName} placeholder="Rice" />
          <Input value={unit} onChange={setUnit} placeholder="kg" />
          <Input
            value={reorder}
            onChange={setReorder}
            placeholder="Reorder at"
            inputMode="decimal"
          />
          <Input
            value={cost}
            onChange={setCost}
            placeholder="Cost/unit XOF"
            inputMode="numeric"
          />
          <Button
            variant="primary"
            disabled={busy === "new" || !name.trim()}
            onClick={() => void create()}
          >
            Add item
          </Button>
        </div>
      </Card>
      <div style={{ height: 16 }} />
      <div style={{ marginBottom: 16, maxWidth: 340 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Filter items…" />
      </div>
      <Card pad={false}>
        {!filtered.length ? (
          <EmptyState
            title={rows.length ? "No match" : "No inventory yet"}
            note={
              rows.length
                ? "Try a different name."
                : "Add the first stocked item above."
            }
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>On hand</th>
                <th style={{ textAlign: "right" }}>Reorder at</th>
                <th style={{ textAlign: "right" }}>Unit value</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Adjust</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const low = r.qtyOnHand <= r.reorderLevel;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {r.qtyOnHand.toLocaleString("en-US")} {r.unit}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.reorderLevel.toLocaleString("en-US")} {r.unit}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(r.costPerUnitXof)}
                    </td>
                    <td>
                      {!r.active ? (
                        <Badge tone="neutral">Off</Badge>
                      ) : low ? (
                        <Badge tone="warning">Low stock</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <Input
                          value={delta[r.id] ?? ""}
                          onChange={(v) =>
                            setDelta((d) => ({ ...d, [r.id]: v }))
                          }
                          placeholder="+10 / -2"
                          width={86}
                          inputMode="decimal"
                        />
                        <Input
                          value={reason[r.id] ?? ""}
                          onChange={(v) =>
                            setReason((d) => ({ ...d, [r.id]: v }))
                          }
                          placeholder="Reason"
                          width={150}
                        />
                        <Button
                          size="sm"
                          disabled={
                            busy === r.id ||
                            !delta[r.id] ||
                            Number(delta[r.id]) === 0 ||
                            !(reason[r.id] ?? "").trim()
                          }
                          onClick={() =>
                            void run(r.id, () =>
                              adjustDiningInventory(r.id, {
                                delta: Number(delta[r.id]),
                                reason: (reason[r.id] ?? "").trim(),
                              }),
                            )
                          }
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === r.id}
                          onClick={() =>
                            void run(r.id, () => toggleDiningInventory(r.id))
                          }
                        >
                          {r.active ? "Hide" : "Show"}
                        </Button>
                      </div>
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
