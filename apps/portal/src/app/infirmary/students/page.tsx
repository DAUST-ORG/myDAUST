"use client";

import { useState, useMemo } from "react";
import {
  X,
  Eye,
  Mail,
  Phone,
  Heart,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  Activity,
} from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Student } from "../types";
import { Card, SearchInput, Badge } from "@/components/ui";

const badge = (status: string) => (
  <Badge
    tone={
      status === "Active"
        ? "success"
        : status === "Follow-up"
          ? "warning"
          : "neutral"
    }
  >
    {status}
  </Badge>
);

export default function StudentsPage() {
  const { store, loading, error } = useInfirmaryStore();

  if (loading) {
    return <div className="loading-state">Loading…</div>;
  }
  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load students.</p>
        <p>{error}</p>
      </div>
    );
  }

  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = store.students.filter(
    (s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.program.toLowerCase().includes(q.toLowerCase()) ||
      s.id.toLowerCase().includes(q.toLowerCase()),
  );

  const detail = detailId
    ? (store.students.find((s) => s.id === detailId) ?? null)
    : null;

  const detailStats = useMemo(() => {
    if (!detail) return null;
    const visits = store.consultations.filter(
      (c) => c.studentId === detail.id,
    ).length;
    const rxActive = store.prescriptions.filter(
      (p) => p.studentId === detail.id && p.status === "Active",
    ).length;
    const docs = store.documents.filter(
      (d) => d.studentId === detail.id,
    ).length;
    const fus = store.followUps.filter((f) => f.studentId === detail.id).length;
    const recent = store.consultations
      .filter((c) => c.studentId === detail.id)
      .slice(0, 5);
    return {
      consultations: visits,
      prescriptions: rxActive,
      documents: docs,
      followUps: fus,
      recentConsultations: recent,
    };
  }, [
    detail,
    store.consultations,
    store.prescriptions,
    store.documents,
    store.followUps,
  ]);

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
          <h1 className="page-title">Students</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
            Student health records and profiles — managed by the registrar.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {[
          {
            label: "Total Students",
            value: store.students.length,
            color: "var(--daust-navy)",
          },
          {
            label: "Active",
            value: store.students.filter((s) => s.status === "Active").length,
            color: "var(--success-500)",
          },
          {
            label: "Follow-up",
            value: store.students.filter((s) => s.status === "Follow-up")
              .length,
            color: "var(--daust-orange)",
          },
          {
            label: "With Allergies",
            value: store.students.filter((s) => s.allergies.length > 0).length,
            color: "#c0392b",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--fg3)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 4,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 800,
                color: stat.color,
              }}
            >
              {stat.value}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search by name, program, or ID..."
        />
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  "Student",
                  "Program",
                  "Year",
                  "Status",
                  "Last Visit",
                  "Allergies",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      fontWeight: 600,
                      color: "var(--fg3)",
                      fontSize: 11.5,
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  style={{ borderBottom: "1px solid var(--divider)" }}
                >
                  <td style={{ padding: "10px 14px" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          background: "var(--daust-navy)",
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 12,
                          flexShrink: 0,
                        }}
                      >
                        {s.initials}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {s.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>{s.program}</td>
                  <td style={{ padding: "10px 14px" }}>{s.year}</td>
                  <td style={{ padding: "10px 14px" }}>{badge(s.status)}</td>
                  <td
                    style={{
                      padding: "10px 14px",
                      fontSize: 12.5,
                      color: "var(--fg2)",
                    }}
                  >
                    {s.lastVisit}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>
                    {s.allergies.length > 0 ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          color: "#c0392b",
                          fontWeight: 600,
                        }}
                      >
                        <AlertTriangle size={12} /> {s.allergies.join(", ")}
                      </span>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <button
                      onClick={() => setDetailId(s.id)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: "var(--daust-navy)",
                        padding: 4,
                      }}
                      title="View profile"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "var(--fg3)",
                    }}
                  >
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && detailStats && (
        <div
          onClick={() => setDetailId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 500,
              maxWidth: "90vw",
              height: "100%",
              background: "var(--surface)",
              boxShadow: "-4px 0 20px rgba(0,0,0,.15)",
              overflowY: "auto",
              padding: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Student Profile
              </h2>
              <button
                onClick={() => setDetailId(null)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "var(--fg3)",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 24,
                paddingBottom: 20,
                borderBottom: "1px solid var(--divider)",
              }}
            >
              <span
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--daust-orange)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                {detail.initials}
              </span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {detail.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  {badge(detail.status)}
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {detail.program} · {detail.year}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 20,
              }}
            >
              {[
                {
                  label: "Email",
                  value: detail.email,
                  icon: <Mail size={13} />,
                },
                {
                  label: "Phone",
                  value: detail.phone,
                  icon: <Phone size={13} />,
                },
                {
                  label: "Date of Birth",
                  value: detail.dateOfBirth,
                  icon: <Calendar size={13} />,
                },
                {
                  label: "Gender",
                  value: detail.gender,
                  icon: <User size={13} />,
                },
                {
                  label: "Blood Type",
                  value: detail.bloodType || "—",
                  icon: <Heart size={13} />,
                },
                {
                  label: "Height",
                  value: detail.height || "—",
                  icon: <Activity size={13} />,
                },
                {
                  label: "Weight",
                  value: detail.weight || "—",
                  icon: <Activity size={13} />,
                },
                {
                  label: "Last Visit",
                  value: detail.lastVisit,
                  icon: <Calendar size={13} />,
                },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "var(--fg3)",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      marginBottom: 3,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {item.icon} {item.label}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {detail.emergencyContact && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--daust-orange)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 8,
                  }}
                >
                  Emergency Contact
                </div>
                <div
                  style={{
                    padding: 12,
                    background: "var(--bg-subtle)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {detail.emergencyContact}
                  </div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {detail.emergencyPhone}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#c0392b",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <AlertTriangle size={13} /> Allergies
              </div>
              {detail.allergies.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {detail.allergies.map((a) => (
                    <div
                      key={a}
                      style={{
                        padding: "8px 12px",
                        background: "#fbe6e3",
                        borderLeft: "3px solid #c0392b",
                        borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#c0392b",
                      }}
                    >
                      {a}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--fg3)" }}>
                  None reported
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--daust-navy)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <FileText size={13} /> Medical History
              </div>
              {detail.medicalHistory && detail.medicalHistory.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {detail.medicalHistory.map((h) => (
                    <div
                      key={h}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg-tint)",
                        borderLeft: "3px solid var(--daust-navy)",
                        borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--fg3)" }}>
                  No recorded history
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--fg3)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 10,
              }}
            >
              Quick Stats
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                {
                  label: "Visits",
                  value: detailStats.consultations,
                  color: "var(--daust-navy)",
                },
                {
                  label: "Rx Active",
                  value: detailStats.prescriptions,
                  color: "var(--daust-orange)",
                },
                {
                  label: "Documents",
                  value: detailStats.documents,
                  color: "var(--success-500)",
                },
                {
                  label: "Follow-ups",
                  value: detailStats.followUps,
                  color: detailStats.followUps > 0 ? "#c0392b" : "var(--fg3)",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: 10,
                    background: "var(--bg-subtle)",
                    borderRadius: "var(--radius-md)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      fontWeight: 800,
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--fg3)",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {detailStats.recentConsultations.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 10,
                  }}
                >
                  Recent Consultations
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {detailStats.recentConsultations.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: 10,
                        background: "var(--bg-subtle)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          alignSelf: "stretch",
                          minHeight: 30,
                          borderRadius: 2,
                          background:
                            c.status === "Completed"
                              ? "var(--success-500)"
                              : c.status === "In Progress"
                                ? "var(--daust-orange)"
                                : "var(--gray-300)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {c.reason}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {c.date} · {c.time}
                        </div>
                      </div>
                      <Badge
                        tone={
                          c.status === "Completed"
                            ? "success"
                            : c.status === "In Progress"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.concern && (
              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 6,
                  }}
                >
                  Current Concern
                </div>
                <div
                  style={{
                    padding: 12,
                    background: "var(--bg-subtle)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                  }}
                >
                  {detail.concern}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
