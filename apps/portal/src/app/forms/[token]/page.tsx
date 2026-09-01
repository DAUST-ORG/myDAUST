"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui";
import { getPublicForm, submitPublicForm, type FormDetail } from "@/lib/api";
import FormRenderer from "@/components/forms/FormRenderer";

export default function PublicFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [form, setForm] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getPublicForm(token)
      .then(setForm)
      .catch((e) => setError(e instanceof Error ? e.message : "Form not found"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !email.trim()) {
      setSubmitError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitPublicForm(token, {
        respondentName: name.trim(),
        respondentEmail: email.trim(),
        answers: Object.entries(answers).map(([fieldId, value]) => ({
          fieldId,
          value,
        })),
      });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [token, name, email, answers]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg3)" }}>
        Loading form...
      </div>
    );
  }

  if (error || !form) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 20, color: "var(--danger)" }}>Form Unavailable</h2>
          <p style={{ color: "var(--fg3)", marginTop: 8 }}>{error ?? "This form could not be found."}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ fontSize: 20, color: "var(--daust-navy)" }}>Thank You!</h2>
          <p style={{ color: "var(--fg3)", marginTop: 8 }}>
            Your response to "{form.title}" has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-2)",
        padding: "40px 16",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            background: "var(--bg)",
            borderRadius: 12,
            padding: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {/* Identity fields */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--daust-navy)" }}>
              Your Information
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />

          <FormRenderer
            form={form}
            answers={answers}
            onChange={setAnswers}
          />

          {submitError && (
            <div
              style={{
                color: "var(--danger)",
                background: "#f8d7da",
                padding: 10,
                borderRadius: 6,
                marginTop: 16,
                fontSize: 13,
              }}
            >
              {submitError}
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: "right" }}>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Response"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--fg3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};
