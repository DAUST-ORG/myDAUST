"use client";

import { useEffect, useState } from "react";
import { type Payslip, getPayslips } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

export default function PayPage() {
  const [slips, setSlips] = useState<Payslip[]>([]);
  useEffect(() => {
    getPayslips().then(setSlips).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Compensation</p>
      <h1 className="page-title">Pay & Payslips</h1>
      <div className="card">
        {slips.length === 0 ? (
          <p className="muted">No payslips on record. Payslips are generated from salary records entered in Finance.</p>
        ) : (
          <table>
            <thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net</th><th /></tr></thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.period}</strong></td>
                  <td>{xof(s.gross)}</td>
                  <td>{xof(s.deductions)}</td>
                  <td><strong>{xof(s.net)}</strong></td>
                  <td>{s.isEstimate ? <span className="badge pending">estimate</span> : <span className="badge completed">actual</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Net is an illustrative figure. Statutory payroll (IPRES/CSS/tax) is handled in the ERP.</p>
      </div>
    </>
  );
}
