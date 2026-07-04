"use client";

import { useEffect, useState } from "react";
import { type Admissions, getAdmissions } from "@/lib/api";

export default function AdmissionsPage() {
  const [d, setD] = useState<Admissions | null>(null);
  useEffect(() => {
    getAdmissions().then(setD).catch(() => {});
  }, []);
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Academic</p>
      <h1 className="page-title">Admissions</h1>

      <div className="kpi-grid">
        {d.funnel.map((f) => (
          <div className="kpi" key={f.stage}>
            <div className="label" style={{ textTransform: "capitalize" }}>{f.stage}</div>
            <div className="value">{f.count}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Applicants</p>
        <table>
          <thead><tr><th>Name</th><th>Program</th><th>Country</th><th>BAC</th><th>Fee</th><th>Stage</th></tr></thead>
          <tbody>
            {d.applicants.map((a) => (
              <tr key={a.email}>
                <td>{a.name}<br /><span className="muted" style={{ fontSize: 12 }}>{a.email}</span></td>
                <td>{a.program}</td>
                <td>{a.country}</td>
                <td>{a.score ?? "—"}</td>
                <td>{a.feePaid ? <span className="badge completed">paid</span> : <span className="badge pending">due</span>}</td>
                <td><span className={`badge ${a.stage === "accepted" ? "paid" : a.stage === "rejected" ? "overdue" : "pending"}`}>{a.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
