"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type StudentAccountRow, listStudentAccounts } from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  SortTh,
  useSort,
} from "@/components/ui";

export default function FinanceAccounts() {
  const [rows, setRows] = useState<StudentAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { sort, toggle, apply } = useSort({ key: "balance", dir: "desc" });

  useEffect(() => {
    listStudentAccounts().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.studentNo.toLowerCase().includes(needle) ||
            (r.program ?? "").toLowerCase().includes(needle),
        )
      : rows;
    return apply(matched, {
      name: (r) => r.name,
      studentNo: (r) => r.studentNo,
      program: (r) => r.program,
      billed: (r) => r.billed,
      paid: (r) => r.paid,
      balance: (r) => r.balance,
    });
  }, [rows, q, apply]);

  const owing = filtered.filter((r) => r.balance > 0).length;

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader
        eyebrow="Student billing"
        title="Student accounts"
        subtitle={rows ? `${rows.length} accounts · ${owing} with a balance` : undefined}
        actions={
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or programme…" width={280} />
        }
      />

      {!rows && <p className="muted">Loading…</p>}

      {rows && (
        <Card pad={false}>
          {filtered.length === 0 ? (
            <EmptyState title="No accounts match that search" />
          ) : (
            <table>
              <thead>
                <tr>
                  <SortTh label="Student" sortKey="name" sort={sort} onSort={toggle} />
                  <SortTh label="ID" sortKey="studentNo" sort={sort} onSort={toggle} />
                  <SortTh label="Programme" sortKey="program" sort={sort} onSort={toggle} />
                  <SortTh label="Billed" sortKey="billed" sort={sort} onSort={toggle} align="right" />
                  <SortTh label="Paid" sortKey="paid" sort={sort} onSort={toggle} align="right" />
                  <SortTh label="Balance" sortKey="balance" sort={sort} onSort={toggle} align="right" />
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="sis-row">
                    <td>
                      <Link
                        href={`/admin/finance/students/${r.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600 }}
                      >
                        <Avatar name={r.name} size={28} src={r.photoUrl} />
                        {r.name}
                      </Link>
                    </td>
                    <td className="muted">{r.studentNo}</td>
                    <td>{r.program ?? "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatXof(r.billed)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatXof(r.paid)}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: r.balance > 0 ? "var(--danger)" : "var(--success-500)",
                      }}
                    >
                      {r.balance < 0 ? `${formatXof(-r.balance)} cr` : formatXof(r.balance)}
                    </td>
                    <td>
                      {r.overdue ? (
                        <Badge tone="error">overdue</Badge>
                      ) : r.balance > 0 ? (
                        <Badge tone="warning">owing</Badge>
                      ) : (
                        <Badge tone="success">cleared</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
