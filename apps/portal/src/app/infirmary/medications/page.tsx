"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, Package } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Medication } from "../types";
import { Card, SearchInput, Badge, type BadgeTone } from "@/components/ui";

function emptyForm(): Medication {
  return {
    id: "", name: "", category: "", stock: 0, unit: "units", minStock: 0,
    expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    supplier: "", lastRestocked: new Date().toISOString().slice(0, 10), status: "In Stock",
  };
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86400000);
}

function deriveStatus(stock: number, minStock: number, expiryDate: string): Medication["status"] {
  if (expiryDate && daysUntil(expiryDate) < 0) return "Expired";
  if (stock <= 0) return "Out of Stock";
  if (stock <= minStock) return "Low Stock";
  return "In Stock";
}

function statusTone(s: Medication["status"]): BadgeTone {
  return s === "In Stock" ? "success" : s === "Low Stock" ? "warning" : "error";
}

function statusColor(s: Medication["status"]): string {
  return s === "In Stock" ? "var(--success-500)" : s === "Low Stock" ? "var(--daust-orange)" : "var(--danger-500)";
}

function stockPct(m: Pick<Medication, "stock" | "minStock">): number {
  const raw = Math.round((m.stock / Math.max(m.minStock * 2, 1)) * 100);
  return Math.min(100, Math.max(m.stock > 0 ? 5 : 0, raw));
}

const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" };

const fieldStyle: CSSProperties = {
  padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  fontSize: 13, color: "var(--fg1)", background: "var(--surface)", fontFamily: "inherit",
};

const thStyle: CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--fg3)",
  fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = { padding: "10px 14px" };

const sectionLabelStyle: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: "var(--fg3)",
  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6,
};

const boxStyle: CSSProperties = {
  padding: 12, background: "var(--bg-subtle)", border: "1px solid var(--divider)",
  borderRadius: "var(--radius-md)", fontSize: 13.5, lineHeight: 1.6,
};

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};

const modalStyle: CSSProperties = {
  background: "var(--surface)", borderRadius: "var(--radius-lg)", width: "100%",
  maxWidth: "90vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.22)",
};

const closeBtnStyle: CSSProperties = { border: "none", background: "none", cursor: "pointer", color: "var(--fg3)", padding: 4 };

const primaryBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: "var(--radius-pill)", border: "none", background: "var(--daust-orange)",
  color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const ghostBtnStyle: CSSProperties = {
  padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)",
  background: "transparent", color: "var(--fg2)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const navyBtnStyle: CSSProperties = {
  padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "none",
  background: "var(--daust-navy)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function actionBtn(color: string): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28,
    height: 28, borderRadius: "var(--radius-md)", border: "none", background: "transparent",
    color, cursor: "pointer", padding: 0,
  };
}

function pill(on: boolean): CSSProperties {
  return {
    padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)",
    background: on ? "var(--daust-navy)" : "transparent",
    color: on ? "#fff" : "var(--fg2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

function MetaTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg1)" }}>{children}</div>
    </div>
  );
}

function SectionBlock({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={accent ? { ...boxStyle, borderLeft: "3px solid var(--daust-orange)" } : boxStyle}>{children}</div>
    </div>
  );
}

function StockBar({ m, height = 6, width = 72 }: { m: Medication; height?: number; width?: number }) {
  return (
    <div style={{ width, height, borderRadius: "var(--radius-pill)", background: "var(--bg-tint)", overflow: "hidden", flexShrink: 0 }} aria-hidden>
      <div style={{ width: `${stockPct(m)}%`, height: "100%", borderRadius: "var(--radius-pill)", background: statusColor(m.status), transition: "width .2s ease" }} />
    </div>
  );
}

function ExpiryCell({ m }: { m: Medication }) {
  const d = daysUntil(m.expiryDate);
  const urgent = d <= 30;
  const color = d < 0 ? "var(--danger-500)" : "var(--daust-orange)";
  return (
    <td style={tdStyle}>
      <div style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", fontWeight: urgent ? 700 : 400, color: urgent ? color : "var(--fg2)" }}>
        {m.expiryDate}
      </div>
      {urgent && (
        <div style={{ fontSize: 11, fontWeight: 600, color }}>
          {d < 0 ? `Expired ${Math.abs(d)}d ago` : `Expires in ${d}d`}
        </div>
      )}
    </td>
  );
}

