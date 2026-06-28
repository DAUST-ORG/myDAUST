"use client";

import { useEffect, useState } from "react";
import { FEE_STRUCTURE } from "@mydaust/shared";
import { type AppUser, getUsers } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

const GENERAL = [
  ["Institution", "Dakar American University of Science & Technology"],
  ["Current term", "Fall 2026"],
  ["Language of instruction", "English"],
  ["Accreditation", "ANAQ-Sup"],
  ["Payment gateway", "PayTech (Wave · Orange Money · Card)"],
  ["Application fee", xof(FEE_STRUCTURE.applicationFee)],
];

const FEES = [
  ["Tuition / year", xof(FEE_STRUCTURE.tuitionPerYear)],
  ["Tuition / semester", xof(FEE_STRUCTURE.tuitionPerSemester)],
  ["Housing / semester", `${xof(FEE_STRUCTURE.housingPerSemester.min)} – ${xof(FEE_STRUCTURE.housingPerSemester.max)}`],
  ["Cafeteria / semester", `${xof(FEE_STRUCTURE.cafeteriaPerSemester.min)} – ${xof(FEE_STRUCTURE.cafeteriaPerSemester.max)}`],
  ["Insurance / year", xof(FEE_STRUCTURE.insurancePerYear)],
];

const SCHOLARSHIPS = [
  ["BAC ≥ 15", "20% tuition discount"],
  ["BAC 13.5 – 14.9", "15% tuition discount"],
  ["BAC 12 – 13.4", "10% tuition discount"],
];

export default function SettingsPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  useEffect(() => {
    getUsers().then(setUsers).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">System</p>
      <h1 className="page-title">Settings</h1>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 1 }}>
          <p className="h1" style={{ fontSize: 16 }}>General</p>
          <table>
            <tbody>
              {GENERAL.map(([k, v]) => (
                <tr key={k}><td className="muted" style={{ width: "45%" }}>{k}</td><td><strong>{v}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p className="h1" style={{ fontSize: 16 }}>Fee structure</p>
          <table>
            <tbody>
              {FEES.map(([k, v]) => (
                <tr key={k}><td className="muted" style={{ width: "55%" }}>{k}</td><td><strong>{v}</strong></td></tr>
              ))}
            </tbody>
          </table>
          <p className="h1" style={{ fontSize: 14, marginTop: 14 }}>Merit scholarships (auto, by BAC)</p>
          <table>
            <tbody>
              {SCHOLARSHIPS.map(([k, v]) => (
                <tr key={k}><td className="muted">{k}</td><td><strong>{v}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Users ({users.length})</p>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Roles</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>{u.roles.map((r) => <span key={r} className="badge pending" style={{ marginRight: 4 }}>{r}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
