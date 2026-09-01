"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Button } from "@/components/ui";
import {
  createForm,
  type FormInputSection,
  type FormInputField,
} from "@/lib/api";
import FormBuilder from "@/components/forms/FormBuilder";

/**
 * A Next.js App Router page may only receive { params, searchParams }; a custom prop type
 * makes `next build` reject the default export, which is what broke the staging image.
 * This page took an `initialData` prop that nothing ever passed -- the edit screen at
 * admin/forms/[id] has its own implementation -- so every branch guarded by it was dead.
 * Removed rather than plumbed through, which keeps behaviour identical.
 */
export default function NewFormPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [closesAt, setClosesAt] = useState("");
  const [maxResponses, setMaxResponses] = useState("");
  const [sections, setSections] = useState<FormInputSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const buildPayload = useCallback(
    () => ({
      title: title.trim(),
      description: description.trim() || undefined,
      requiresAuth,
      closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
      maxResponses: maxResponses ? parseInt(maxResponses, 10) : undefined,
      sections,
    }),
    [title, description, requiresAuth, closesAt, maxResponses, sections],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createForm(buildPayload());
      router.replace(`/admin/forms/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [buildPayload, router]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16" }}>
      <PageHeader
        title="New Form"
        subtitle="Build your form with sections and fields"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving..." : "Save Draft"}
            </Button>
          </div>
        }
      />

      {error && (
        <div
          style={{
            color: "var(--danger)",
            background: "#f8d7da",
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Form title"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Settings</label>
          <Button onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? "Hide" : "Show"} Settings
          </Button>
        </div>
      </div>

      {showSettings && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description (50 words max)"
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
          <div>
            <label style={labelStyle}>Auth required</label>
            <select
              value={requiresAuth ? "true" : "false"}
              onChange={(e) => setRequiresAuth(e.target.value === "true")}
              style={inputStyle}
            >
              <option value="true">Yes (login required)</option>
              <option value="false">No (public link)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Deadline</label>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Max responses</label>
            <input
              type="number"
              value={maxResponses}
              onChange={(e) => setMaxResponses(e.target.value)}
              placeholder="Unlimited"
              min={1}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <FormBuilder sections={sections} onChange={setSections} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--fg3)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};
