"use client";

import { useState, type CSSProperties } from "react";
import {
  Check,
  Building2,
  CalendarClock,
  SlidersHorizontal,
} from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { AppSettings } from "../types";
import { Card } from "@/components/ui";

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--fg2)",
};

const fieldStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  fontSize: 13,
  color: "var(--fg1)",
  background: "var(--surface)",
  fontFamily: "inherit",
  width: "100%",
};

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: checked ? "var(--success-500)" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        transition: "background .18s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          transition: "left .18s ease",
        }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { store, updateSettings, loading, error } = useInfirmaryStore();


  const [form, setForm] = useState<AppSettings>(() => ({ ...store.settings }));
  const [saved, setSaved] = useState(false);

  if (loading) {
    return <div className="loading-state">Loading…</div>;
  }
  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load data.</p>
        <p>{error}</p>
      </div>
    );
  }

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateSettings(form);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const cardHeader = (icon: React.ReactNode, title: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-tint)",
          color: "var(--daust-navy)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>{title}</h3>
    </div>
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Settings</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
            Clinic configuration and preferences
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {saveError && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--danger-500)",
              }}
            >
              {saveError}
            </div>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 20px",
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: saved ? "var(--success-500)" : "var(--daust-navy)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.6 : 1,
              transition: "background .15s ease",
            }}
          >
            {saved ? (
              <>
                <Check size={15} /> Saved!
              </>
            ) : saving ? (
              "Saving…"
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 680,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Card title={cardHeader(<Building2 size={16} />, "Clinic Information")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={labelStyle}>
              Clinic Name
              <input
                value={form.clinicName}
                onChange={(e) => set("clinicName", e.target.value)}
                placeholder="e.g. DAUST Health Center"
                style={fieldStyle}
              />
            </label>
            <label style={labelStyle}>
              Address
              <input
                value={form.clinicAddress}
                onChange={(e) => set("clinicAddress", e.target.value)}
                placeholder="Street, city, country"
                style={fieldStyle}
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={labelStyle}>
                Phone
                <input
                  type="tel"
                  value={form.clinicPhone}
                  onChange={(e) => set("clinicPhone", e.target.value)}
                  placeholder="+221 ..."
                  style={fieldStyle}
                />
              </label>
              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  value={form.clinicEmail}
                  onChange={(e) => set("clinicEmail", e.target.value)}
                  placeholder="health@daust.sn"
                  style={fieldStyle}
                />
              </label>
            </div>
          </div>
        </Card>

        <Card title={cardHeader(<CalendarClock size={16} />, "Schedule")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={labelStyle}>
                Working Hours Start
                <input
                  type="time"
                  value={form.workingHoursStart}
                  onChange={(e) => set("workingHoursStart", e.target.value)}
                  style={fieldStyle}
                />
              </label>
              <label style={labelStyle}>
                Working Hours End
                <input
                  type="time"
                  value={form.workingHoursEnd}
                  onChange={(e) => set("workingHoursEnd", e.target.value)}
                  style={fieldStyle}
                />
              </label>
            </div>
            <label style={labelStyle}>
              Appointment Duration (minutes)
              <input
                type="number"
                min={5}
                step={5}
                value={form.appointmentDuration}
                onChange={(e) =>
                  set(
                    "appointmentDuration",
                    e.target.value === "" ? 0 : Number(e.target.value),
                  )
                }
                style={fieldStyle}
              />
              <span
                style={{ fontSize: 11.5, fontWeight: 400, color: "var(--fg3)" }}
              >
                Length of each appointment slot used when scheduling student
                visits.
              </span>
            </label>
          </div>
        </Card>

        <Card
          title={cardHeader(<SlidersHorizontal size={16} />, "Preferences")}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                padding: "14px 0",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  Notifications
                </div>
                <div
                  style={{ fontSize: 12.5, color: "var(--fg3)", marginTop: 2 }}
                >
                  Alert staff about upcoming appointments and low-stock
                  medication.
                </div>
              </div>
              <Switch
                checked={form.notificationsEnabled}
                onChange={(v) => set("notificationsEnabled", v)}
              />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
