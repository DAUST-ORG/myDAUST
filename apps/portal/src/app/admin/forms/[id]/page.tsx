"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader, Button, Badge, Tabs } from "@/components/ui";
import {
  getFormDetail,
  listFormResponses,
  closeForm,
  deleteForm,
  exportFormCsv,
  type FormDetail,
  type FormResponseRow,
  type FormInputSection,
} from "@/lib/api";
import FormBuilder from "@/components/forms/FormBuilder";

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  draft: "warning",
  published: "success",
  closed: "neutral",
};

export default function FormEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [form, setForm] = useState<FormDetail | null>(null);
  const [responses, setResponses] = useState<FormResponseRow[]>([]);
  const [tab, setTab] = useState<string>("builder");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, resps] = await Promise.all([
        getFormDetail(id),
        listFormResponses(id),
      ]);
      setForm(f);
      setResponses(resps);
      if (f.status !== "draft") setTab("responses");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClose = useCallback(async () => {
    if (!confirm("Close this form? No more responses will be accepted.")) return;
    try {
      await closeForm(id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close");
    }
  }, [id, load]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this draft form? This cannot be undone.")) return;
    try {
      await deleteForm(id);
      router.push("/admin/forms");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }, [id, router]);

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: "var(--danger)" }}>{error}</div>;
  if (!form) return <div style={{ padding: 24 }}>Form not found.</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16" }}>
      <PageHeader
        title={form.title}
        subtitle={
          <span>
            <Badge tone={STATUS_TONE[form.status] ?? "neutral"}>
              {form.status}
            </Badge>
            <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 13 }}>
              {form.responseCount} response{form.responseCount !== 1 ? "s" : ""}
            </span>
          </span>
        }
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {form.status === "published" && (
              <Button onClick={handleClose} variant="danger">
                Close Form
              </Button>
            )}
            {form.status === "draft" && (
              <Button onClick={handleDelete} variant="danger">
                Delete
              </Button>
            )}
            {form.status === "published" && (
              <Button onClick={() => window.open(exportFormCsv(id), "_blank")}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        tabs={[
          { value: "builder", label: "Builder" },
          { value: "responses", label: `Responses (${form.responseCount})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "builder" && (
        <EditBuilder form={form} onSaved={() => void load()} />
      )}

      {tab === "responses" && (
        <ResponseTable form={form} responses={responses} />
      )}
    </div>
  );
}

function EditBuilder({
  form,
  onSaved,
}: {
  form: FormDetail;
  onSaved: () => void;
}) {
  const [sections, setSections] = useState<FormInputSection[]>(
    form.sections.map((s) => ({
      title: s.title,
      sortOrder: s.sortOrder,
      conditionJson: s.conditionJson ?? undefined,
      fields: s.fields.map((f) => ({
        type: f.type,
        label: f.label,
        required: f.required,
        sortOrder: f.sortOrder,
        optionsJson: f.optionsJson ?? undefined,
        conditionJson: f.conditionJson ?? undefined,
      })),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const { updateForm } = await import("@/lib/api");
      await updateForm(form.id, {
        title: form.title,
        description: form.description ?? undefined,
        requiresAuth: form.requiresAuth,
        closesAt: form.closesAt ?? undefined,
        maxResponses: form.maxResponses ?? undefined,
        sections,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [form, sections, onSaved]);

  return (
    <div>
      {error && (
        <div style={{ color: "var(--danger)", background: "#f8d7da", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}
      {form.status === "draft" && (
        <div style={{ marginBottom: 12, textAlign: "right" }}>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
      <FormBuilder
        sections={sections}
        onChange={form.status === "draft" ? setSections : () => {}}
      />
    </div>
  );
}

function ResponseTable({
  form,
  responses,
}: {
  form: FormDetail;
  responses: FormResponseRow[];
}) {
  const fields = form.sections.flatMap((s) => s.fields);

  if (responses.length === 0) {
    return (
      <p style={{ color: "var(--muted)", padding: 24, textAlign: "center" }}>
        No responses yet.
      </p>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Respondent</th>
            <th style={thStyle}>Submitted</th>
            {fields.map((f) => (
              <th key={f.id} style={thStyle}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {responses.map((r, i) => {
            const answerMap = new Map(r.answers.map((a) => [a.fieldId, a.value]));
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={tdStyle}>
                  {r.respondentName ?? r.personId ?? "Anonymous"}
                  {r.respondentEmail && (
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>{r.respondentEmail}</div>
                  )}
                </td>
                <td style={tdStyle}>{new Date(r.submittedAt).toLocaleString()}</td>
                {fields.map((f) => (
                  <td key={f.id} style={tdStyle}>{formatValue(answerMap.get(f.id))}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "\u2014";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "top",
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
