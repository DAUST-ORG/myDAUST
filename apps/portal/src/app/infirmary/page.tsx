"use client";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock,
  Pill,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useInfirmaryStore } from "./store";
import { Card, Stat } from "@/components/ui";

export default function InfirmaryDashboard() {
  const { store, loading, error } = useInfirmaryStore();

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

  const today = new Date().toISOString().slice(0, 10);

  const activeStudents = store.students.filter(
    (s) => s.status === "Active" || s.status === "Follow-up",
  ).length;
  const todayConsultations = store.consultations.filter(
    (c) => c.date === today,
  ).length;
  const activePrescriptions = store.prescriptions.filter(
    (p) => p.status === "Active",
  ).length;
  const todayAppointments = store.appointments.filter(
    (a) => a.date === today,
  ).length;
  const pendingFollowUps = store.followUps.filter(
    (f) => f.status === "Pending" || f.status === "Overdue",
  ).length;
  const lowStockMeds = store.medications.filter(
    (m) => m.status === "Low Stock" || m.status === "Out of Stock",
  ).length;

  const recentConsultations = store.consultations.slice(0, 4);
  const upcomingAppointments = store.appointments
    .filter((a) => a.status === "Scheduled" || a.status === "Checked In")
    .slice(0, 5);

  return (
    <>
      <p className="eyebrow">Health Center</p>
      <h1 className="page-title">Infirmary Dashboard</h1>
      <p
        className="muted"
        style={{ marginBottom: 22, fontSize: 14.5, maxWidth: "64ch" }}
      >
        Overview of clinical activity, student health, and pharmacy status.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Stat
          label="Active students"
          value={activeStudents}
          sub={`${store.students.length} total registered`}
          tone="var(--daust-navy)"
          icon={<Users size={15} />}
        />
        <Stat
          label="Today's visits"
          value={todayConsultations}
          sub="Consultations today"
          tone="var(--success-500)"
          icon={<Stethoscope size={15} />}
        />
        <Stat
          label="Active prescriptions"
          value={activePrescriptions}
          sub="Ongoing medication orders"
          tone="var(--daust-navy-700)"
          icon={<Pill size={15} />}
        />
        <Stat
          label="Upcoming appointments"
          value={todayAppointments}
          sub="Scheduled for today"
          tone="var(--daust-orange)"
          icon={<CalendarDays size={15} />}
        />
        <Stat
          label="Pending follow-ups"
          value={pendingFollowUps}
          sub={`${store.followUps.filter((f) => f.status === "Overdue").length} overdue`}
          tone={
            store.followUps.filter((f) => f.status === "Overdue").length > 0
              ? "#c0392b"
              : undefined
          }
          icon={<Clock size={15} />}
        />
        <Stat
          label="Low-stock meds"
          value={lowStockMeds}
          sub="Requires restocking"
          tone={
            lowStockMeds > 0 ? "var(--daust-orange)" : "var(--success-500)"
          }
          icon={<AlertTriangle size={15} />}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 16,
          alignItems: "start",
        }}
      >
        <Card
          title="Recent consultations"
          action={
            <a
              href="/infirmary/consultations"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              View all
            </a>
          }
        >
          {recentConsultations.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              No recent consultations.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {recentConsultations.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      alignSelf: "stretch",
                      minHeight: 36,
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
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {c.studentName}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {c.reason} · {c.time}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: "var(--radius-pill)",
                      fontSize: 11,
                      fontWeight: 600,
                      background:
                        c.status === "Completed"
                          ? "#e3f5ec"
                          : c.status === "In Progress"
                            ? "#fdf1dd"
                            : "var(--gray-50)",
                      color:
                        c.status === "Completed"
                          ? "var(--success-500)"
                          : c.status === "In Progress"
                            ? "#a85f16"
                            : "var(--fg3)",
                    }}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Upcoming appointments"
          action={
            <a
              href="/infirmary/appointments"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              View all
            </a>
          }
        >
          {upcomingAppointments.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              No upcoming appointments.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {upcomingAppointments.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      alignSelf: "stretch",
                      minHeight: 36,
                      borderRadius: 2,
                      background:
                        a.status === "Checked In"
                          ? "var(--success-500)"
                          : "var(--daust-navy-700)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {a.studentName}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 11.5 }}
                    >
                      {a.reason} · {a.time}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: "var(--radius-pill)",
                      fontSize: 11,
                      fontWeight: 600,
                      background:
                        a.status === "Checked In"
                          ? "#e3f5ec"
                          : "var(--bg-tint)",
                      color:
                        a.status === "Checked In"
                          ? "var(--success-500)"
                          : "var(--daust-navy)",
                    }}
                  >
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card
          title="Medication alerts"
          action={
            <a
              href="/infirmary/medications"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              Inventory
            </a>
          }
        >
          {lowStockMeds === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              All medications are adequately stocked.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {store.medications
                .filter(
                  (m) => m.status === "Low Stock" || m.status === "Out of Stock",
                )
                .map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 4,
                        alignSelf: "stretch",
                        minHeight: 36,
                        borderRadius: 2,
                        background:
                          m.status === "Out of Stock"
                            ? "#c0392b"
                            : "var(--daust-orange)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {m.name}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11.5 }}
                      >
                        {m.stock} {m.unit} · Min: {m.minStock}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          m.status === "Out of Stock"
                            ? "#fbe6e3"
                            : "#fdf1dd",
                        color:
                          m.status === "Out of Stock"
                            ? "#c0392b"
                            : "#a85f16",
                      }}
                    >
                      {m.status}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Card
          title="Pending follow-ups"
          action={
            <a
              href="/infirmary/follow-ups"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              View all
            </a>
          }
        >
          {pendingFollowUps === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              All follow-ups are completed.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {store.followUps
                .filter(
                  (f) => f.status === "Pending" || f.status === "Overdue",
                )
                .slice(0, 4)
                .map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 4,
                        alignSelf: "stretch",
                        minHeight: 36,
                        borderRadius: 2,
                        background:
                          f.status === "Overdue"
                            ? "#c0392b"
                            : f.priority === "High"
                              ? "var(--daust-orange)"
                              : "var(--daust-navy-700)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {f.studentName}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11.5 }}
                      >
                        {f.reason} · Due {f.dueDate}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          f.status === "Overdue"
                            ? "#fbe6e3"
                            : f.priority === "High"
                              ? "#fdf1dd"
                              : "var(--bg-tint)",
                        color:
                          f.status === "Overdue"
                            ? "#c0392b"
                            : f.priority === "High"
                              ? "#a85f16"
                              : "var(--daust-navy)",
                      }}
                    >
                      {f.status === "Overdue" ? "Overdue" : f.priority}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
