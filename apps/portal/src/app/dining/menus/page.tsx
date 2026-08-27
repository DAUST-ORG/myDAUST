"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  type MenuItem,
  createMenuItem,
  getAdminMenu,
  toggleMenuItem,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Toggle,
} from "@/components/ui";

const CATEGORIES = [
  { value: "weekend", label: "Weekend" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

export default function DiningMenusPage() {
  const [rows, setRows] = useState<MenuItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("weekend");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    getAdminMenu()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save() {
    const priceXof = Number(price);
    if (!name.trim() || !Number.isInteger(priceXof) || priceXof < 0) {
      setError("A dish needs a name and a whole-franc price.");
      return;
    }
    setSaving(true);
    try {
      await createMenuItem({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        priceXof,
      });
      setOpen(false);
      setName("");
      setDescription("");
      setPrice("");
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Menus"
        subtitle={`${rows.filter((r) => r.available).length} of ${rows.length} dishes on offer`}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => setOpen(true)}
          >
            Add dish
          </Button>
        }
      />

      <Card pad={false}>
        {!rows.length ? (
          <EmptyState
            title="No dishes yet"
            note="Add the weekend menu so students can order."
            action={<Button onClick={() => setOpen(true)}>Add dish</Button>}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dish</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>On offer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.description && (
                      <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                        {m.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge tone="navy">{m.category}</Badge>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatXof(m.priceXof)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Toggle
                      checked={m.available}
                      onChange={async () => {
                        await toggleMenuItem(m.id);
                        load();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={open}
        title="Add a dish"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={saving} onClick={save}>
              Save dish
            </Button>
          </>
        }
      >
        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
        )}
        <Field label="Name">
          <Input value={name} onChange={setName} placeholder="Thiéboudienne" />
        </Field>
        <Field label="Description" hint="Optional">
          <Input
            value={description}
            onChange={setDescription}
            placeholder="Rice, fish and vegetables"
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
          />
        </Field>
        <Field label="Price (XOF)">
          <Input value={price} onChange={setPrice} placeholder="2500" />
        </Field>
      </Modal>
    </>
  );
}
