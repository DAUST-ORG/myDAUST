"use client";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock,
  FileText,
  Pill,
  Stethoscope,
  TrendingUp,
  Users,
  BarChart3,
  Heart,
  Thermometer,
  Target,
} from "lucide-react";
import { useInfirmaryStore } from "../store";
import { Card, Stat, Badge } from "@/components/ui";

const PALETTE = [
  "var(--daust-navy)",
  "var(--daust-orange)",
  "var(--success-500)",
  "var(--danger-500)",
  "var(--daust-navy-700)",
];

function palette(i: number): string {
  return PALETTE[i % PALETTE.length] ?? "var(--daust-navy)";
}

function BarRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <div style={{ flex: 2, height: 8, background: "var(--bg-subtle)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span className="muted" style={{ fontSize: 11, width: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "28px 0 14px" }}>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-tint)",
          color: "var(--daust-navy)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{title}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{sub}</p>
      </div>
    </div>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    const k = key(item) || "Unspecified";
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}

export default function AnalyticsPage() {
  const { store } = useInfirmaryStore();
  const { students, consultations, prescriptions, medications, appointments, documents, followUps, formResponses, forms } = store;

  // ---------- Students ----------
  const totalStudents = students.length;
  const activeStudents = students.filter((s) => s.status === "Active").length;
  const followUpStudents = students.filter((s) => s.status === "Follow-up").length;
  const inactiveStudents = totalStudents - activeStudents - followUpStudents;
  const studentsWithAllergies = students.filter((s) => s.allergies && s.allergies.length > 0);
  const allergyCounts = countBy(
    studentsWithAllergies.flatMap((s) => s.allergies),
    (a) => a
  );

  // ---------- Consultations ----------
  const totalConsultations = consultations.length;
  const completedConsultations = consultations.filter((c) => c.status === "Completed").length;
  const inProgressConsultations = consultations.filter((c) => c.status === "In Progress").length;
  const cancelledConsultations = consultations.filter((c) => c.status === "Cancelled").length;
  const visitTypeCounts = countBy(consultations, (c) => c.visitType);
  const reasonCounts = countBy(consultations, (c) => c.reason);
  const topReasons = reasonCounts.slice(0, 5);

  // ---------- Prescriptions ----------
  const activePrescriptions = prescriptions.filter((p) => p.status === "Active").length;
  const completedPrescriptions = prescriptions.filter((p) => p.status === "Completed").length;

  // ---------- Medications ----------
  const totalMedications = medications.length;
  const inStockMeds = medications.filter((m) => m.status === "In Stock").length;
  const lowStockMeds = medications.filter((m) => m.status === "Low Stock").length;
  const outOfStockMeds = medications.filter((m) => m.status === "Out of Stock").length;
  const categoryCounts = countBy(medications, (m) => m.category);
  const lowStockAlerts = medications
    .filter((m) => m.status === "Low Stock" || m.status === "Out of Stock")
    .sort((a, b) => a.stock - b.stock);

  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const expiringSoon = medications
    .filter((m) => {
      const d = new Date(m.expiryDate);
      return !isNaN(d.getTime()) && d >= now && d <= in60Days;
    })
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  // ---------- Appointments ----------
  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter((a) => a.status === "Completed").length;
  const scheduledAppointments = appointments.filter((a) => a.status === "Scheduled").length;
  const checkedInAppointments = appointments.filter((a) => a.status === "Checked In").length;
  const noShowAppointments = appointments.filter((a) => a.status === "No Show").length;
  const cancelledAppointments = appointments.filter((a) => a.status === "Cancelled").length;
  const appointmentTypes = countBy(appointments, (a) => a.type);
  const completionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
  const noShowRate = totalAppointments > 0 ? Math.round((noShowAppointments / totalAppointments) * 100) : 0;

  // ---------- Follow-ups ----------
  const pendingFollowUps = followUps.filter((f) => f.status === "Pending").length;
  const overdueFollowUps = followUps.filter((f) => f.status === "Overdue").length;
  const completedFollowUps = followUps.filter((f) => f.status === "Completed").length;
  const cancelledFollowUps = followUps.filter((f) => f.status === "Cancelled").length;
  const highPriority = followUps.filter((f) => f.priority === "High").length;
  const mediumPriority = followUps.filter((f) => f.priority === "Medium").length;
  const lowPriority = followUps.filter((f) => f.priority === "Low").length;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <p className="eyebrow">Health Center</p>
      <h1 className="page-title">Analytics</h1>
      <p className="muted" style={{ marginBottom: 22, fontSize: 14.5, maxWidth: "64ch" }}>
        Health center performance metrics, inventory health and population breakdowns.
      </p>

      {/* ================= SUMMARY STATS ================= */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 8 }}>
        <Stat label="Total students" value={totalStudents} sub={`${activeStudents} active · ${followUpStudents} follow-up · ${inactiveStudents} inactive`} tone="var(--daust-navy)" icon={<Users size={15} />} />
        <Stat label="Consultations" value={totalConsultations} sub={`${completedConsultations} done · ${inProgressConsultations} active · ${cancelledConsultations} cancelled`} tone="var(--success-500)" icon={<Stethoscope size={15} />} />
        <Stat label="Active prescriptions" value={activePrescriptions} sub={`${completedPrescriptions} completed`} tone="var(--daust-navy-700)" icon={<Pill size={15} />} />
        <Stat label="Medications" value={totalMedications} sub={`${inStockMeds} in stock · ${lowStockMeds} low · ${outOfStockMeds} out`} tone={outOfStockMeds > 0 ? "var(--danger-500)" : "var(--daust-navy)"} icon={<Activity size={15} />} />
        <Stat label="Appointments" value={totalAppointments} sub={`${completedAppointments} completed · ${scheduledAppointments} scheduled · ${noShowAppointments} no-show`} tone="var(--daust-orange)" icon={<CalendarDays size={15} />} />
        <Stat label="Pending follow-ups" value={pendingFollowUps + overdueFollowUps} sub={`${overdueFollowUps} overdue · ${completedFollowUps} completed`} tone={overdueFollowUps > 0 ? "var(--danger-500)" : undefined} icon={<Clock size={15} />} />
        <Stat label="Documents" value={documents.length} sub="Total medical records" tone="var(--daust-navy)" icon={<FileText size={15} />} />
        <Stat label="Form responses" value={formResponses.length} sub={`Across ${forms.length} forms`} tone="var(--daust-navy-700)" icon={<BarChart3 size={15} />} />
      </div>

      {/* ================= CONSULTATIONS ================= */}
      <SectionHeader icon={<Stethoscope size={17} />} title="Consultation analytics" sub="Volume, outcomes and reasons for clinic visits" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Status breakdown">
          <BarRow label="Completed" count={completedConsultations} total={totalConsultations} color="var(--success-500)" />
          <BarRow label="In Progress" count={inProgressConsultations} total={totalConsultations} color="var(--daust-orange)" />
          <BarRow label="Cancelled" count={cancelledConsultations} total={totalConsultations} color="var(--fg3)" />
        </Card>

        <Card title="Visit type breakdown">
          {visitTypeCounts.map(([type, count], i) => (
            <BarRow key={type} label={type} count={count} total={totalConsultations} color={palette(i)} />
          ))}
          {visitTypeCounts.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No data yet.</p>}
        </Card>

        <Card title="Top consultation reasons">
          {topReasons.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No data yet.</p>
          ) : (
            topReasons.map(([reason, count], i) => (
              <div key={reason} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: "var(--radius-md)", background: "var(--bg-tint)", color: "var(--daust-navy)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{reason}</span>
                <Badge tone="navy">{count} visits</Badge>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* ================= STUDENT HEALTH ================= */}
      <SectionHeader icon={<Heart size={17} />} title="Student health analytics" sub="Demographics and medical profile of registered students" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Gender distribution">
          {countBy(students, (s) => s.gender).map(([gender, count], i) => (
            <BarRow key={gender} label={gender} count={count} total={totalStudents} color={palette(i)} />
          ))}
          {totalStudents === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No students yet.</p>}
        </Card>

        <Card title="Program distribution">
          {countBy(students, (s) => s.program).slice(0, 6).map(([program, count], i) => (
            <BarRow key={program} label={program} count={count} total={totalStudents} color={palette(i)} />
          ))}
          {totalStudents === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No students yet.</p>}
        </Card>

        <Card title="Blood type distribution">
          {countBy(students, (s) => s.bloodType ?? "Unknown").map(([bt, count], i) => (
            <BarRow key={bt} label={bt} count={count} total={totalStudents} color={palette(i)} />
          ))}
          {totalStudents === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No students yet.</p>}
        </Card>

        <Card title="Allergy alerts">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: studentsWithAllergies.length > 0 ? "var(--danger-500)" : "var(--fg1)" }}>
              {studentsWithAllergies.length}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>students with known allergies</span>
          </div>
          {allergyCounts.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No allergies recorded.</p>
          ) : (
            allergyCounts.slice(0, 6).map(([allergy, count]) => (
              <div key={allergy} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <AlertTriangle size={13} color="var(--daust-orange)" />
                  {allergy}
                </span>
                <Badge tone="warning">{count} student{count > 1 ? "s" : ""}</Badge>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* ================= PHARMACY ================= */}
      <SectionHeader icon={<Pill size={17} />} title="Pharmacy analytics" sub="Inventory levels, categories and expiry monitoring" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Inventory status">
          <BarRow label="In Stock" count={inStockMeds} total={totalMedications} color="var(--success-500)" />
          <BarRow label="Low Stock" count={lowStockMeds} total={totalMedications} color="var(--daust-orange)" />
          <BarRow label="Out of Stock" count={outOfStockMeds} total={totalMedications} color="var(--danger-500)" />
        </Card>

        <Card title="Category breakdown">
          {categoryCounts.map(([cat, count], i) => (
            <BarRow key={cat} label={cat} count={count} total={totalMedications} color={palette(i)} />
          ))}
          {categoryCounts.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No medications yet.</p>}
        </Card>

        <Card title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Thermometer size={14} color="var(--danger-500)" /> Expiring within 60 days
          </span>
        }>
          {expiringSoon.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing expiring soon.</p>
          ) : (
            expiringSoon.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{m.category} · {fmtDate(m.expiryDate)}</div>
                </div>
                <Badge tone="error">{m.stock} {m.unit}</Badge>
              </div>
            ))
          )}
        </Card>

        <Card title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={14} color="var(--daust-orange)" /> Low stock alerts
          </span>
        }>
          {lowStockAlerts.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>All medications sufficiently stocked.</p>
          ) : (
            lowStockAlerts.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Min {m.minStock} {m.unit}</div>
                </div>
                <Badge tone={m.status === "Out of Stock" ? "error" : "warning"}>
                  {m.stock} {m.unit}
                </Badge>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* ================= APPOINTMENTS ================= */}
      <SectionHeader icon={<CalendarDays size={17} />} title="Appointment analytics" sub="Scheduling mix, attendance and completion performance" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Appointment types">
          {appointmentTypes.map(([type, count], i) => (
            <BarRow key={type} label={type} count={count} total={totalAppointments} color={palette(i)} />
          ))}
          {appointmentTypes.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No appointments yet.</p>}
        </Card>

        <Card title="Status breakdown">
          <BarRow label="Scheduled" count={scheduledAppointments} total={totalAppointments} color="var(--daust-navy)" />
          <BarRow label="Checked In" count={checkedInAppointments} total={totalAppointments} color="var(--daust-orange)" />
          <BarRow label="Completed" count={completedAppointments} total={totalAppointments} color="var(--success-500)" />
          <BarRow label="No Show" count={noShowAppointments} total={totalAppointments} color="var(--danger-500)" />
          <BarRow label="Cancelled" count={cancelledAppointments} total={totalAppointments} color="var(--fg3)" />
        </Card>

        <Card title="Completion & no-show rates">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, color: "var(--success-500)" }}>{completionRate}%</span>
            <span className="muted" style={{ fontSize: 12.5 }}>completion rate</span>
          </div>
          <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${completionRate}%`, background: "var(--success-500)", borderRadius: 4 }} />
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 18 }}>{completedAppointments} of {totalAppointments} appointments completed</div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, color: noShowRate > 10 ? "var(--danger-500)" : "var(--daust-orange)" }}>{noShowRate}%</span>
            <span className="muted" style={{ fontSize: 12.5 }}>no-show rate</span>
          </div>
          <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${noShowRate}%`, background: "var(--danger-500)", borderRadius: 4 }} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{noShowAppointments} missed appointment{noShowAppointments === 1 ? "" : "s"}</div>
        </Card>
      </div>

      {/* ================= FOLLOW-UPS ================= */}
      <SectionHeader icon={<Target size={17} />} title="Follow-up analytics" sub="Care continuity tracking and priority workload" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start", marginBottom: 30 }}>
        <Card title="Status breakdown">
          <BarRow label="Pending" count={pendingFollowUps} total={followUps.length} color="var(--daust-orange)" />
          <BarRow label="Overdue" count={overdueFollowUps} total={followUps.length} color="var(--danger-500)" />
          <BarRow label="Completed" count={completedFollowUps} total={followUps.length} color="var(--success-500)" />
          <BarRow label="Cancelled" count={cancelledFollowUps} total={followUps.length} color="var(--fg3)" />
        </Card>

        <Card title="Priority breakdown">
          <BarRow label="High priority" count={highPriority} total={followUps.length} color="var(--danger-500)" />
          <BarRow label="Medium priority" count={mediumPriority} total={followUps.length} color="var(--daust-orange)" />
          <BarRow label="Low priority" count={lowPriority} total={followUps.length} color="var(--daust-navy)" />
          {overdueFollowUps > 0 && (
            <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-tint)", border: "1px solid var(--divider)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={13} color="var(--danger-500)" />
              <span><strong>{overdueFollowUps}</strong> overdue follow-up{overdueFollowUps === 1 ? "" : "s"} need immediate attention</span>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
