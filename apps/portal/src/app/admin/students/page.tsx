"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type AdminStudent, getAdminStudents } from "@/lib/api";
import { formatXof } from "@/lib/format";

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<AdminStudent[]>([]);
  useEffect(() => {
    getAdminStudents().then(setRows).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Academic</p>
      <h1 className="page-title">Students</h1>
      <div className="card" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Program</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.studentNo}</td>
                <td>{s.name}</td>
                <td>{s.program}</td>
                <td>{s.balance > 0 ? <span className="badge overdue">{formatXof(s.balance)}</span> : <span className="badge paid">Paid</span>}</td>
                <td><Link href={`/admin/finance/students/${s.id}`}>Account →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
