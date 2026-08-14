"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type BillingInvoice,
  type AccountBalanceSummary,
  type MyProfile,
  type PaymentSubmissionSummary,
  type ProofPaymentMethod,
  changeMyPaymentAttemptMethod,
  createMyPaymentAttempt,
  getCurrentTerm,
  getMyBilling,
  getMyBillingSummary,
  getMyProfile,
  getMyPiSpiRequest,
  getPiSpiConfig,
  listMyPaymentAttempts,
  type PiSpiRequestSummary,
  submitStudentPiSpi,
  submitMyPaymentProof,
  verifyPiSpiAlias,
} from "@/lib/api";
import { Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { PiSpiPayForm } from "@/components/PiSpiPayForm";
import { ProofPaymentPanel } from "@/components/ProofPaymentPanel";
import { formatDate, formatXof } from "@/lib/format";
import {
  AccountStandingBadge,
  accountPresentation,
  fallbackAccountSummary,
  installmentOutstanding,
  invoiceEffectiveOutstanding,
  resolveAccountSummary,
  type InstallmentPositionLike,
} from "@/components/AccountBalance";

interface ChargeRow extends InstallmentPositionLike {
  id: string | null;
  invoiceId: string;
  invoiceCreatedAt: string | null;
  invoiceOrder: number;
  sequence: number | null;
  description: string;
  note: string;
  amount: number;
  outstanding: number;
  dueDate: string | null;
  status: string;
}

function statusStyle(charge: ChargeRow): {
  bg: string;
  fg: string;
  label: string;
} {
  if (charge.outstanding <= 0)
    return { bg: "rgba(46,125,82,.12)", fg: "#1f6b42", label: "Paid" };
  if (charge.dueState === "overdue")
    return {
      bg: "rgba(192,57,43,.10)",
      fg: "var(--error-500)",
      label: "Overdue",
    };
  if (charge.dueState === "due_today")
    return { bg: "rgba(237,132,37,.14)", fg: "#a85f16", label: "Due today" };
  if (charge.dueState === "unscheduled")
    return {
      bg: "rgba(237,132,37,.14)",
      fg: "#a85f16",
      label: "Schedule needed",
    };
  const summary = fallbackAccountSummary({
    balanceXof: charge.outstanding,
    billedXof: charge.amount,
    installments: [
      {
        dueDate: charge.dueDate,
        amountDue: charge.amount,
        amountPaid: charge.amount - charge.outstanding,
      },
    ],
  });
  if (summary.standing === "overdue")
    return {
      bg: "rgba(192,57,43,.10)",
      fg: "var(--error-500)",
      label: "Overdue",
    };
  if (summary.dueTodayXof > 0)
    return { bg: "rgba(237,132,37,.14)", fg: "#a85f16", label: "Due today" };
  if (charge.paymentProgress === "partial" || charge.status === "partial")
    return {
      bg: "var(--bg-tint)",
      fg: "var(--daust-navy)",
      label: "Partly paid",
    };
  return { bg: "var(--bg-tint)", fg: "var(--daust-navy)", label: "Scheduled" };
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [billingSummary, setBillingSummary] =
    useState<AccountBalanceSummary | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [term, setTerm] = useState("");
  const [method, setMethod] = useState("proof");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [paymentAttempts, setPaymentAttempts] = useState<
    PaymentSubmissionSummary[]
  >([]);
  const [piSpiEnabled, setPiSpiEnabled] = useState(false);
  const [piSpiRequest, setPiSpiRequest] = useState<PiSpiRequestSummary | null>(
    null,
  );

  useEffect(() => {
    getMyBilling()
      .then(setInvoices)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
    getMyBillingSummary()
      .then(setBillingSummary)
      .catch(() => {});
    getMyProfile()
      .then(setProfile)
      .catch(() => {});
    getCurrentTerm()
      .then((t) => setTerm(t.name))
      .catch(() => {});
    listMyPaymentAttempts()
      .then(setPaymentAttempts)
      .catch(() => {});
    getPiSpiConfig()
      .then((c) => setPiSpiEnabled(c.enabled))
      .catch(() => {});
  }, []);

  const charges: ChargeRow[] = useMemo(
    () =>
      invoices
        .flatMap((inv, invoiceIndex) => {
          // `/my/billing` is returned newest-first. The index keeps the portal
          // compatible with an older API task while `createdAt` rolls out.
          const invoiceOrder = invoices.length - 1 - invoiceIndex;
          const scheduled = inv.installments.map<ChargeRow>((i) => ({
            ...i,
            id: i.id,
            invoiceId: inv.id,
            invoiceCreatedAt: inv.createdAt ?? null,
            invoiceOrder,
            sequence: i.sequence,
            description: `Installment ${i.sequence} — ${inv.term}`,
            note: `Installment ${i.sequence} of ${inv.installments.length}`,
            amount: i.amountDue,
            outstanding: installmentOutstanding(i),
            dueDate: i.dueDate,
            status: i.status,
          }));
          const effectiveOutstanding =
            inv.summary?.outstandingXof ?? invoiceEffectiveOutstanding(inv);
          const unscheduled = Math.max(
            0,
            effectiveOutstanding -
              scheduled.reduce((sum, line) => sum + line.outstanding, 0),
          );
          if (unscheduled <= 0) return scheduled;
          return [
            ...scheduled,
            {
              id: null,
              invoiceId: inv.id,
              invoiceCreatedAt: inv.createdAt ?? null,
              invoiceOrder,
              sequence: null,
              description: `Unscheduled charge — ${inv.term}`,
              note: "Finance has not assigned a payment date",
              amount: unscheduled,
              amountDue: unscheduled,
              amountPaid: 0,
              outstanding: unscheduled,
              outstandingXof: unscheduled,
              dueDate: null,
              dueState: "unscheduled" as const,
              paymentProgress: "unpaid" as const,
              status: "pending",
              daysPastDue: 0,
            },
          ];
        })
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) {
            const dueOrder = a.dueDate.localeCompare(b.dueDate);
            if (dueOrder !== 0) return dueOrder;
          } else if (a.dueDate) return -1;
          else if (b.dueDate) return 1;
          const sequenceOrder =
            (a.sequence ?? Number.MAX_SAFE_INTEGER) -
            (b.sequence ?? Number.MAX_SAFE_INTEGER);
          if (sequenceOrder !== 0) return sequenceOrder;
          const invoiceOrder =
            a.invoiceCreatedAt && b.invoiceCreatedAt
              ? a.invoiceCreatedAt.localeCompare(b.invoiceCreatedAt)
              : a.invoiceOrder - b.invoiceOrder;
          if (invoiceOrder !== 0) return invoiceOrder;
          return (
            a.invoiceId.localeCompare(b.invoiceId) ||
            (a.id ?? "").localeCompare(b.id ?? "")
          );
        }),
    [invoices],
  );

  const balance = invoices.reduce((s, i) => s + i.balance, 0);
  const accountSummary = resolveAccountSummary(billingSummary, {
    balanceXof: balance,
    billedXof: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    installments: invoices.flatMap((invoice) => invoice.installments),
  });
  const accountMeta = accountPresentation(accountSummary);
  const nextCharge = charges.find((c) => c.outstanding > 0);
  const activeAttempt =
    paymentAttempts.find(
      (attempt) =>
        attempt.invoiceId === nextCharge?.invoiceId &&
        ["awaiting_proof", "submitted"].includes(attempt.status),
    ) ?? null;
  const targetAttempts = paymentAttempts.filter(
    (attempt) => attempt.invoiceId === nextCharge?.invoiceId,
  );
  const settled = accountSummary.outstandingXof <= 0;

  async function refreshBilling() {
    const [nextInvoices, nextSummary] = await Promise.all([
      getMyBilling(),
      getMyBillingSummary().catch(() => null),
    ]);
    setInvoices(nextInvoices);
    setBillingSummary(nextSummary);
  }

  async function startProofPayment(nextMethod: ProofPaymentMethod) {
    if (!nextCharge) throw new Error("Nothing outstanding to pay");
    const attempt = await createMyPaymentAttempt({
      invoiceId: nextCharge.invoiceId,
      amountXof: nextCharge.outstanding,
      method: nextMethod,
    });
    setPaymentAttempts((rows) => [
      attempt,
      ...rows.filter((row) => row.id !== attempt.id),
    ]);
    return attempt;
  }

  async function changeProofMethod(id: string, nextMethod: ProofPaymentMethod) {
    const attempt = await changeMyPaymentAttemptMethod(id, nextMethod);
    setPaymentAttempts((rows) =>
      rows.map((row) => (row.id === id ? attempt : row)),
    );
    return attempt;
  }

  async function uploadProof(id: string, proof: File) {
    const attempt = await submitMyPaymentProof(id, proof);
    setPaymentAttempts((rows) =>
      rows.map((row) => (row.id === id ? attempt : row)),
    );
    return attempt;
  }

  async function sendPiSpi(alias: string, saveAlias: boolean) {
    if (!nextCharge) throw new Error("Nothing outstanding to pay");
    const summary = await submitStudentPiSpi({
      invoiceId: nextCharge.invoiceId,
      alias,
      amountXof: nextCharge.outstanding,
      saveAlias,
    });
    setPiSpiRequest(summary);
    return summary;
  }

  // A settled request means the money landed, so refresh the balance behind it.
  async function pollPiSpi(txId: string) {
    const summary = await getMyPiSpiRequest(txId);
    setPiSpiRequest(summary);
    if (summary.status === "settled") await refreshBilling();
    return summary;
  }

  return (
    <>
      <PageHeader
        title="Billing & Financials"
        subtitle={[
          term || null,
          profile ? `Account ${profile.studentNo}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {error && (
        <p className="card" style={{ color: "var(--error-500)" }}>
          {error}
        </p>
      )}

      {loaded && invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          note="Charges appear here once the bursar issues them."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 1.6fr)",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "var(--grad-brand)",
              color: "#fff",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              boxShadow: "var(--shadow-navy)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 13, opacity: 0.8 }}>
                Account position
              </span>
              <AccountStandingBadge summary={accountSummary} />
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 800,
                marginTop: 7,
                color:
                  accountSummary.standing === "overdue"
                    ? "#ffb4aa"
                    : accountSummary.standing === "credit" ||
                        accountSummary.standing === "cleared"
                      ? "#b7efd0"
                      : accountSummary.standing === "unscheduled"
                        ? "#ffd59c"
                        : "#fff",
              }}
            >
              {accountSummary.standing === "credit"
                ? `Credit ${formatXof(accountSummary.creditXof)}`
                : formatXof(accountSummary.outstandingXof)}
            </div>
            <div
              style={{
                fontSize: 12.5,
                marginTop: 4,
                color:
                  accountSummary.standing === "overdue"
                    ? "#ffb4aa"
                    : settled
                      ? "rgba(183,239,208,.95)"
                      : "rgba(255,255,255,.82)",
              }}
            >
              {accountMeta.description}
            </div>

            {!settled && nextCharge && (
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <Select
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "proof", label: "Wave, Orange Money, or bank" },
                    ...(piSpiEnabled
                      ? [{ value: "pi_spi", label: "Instant payment (PI-SPI)" }]
                      : []),
                  ]}
                  style={{ width: "100%" }}
                />
                {method === "pi_spi" && piSpiEnabled ? (
                  <PiSpiPayForm
                    amountXof={nextCharge.outstanding}
                    savedAlias={profile?.piSpiAlias ?? null}
                    allowSaveAlias
                    request={piSpiRequest}
                    onVerifyAlias={verifyPiSpiAlias}
                    onSend={sendPiSpi}
                    onPoll={pollPiSpi}
                  />
                ) : (
                  <ProofPaymentPanel
                    amountXof={nextCharge.outstanding}
                    attempt={activeAttempt}
                    history={targetAttempts}
                    onStart={startProofPayment}
                    onChangeMethod={changeProofMethod}
                    onUploadProof={uploadProof}
                  />
                )}
              </div>
            )}

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,.2)",
                margin: "18px 0 12px",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <span style={{ opacity: 0.8 }}>Next due date</span>
              <strong>
                {nextCharge?.dueDate
                  ? formatDate(nextCharge.dueDate)
                  : "Not scheduled"}
              </strong>
            </div>
            <p style={{ fontSize: 11, opacity: 0.7, margin: "12px 0 0" }}>
              {charges.length > 0
                ? `${charges.length} installments · ${formatXof(charges.reduce((s, c) => s + c.amount, 0))} total`
                : "No payment plan on this account."}
            </p>
          </div>

          <Card pad={false}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,2fr) 130px 120px 90px",
                gap: 12,
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              <span>Description</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span style={{ textAlign: "right" }}>Due</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {charges.map((c, i) => {
              const s = statusStyle(c);
              return (
                <div
                  key={`${c.invoiceId}:${c.id ?? "unscheduled"}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,2fr) 130px 120px 90px",
                    gap: 12,
                    alignItems: "center",
                    padding: "13px 18px",
                    borderBottom:
                      i < charges.length - 1
                        ? "1px solid var(--divider)"
                        : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {c.description}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {c.note}
                    </div>
                  </div>
                  <span
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatXof(c.amount)}
                  </span>
                  <span
                    className="muted"
                    style={{ textAlign: "right", fontSize: 12.5 }}
                  >
                    {c.dueDate ? formatDate(c.dueDate) : "Not scheduled"}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: s.bg,
                        color: s.fg,
                      }}
                    >
                      {s.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </>
  );
}
