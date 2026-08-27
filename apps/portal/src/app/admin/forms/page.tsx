"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Button, Badge, EmptyState } from "@/components/ui";
import { listForms, type FormListItem } from "@/lib/api";
import { Plus } from "lucide-react";

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  draft: "warning",
  published: "success",
  closed: "neutral",
};

export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await listForms();
      setForms(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16" }}>
      <PageHeader
        title="Custom Forms"
        subtitle="Create, publish, and manage custom forms"
        actions={
          <Button onClick={() => router.push("/admin/forms/new")}>
            <Plus size={16} /> New Form
          </Button>
        }
      />
      {loading && <p style={{ color: "var(--muted)" }}>Loading...</p>}
      {!loading && forms.length === 0 && (
        <EmptyState
          title="No forms yet"
          note="Create your first form to start collecting responses."
        />
      )}
      {!loading && forms.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Responses</th>
                <th style={thStyle}>Deadline</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr
                  key={f.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{f.title}</div>
                    {f.description && (
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        {f.description.slice(0, 80)}
                        {f.description.length > 80 ? "..." : ""}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>
                      {f.status}
                    </Badge>
                  </td>
                  <td style={tdStyle}>
                    {f.responseCount}
                    {f.maxResponses ? ` / ${f.maxResponses}` : ""}
                  </td>
                  <td style={tdStyle}>
                    {f.closesAt
                      ? new Date(f.closesAt).toLocaleDateString()
                      : "None"}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {f.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/forms/${f.id}`)
                          }
                        >
                          Edit
                        </Button>
                      )}
                      {(f.status === "published" || f.status === "closed") && (
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/forms/${f.id}`)
                          }
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "top",
};
