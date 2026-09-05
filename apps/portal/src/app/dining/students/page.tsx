"use client";

import { useEffect, useMemo, useState } from "react";
import { type DiningStudent, getDiningStudents } from "@/lib/api";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  SortTh,
  useSort,
} from "@/components/ui";

const PLAN_LABELS: Record<string, string> = {
  full: "Full pension",
  half: "Half pension",
  none: "No plan",
};

export default function DiningStudentsPage() {
  const [rows, setRows] = useState<DiningStudent[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { sort, toggle, apply } = useSort({ key: "name", dir: "asc" });

  useEffect(() => {
    getDiningStudents()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.studentNo.toLowerCase().includes(needle),
        )
      : rows;
    return apply(matched, {
      name: (r) => r.name,
      studentNo: (r) => r.studentNo,
      plan: (r) => r.plan,
      scansToday: (r) => r.scansToday,
    });
  }, [rows, q, apply]);

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Students"
        subtitle={`${rows.length} meal-plan records`}
      />
      <div style={{ marginBottom: 16, maxWidth: 340 }}>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Filter by name or student ID…"
        />
      </div>
      <Card pad={false}>
        {error ? (
          <EmptyState title="Could not load the roster" note={error} />
        ) : !filtered.length ? (
          <EmptyState
            title={rows.length ? "No match" : "No meal plans yet"}
            note={
              rows.length
                ? "Try a different name or ID."
                : "Students appear here once they choose a plan."
            }
          />
        ) : (
          <table>
            <thead>
              <tr>
                <SortTh
                  label="Student"
                  sortKey="name"
                  sort={sort}
                  onSort={toggle}
                />
                <SortTh
                  label="ID"
                  sortKey="studentNo"
                  sort={sort}
                  onSort={toggle}
                />
                <SortTh
                  label="Plan"
                  sortKey="plan"
                  sort={sort}
                  onSort={toggle}
                />
                <th>Status</th>
                <th>Plan change</th>
                <th>Term</th>
                <SortTh
                  label="Meals today"
                  sortKey="scansToday"
                  sort={sort}
                  onSort={toggle}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.studentId}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: "var(--fg3)" }}>{r.studentNo}</td>
                  <td>{PLAN_LABELS[r.plan] ?? r.plan}</td>
                  <td>
                    {r.active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </td>
                  {/* Read-only: the request itself is approved in Finance.
                      Dining sees it so the desk can answer "where is my request?". */}
                  <td>
                    {r.pendingPlanChange ? (
                      <span
                        title={`Requested ${new Date(r.pendingPlanChange.createdAt).toLocaleString()} — decided in Finance approvals`}
                      >
                        <Badge tone="warning">
                          {r.pendingPlanChange.requestedOptionCode
                            ? `→ ${PLAN_LABELS[r.pendingPlanChange.requestedOptionCode] ?? r.pendingPlanChange.requestedOptionCode}`
                            : "Billing change"}
                        </Badge>
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg3)" }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--fg3)" }}>{r.term}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {r.scansToday}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
