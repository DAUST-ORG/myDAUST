"use client";

import { useEffect, useState } from "react";
import { type AdminPrograms, getAdminPrograms } from "@/lib/api";

export default function AdminProgramsPage() {
  const [data, setData] = useState<AdminPrograms | null>(null);
  useEffect(() => {
    getAdminPrograms().then(setData).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Academic</p>
      <h1 className="page-title">Programs & Courses</h1>

      <div className="card" style={{ marginTop: 18 }}>
        <p className="h1" style={{ fontSize: 16 }}>Programs</p>
        <table>
          <thead><tr><th>Code</th><th>Program</th><th>Department</th><th>Students</th></tr></thead>
          <tbody>
            {(data?.programs ?? []).map((p) => (
              <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{p.department}</td><td>{p.students}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Course catalog</p>
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th></tr></thead>
          <tbody>
            {(data?.courses ?? []).map((c) => (
              <tr key={c.code}><td>{c.code}</td><td>{c.title}</td><td>{c.credits}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
