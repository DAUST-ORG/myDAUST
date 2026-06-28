"use client";

import { useEffect, useState } from "react";
import { type StaffMember, getStaff } from "@/lib/api";

export default function StaffPage() {
  const [rows, setRows] = useState<StaffMember[]>([]);
  useEffect(() => {
    getStaff().then(setRows).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1 className="page-title">Faculty & Staff</h1>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Roles</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.email}>
                <td>{s.name}</td>
                <td className="muted">{s.email}</td>
                <td>{s.kind}</td>
                <td>{s.roles.map((r) => <span key={r} className="badge pending" style={{ marginRight: 4 }}>{r}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