export default function MedicationsPage() {
  const { store, addMedication, updateMedication, deleteMedication } = useInfirmaryStore();
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [form, setForm] = useState<Medication>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const medications = store.medications;
  const categories = Array.from(new Set(medications.map((m) => m.category))).sort();
  const filters = ["All", ...categories];
  const lowerQ = q.toLowerCase();
  const filtered = medications.filter(
    (m) =>
      (categoryFilter === "All" || m.category === categoryFilter) &&
      (m.name.toLowerCase().includes(lowerQ) ||
        m.category.toLowerCase().includes(lowerQ) ||
        m.supplier.toLowerCase().includes(lowerQ) ||
        m.id.toLowerCase().includes(lowerQ)),
  );
  const detail = detailId ? medications.find((m) => m.id === detailId) ?? null : null;

  const countByStatus = (s: Medication["status"]) => medications.filter((m) => m.status === s).length;
  const stats = [
    { label: "Total Items", value: medications.length, color: "var(--fg1)" },
    { label: "In Stock", value: countByStatus("In Stock"), color: "var(--success-500)" },
    { label: "Low Stock", value: countByStatus("Low Stock"), color: "var(--daust-orange)" },
    { label: "Out of Stock", value: countByStatus("Out of Stock"), color: "var(--danger-500)" },
    { label: "Expired", value: countByStatus("Expired"), color: "var(--danger-500)" },
  ];

  function setField<K extends keyof Medication>(key: K, value: Medication[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(m: Medication) {
    setForm({ ...m });
    setEditing(m.id);
    setDetailId(null);
    setShowForm(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const data: Medication = {
      ...form,
      name: form.name.trim(),
      category: form.category.trim() || "General",
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      status: deriveStatus(Number(form.stock) || 0, Number(form.minStock) || 0, form.expiryDate),
    };
    if (editing) updateMedication(editing, data);
    else addMedication(data);
    setShowForm(false);
  }

  const detailDays = detail ? daysUntil(detail.expiryDate) : 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Medications</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Pharmacy inventory management</p>
        </div>
        <button onClick={openAdd} style={primaryBtnStyle}>
          <Plus size={15} /> Add Medication
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg3)" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search medications..." />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {filters.map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)} style={pill(categoryFilter === c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Name", "Category", "Stock", "Min Stock", "Expiry", "Supplier", "Last Restocked", "Status", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Package size={15} color="var(--daust-navy)" />
                      {m.name}
                    </div>
                  </td>
                  <td style={tdStyle}>{m.category}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StockBar m={m} />
                      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{m.stock}</span>
                      <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{m.unit}</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "var(--fg2)" }}>{m.minStock}</td>
                  <ExpiryCell m={m} />
                  <td style={tdStyle}>{m.supplier}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: "var(--fg2)" }}>{m.lastRestocked}</td>
                  <td style={tdStyle}><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button title="View details" onClick={() => setDetailId(m.id)} style={actionBtn("var(--daust-navy)")}>
                        <Eye size={15} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(m)} style={actionBtn("var(--fg2)")}>
                        <Pencil size={14} />
                      </button>
                      <button title="Delete" onClick={() => deleteMedication(m.id)} style={actionBtn("var(--danger-500)")}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>
                    No medications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <div onClick={() => setDetailId(null)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 540 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Medication {detail.id}</p>
                <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 800 }}>{detail.name}</h2>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>{detail.category}</p>
              </div>
              <button onClick={() => setDetailId(null)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={sectionLabelStyle}>Stock Level</div>
                <div style={boxStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <StockBar m={detail} height={10} width={150} />
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {detail.stock} {detail.unit}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--fg3)" }}>Minimum: {detail.minStock} {detail.unit}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5, color: statusColor(detail.status), fontWeight: 600 }}>
                    {detail.status === "In Stock" && "Healthy supply — well above the minimum threshold."}
                    {detail.status === "Low Stock" && "Running low — consider reordering soon."}
                    {detail.status === "Out of Stock" && "No units remaining — reorder immediately."}
                    {detail.status === "Expired" && "Batch expired — remove from inventory and dispose safely."}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                <MetaTile label="Category">{detail.category}</MetaTile>
                <MetaTile label="Unit">{detail.unit}</MetaTile>
                <MetaTile label="Last Restocked">{detail.lastRestocked}</MetaTile>
                <MetaTile label="Status"><Badge tone={statusTone(detail.status)}>{detail.status}</Badge></MetaTile>
              </div>

              <SectionBlock label="Supplier">{detail.supplier || "No supplier recorded."}</SectionBlock>

              <SectionBlock label="Expiry" accent={detailDays <= 30}>
                {detailDays < 0
                  ? `Expired ${Math.abs(detailDays)} day(s) ago on ${detail.expiryDate}. Remove from shelves and dispose safely.`
                  : detailDays <= 30
                    ? `Expires in ${detailDays} day(s) on ${detail.expiryDate}. Plan a reorder and use this batch first.`
                    : `Expires on ${detail.expiryDate}, ${detailDays} days from now.`}
              </SectionBlock>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => setDetailId(null)} style={ghostBtnStyle}>Close</button>
                <button onClick={() => openEdit(detail)} style={navyBtnStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Pencil size={13} /> Edit</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                {editing ? `Edit Medication ${editing}` : "Add Medication"}
              </h2>
              <button onClick={() => setShowForm(false)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                Medication Name
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Amoxicillin 500mg" style={fieldStyle} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Category
                  <input value={form.category} onChange={(e) => setField("category", e.target.value)} placeholder="e.g. Antibiotics" style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                  Unit
                  <input value={form.unit} onChange={(e) => setField("unit", e.target.value)} placeholder="tablets, capsules, tubes..." style={fieldStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Current Stock
                  <input type="number" min={0} value={form.stock} onChange={(e) => setField("stock", e.target.value === "" ? 0 : Number(e.target.value))} style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                  Minimum Stock
                  <input type="number" min={0} value={form.minStock} onChange={(e) => setField("minStock", e.target.value === "" ? 0 : Number(e.target.value))} style={fieldStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Expiry Date
                  <input type="date" value={form.expiryDate} onChange={(e) => setField("expiryDate", e.target.value)} style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                  Last Restocked
                  <input type="date" value={form.lastRestocked} onChange={(e) => setField("lastRestocked", e.target.value)} style={fieldStyle} />
                </label>
              </div>

              <label style={labelStyle}>
                Supplier
                <input value={form.supplier} onChange={(e) => setField("supplier", e.target.value)} placeholder="e.g. PharmaDakar" style={fieldStyle} />
              </label>

              <p style={{ margin: 0, fontSize: 12, color: "var(--fg3)", background: "var(--bg-subtle)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                Status is calculated automatically from stock level, minimum threshold and expiry date.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => setShowForm(false)} style={ghostBtnStyle}>Cancel</button>
                <button onClick={save} disabled={!form.name.trim()} style={{ ...navyBtnStyle, opacity: form.name.trim() ? 1 : 0.5 }}>
                  {editing ? "Save Changes" : "Add Medication"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
