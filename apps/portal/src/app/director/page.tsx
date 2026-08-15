"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCheck,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  type DirectorPortalOverview,
  type DirectorStandingOverride,
  type DirectorWidgetKey,
  type DirectorWidgetPreferences,
  getDirectorPortalOverview,
  getDirectorStandingOverrides,
  getDirectorUnauditedPaymentCount,
  getDirectorWidgets,
  updateDirectorWidgets,
} from "@/lib/api";
import { formatDate, formatXof, formatXofCompact } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Stat,
} from "@/components/ui";

export default function DirectorOverviewPage() {
  const [overview, setOverview] = useState<DirectorPortalOverview | null>(null);
  const [preferences, setPreferences] =
    useState<DirectorWidgetPreferences | null>(null);
  const [draft, setDraft] = useState<DirectorWidgetKey[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauditedPayments, setUnauditedPayments] = useState(0);
  const [standingOverrides, setStandingOverrides] = useState<
    DirectorStandingOverride[]
  >([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextOverview, nextPreferences, paymentCount, overrides] =
        await Promise.all([
          getDirectorPortalOverview(),
          getDirectorWidgets(),
          getDirectorUnauditedPaymentCount(),
          getDirectorStandingOverrides(),
        ]);
      setOverview(nextOverview);
      setPreferences(nextPreferences);
      setDraft(nextPreferences.selected);
      setUnauditedPayments(paymentCount.count);
      setStandingOverrides(overrides);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the Director overview.",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCustomizer() {
    setDraft(preferences?.selected ?? []);
    setCustomizing(true);
  }

  function toggle(key: DirectorWidgetKey) {
    setDraft((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function move(key: DirectorWidgetKey, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function saveWidgets() {
    setBusy(true);
    setError(null);
    try {
      const result = await updateDirectorWidgets(draft);
      setPreferences(result);
      setDraft(result.selected);
      setCustomizing(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the dashboard layout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration · Director"
        title="Institutional Overview"
        subtitle={
          overview
            ? `Operational and financial position · refreshed ${formatDate(overview.generatedAt)}`
            : "Operational and financial position"
        }
        actions={
          <>
            <Link
              href="/director/approvals"
              className="sis-btn"
              style={{ textDecoration: "none" }}
            >
              <ClipboardCheck size={15} /> Review approvals
            </Link>
            <Button
              icon={<SlidersHorizontal size={15} />}
              onClick={openCustomizer}
            >
              Customize
            </Button>
          </>
        }
      />

      <Link
        href="/director/payments"
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldCheck size={22} aria-hidden="true" />
          <span>
            <strong>Finance payment audit</strong>
            <span className="muted" style={{ display: "block", marginTop: 3 }}>
              Review evidence and verifier accountability.
            </span>
          </span>
        </span>
        <strong style={{ color: "var(--daust-orange)", fontSize: 24 }}>
          {unauditedPayments}
          <span className="sr-only"> unaudited payments</span>
        </strong>
      </Link>

      {standingOverrides.length > 0 && (
        <Card
          title={`Active standing exceptions · ${standingOverrides.length}`}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {standingOverrides.slice(0, 5).map((override) => (
              <div
                key={override.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px,.8fr) minmax(220px,1.2fr)",
                  gap: 14,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                <span>
                  <strong>{override.studentName}</strong>
                  <span
                    className="muted"
                    style={{ display: "block", fontSize: 12 }}
                  >
                    {override.studentNo} ·{" "}
                    {override.program?.code ?? "No programme"}
                  </span>
                </span>
                <span style={{ fontSize: 13 }}>
                  <strong>{override.standingCode.replaceAll("_", " ")}</strong>
                  <span
                    className="muted"
                    style={{ display: "block", marginTop: 3 }}
                  >
                    {override.reason}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && !customizing && (
        <div
          className="card"
          role="alert"
          style={{ color: "var(--danger)", marginBottom: 16 }}
        >
          {error}
        </div>
      )}
      {!overview || !preferences ? (
        <p className="muted">Loading Director overview…</p>
      ) : preferences.selected.length === 0 ? (
        <Card>
          <EmptyState
            title="No dashboard widgets selected"
            note="Use Customize to add the institutional indicators you want to monitor."
            action={<Button onClick={openCustomizer}>Choose widgets</Button>}
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {preferences.selected.map((key) => (
            <DirectorWidget key={key} widgetKey={key} data={overview} />
          ))}
        </div>
      )}

      <Modal
        open={customizing}
        onClose={() => setCustomizing(false)}
        title="Customize Director overview"
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomizing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={busy}
              onClick={saveWidgets}
            >
              {busy ? "Saving…" : "Save layout"}
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          Choose from approved institutional widgets, then set their display
          order. Custom queries are not permitted.
        </p>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {error}
          </p>
        )}
        <div style={{ display: "grid", gap: 9 }}>
          {preferences?.available.map((item) => {
            const checked = draft.includes(item.key);
            const position = draft.indexOf(item.key);
            return (
              <div
                key={item.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.key)}
                  aria-label={`${checked ? "Hide" : "Show"} ${item.label} widget`}
                  style={{
                    width: 17,
                    height: 17,
                    accentColor: "var(--daust-navy)",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {item.label}
                  </div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
                    {item.description}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    aria-label={`Move ${item.label} up`}
                    disabled={!checked || position <= 0}
                    onClick={() => move(item.key, -1)}
                    style={reorderButton}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    aria-label={`Move ${item.label} down`}
                    disabled={!checked || position === draft.length - 1}
                    onClick={() => move(item.key, 1)}
                    style={reorderButton}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

function DirectorWidget({
  widgetKey,
  data,
}: {
  widgetKey: DirectorWidgetKey;
  data: DirectorPortalOverview;
}) {
  if (widgetKey === "people") {
    return (
      <section aria-labelledby="director-people">
        <h2 id="director-people" className="eyebrow">
          People
        </h2>
        <div className="kpi-grid">
          <Stat
            label="Active students"
            value={data.people.activeStudents}
            sub="current records"
          />
          <Stat
            label="Faculty"
            value={data.people.faculty}
            sub="faculty-role holders"
          />
          <Stat
            label="Staff"
            value={data.people.staff}
            sub="non-faculty staff"
          />
        </div>
      </section>
    );
  }
  if (widgetKey === "academics") {
    return (
      <SingleStat
        title="Academics"
        label="Programs"
        value={data.academics.programs}
        sub="academic programs"
      />
    );
  }
  if (widgetKey === "admissions") {
    return (
      <SingleStat
        title="Admissions"
        label="Applicants"
        value={data.admissions.applicants}
        sub="current applicant records"
      />
    );
  }
  if (widgetKey === "approvals") {
    return (
      <Card
        title="Approvals"
        action={
          <Link
            href="/director/approvals"
            style={{ fontSize: 12.5, fontWeight: 700 }}
          >
            Open queue
          </Link>
        }
      >
        <Stat
          label="Pending decisions"
          value={data.approvals.pending}
          sub="protected Finance changes"
          tone={data.approvals.pending ? "var(--daust-orange)" : undefined}
        />
      </Card>
    );
  }
  if (widgetKey === "holds") {
    return (
      <SingleStat
        title="Active holds"
        label="Students with holds"
        value={data.holds.activeStudents}
        sub="distinct active student records"
      />
    );
  }
  if (widgetKey === "receivables") {
    return (
      <section aria-labelledby="director-receivables">
        <h2 id="director-receivables" className="eyebrow">
          Receivables
        </h2>
        <div className="kpi-grid">
          <Stat
            label="Gross outstanding"
            value={formatXofCompact(data.receivables.outstandingXof)}
            sub="all open account balances"
          />
          <Stat
            label="Overdue amount"
            value={formatXofCompact(data.receivables.overdueXof)}
            sub="past approved plan dates"
            tone={data.receivables.overdueXof ? "var(--danger)" : undefined}
          />
          <Stat
            label="Overdue accounts"
            value={data.receivables.overdueAccounts}
            sub="distinct student accounts"
            tone={
              data.receivables.overdueAccounts ? "var(--danger)" : undefined
            }
          />
        </div>
      </section>
    );
  }
  if (widgetKey === "collections") {
    return (
      <section aria-labelledby="director-collections">
        <h2 id="director-collections" className="eyebrow">
          Cash position
        </h2>
        <div className="kpi-grid">
          <Stat
            label="Collected"
            value={formatXofCompact(data.collections.collectedXof)}
            sub="settled student cash"
          />
          <Stat
            label="Expenses"
            value={formatXofCompact(data.collections.expensesXof)}
            sub="recorded operating spend"
          />
          <Stat
            label="Net cash"
            value={formatXofCompact(data.collections.netCashXof)}
            sub="collections less expenses"
            tone={
              data.collections.netCashXof < 0
                ? "var(--danger)"
                : "var(--success)"
            }
          />
        </div>
      </section>
    );
  }
  return (
    <Card title="Cost-center summary">
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Cost center</th>
              <th style={{ textAlign: "right" }}>Revenue</th>
              <th style={{ textAlign: "right" }}>Expense</th>
              <th style={{ textAlign: "right" }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {data.costCenters.map((center) => (
              <tr key={center.code}>
                <td>
                  <strong>{center.code}</strong> · {center.name}
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatXof(center.revenueXof)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatXof(center.expenseXof)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontWeight: 700,
                    color:
                      center.netXof < 0 ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {formatXof(center.netXof)}
                </td>
              </tr>
            ))}
            {data.costCenters.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No cost-center activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SingleStat({
  title,
  label,
  value,
  sub,
}: {
  title: string;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Card title={title}>
      <Stat label={label} value={value} sub={sub} />
    </Card>
  );
}

const reorderButton: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--surface)",
};
