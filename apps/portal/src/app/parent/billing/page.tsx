"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
} from "lucide-react";
import {
  type PiSpiRequestSummary,
  type PaymentSubmissionSummary,
  type ProofPaymentMethod,
  type Receipt,
  type StudentAccount,
  getChildAccount,
  getChildPaymentAttempts,
  getChildPiSpiRequest,
  getChildReceipt,
  getPiSpiConfig,
  changeResumablePaymentMethod,
  initiateChildPayment,
  submitChildPiSpi,
  submitResumablePaymentProof,
  verifyPiSpiAlias,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import {
  AccountStandingBadge,
  InstallmentStandingBadge,
  accountBalanceLabel,
  accountPresentation,
  installmentEffectiveSettled,
  installmentOutstanding,
  invoiceEffectiveOutstanding,
  resolveAccountSummary,
} from "@/components/AccountBalance";
import { PiSpiPayForm } from "@/components/PiSpiPayForm";
import { ProofPaymentPanel } from "@/components/ProofPaymentPanel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";
import { ChildSwitcher } from "../ChildSwitcher";
import { useChildren } from "../useChildren";

function paymentTone(
  status: string,
): "success" | "warning" | "error" | "neutral" {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  if (status === "refunded") return "neutral";
  return "error";
}

type ChildRequestSnapshot = { studentId: string; version: number };

/**
 * Compatibility fallback for an API version that predates payableTarget.
 * It mirrors the backend order: dated obligations first, then due date,
 * installment sequence, invoice creation order, and stable identifiers.
 */
function fallbackPaymentTarget(account: StudentAccount) {
  const candidates = account.invoices.flatMap((invoice) => {
    if (
      invoice.status === "void" ||
      invoice.total <= 0 ||
      invoiceEffectiveOutstanding(invoice) <= 0
    ) {
      return [];
    }
    const scheduled = invoice.installments
      .filter((installment) => installmentOutstanding(installment) > 0)
      .map((installment) => ({
        invoice,
        installment,
        amountXof: installmentOutstanding(installment),
        dueDate: installment.dueDate.slice(0, 10),
        sequence: installment.sequence,
      }));
    const scheduledOutstanding = scheduled.reduce(
      (sum, line) => sum + line.amountXof,
      0,
    );
    const unscheduledOutstanding = Math.max(
      0,
      invoiceEffectiveOutstanding(invoice) - scheduledOutstanding,
    );
    return unscheduledOutstanding > 0
      ? [
          ...scheduled,
          {
            invoice,
            installment: null,
            amountXof: unscheduledOutstanding,
            dueDate: null,
            sequence: Number.MAX_SAFE_INTEGER,
          },
        ]
      : scheduled;
  });

  candidates.sort((left, right) => {
    if (left.dueDate && right.dueDate) {
      const dueOrder = left.dueDate.localeCompare(right.dueDate);
      if (dueOrder !== 0) return dueOrder;
    } else if (left.dueDate) {
      return -1;
    } else if (right.dueDate) {
      return 1;
    }
    const sequenceOrder = left.sequence - right.sequence;
    if (sequenceOrder !== 0) return sequenceOrder;
    const leftCreated = Date.parse(left.invoice.createdAt ?? "") || 0;
    const rightCreated = Date.parse(right.invoice.createdAt ?? "") || 0;
    return (
      leftCreated - rightCreated ||
      left.invoice.id.localeCompare(right.invoice.id) ||
      (left.installment?.id ?? "").localeCompare(right.installment?.id ?? "")
    );
  });
  return candidates[0] ?? null;
}

export default function ParentBilling() {
  const { children, active, activeId, select, error } = useChildren();
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [method, setMethod] = useState("proof");
  const [busy, setBusy] = useState(false);
  const [paymentAttempt, setPaymentAttempt] =
    useState<PaymentSubmissionSummary | null>(null);
  const [paymentAttempts, setPaymentAttempts] = useState<
    PaymentSubmissionSummary[]
  >([]);
  const [piSpiEnabled, setPiSpiEnabled] = useState(false);
  const [piSpiRequest, setPiSpiRequest] = useState<PiSpiRequestSummary | null>(
    null,
  );
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const accountRequest = useRef(0);
  const activeChildContext = useRef<{
    studentId: string | null;
    version: number;
  }>({ studentId: activeId, version: 0 });
  if (activeChildContext.current.studentId !== activeId) {
    activeChildContext.current = {
      studentId: activeId,
      version: activeChildContext.current.version + 1,
    };
  }

  const isCurrentChild = useCallback((snapshot: ChildRequestSnapshot) => {
    const current = activeChildContext.current;
    return (
      current.studentId === snapshot.studentId &&
      current.version === snapshot.version
    );
  }, []);

  const loadAccount = useCallback(
    async (snapshot: ChildRequestSnapshot) => {
      const requestId = ++accountRequest.current;
      if (isCurrentChild(snapshot)) setLoadError(null);
      try {
        const [next, attempts] = await Promise.all([
          getChildAccount(snapshot.studentId),
          getChildPaymentAttempts(snapshot.studentId),
        ]);
        if (requestId === accountRequest.current && isCurrentChild(snapshot)) {
          setAccount(next);
          setPaymentAttempt(
            attempts.find((attempt) =>
              ["awaiting_proof", "submitted"].includes(attempt.status),
            ) ??
              attempts[0] ??
              null,
          );
          setPaymentAttempts(attempts);
        }
      } catch (cause) {
        if (requestId === accountRequest.current && isCurrentChild(snapshot)) {
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Could not load this account.",
          );
        }
      }
    },
    [isCurrentChild],
  );

  useEffect(() => {
    getPiSpiConfig()
      .then((config) => setPiSpiEnabled(config.enabled))
      .catch(() => setPiSpiEnabled(false));
  }, []);

  useEffect(() => {
    const context = activeChildContext.current;
    accountRequest.current += 1;
    setAccount(null);
    setReceipt(null);
    setPiSpiRequest(null);
    setPaymentAttempt(null);
    setPaymentAttempts([]);
    setActionError(null);
    setBusy(false);
    if (context.studentId) {
      void loadAccount({
        studentId: context.studentId,
        version: context.version,
      });
    }
    return () => {
      accountRequest.current += 1;
    };
  }, [activeId, loadAccount]);

  const target = useMemo(() => {
    if (!account) return null;
    const canonical = account.payableTarget;
    if (!canonical) return fallbackPaymentTarget(account);
    const invoice = account.invoices.find(
      (candidate) => candidate.id === canonical.invoiceId,
    );
    if (!invoice || canonical.outstandingXof <= 0) {
      return fallbackPaymentTarget(account);
    }
    const installment = canonical.installmentId
      ? (invoice.installments.find(
          (candidate) => candidate.id === canonical.installmentId,
        ) ?? null)
      : null;
    return {
      invoice,
      installment,
      amountXof: canonical.outstandingXof,
    };
  }, [account]);

  const payments = useMemo(
    () =>
      (account?.invoices ?? [])
        .flatMap((invoice) =>
          invoice.payments.map((payment) => ({
            ...payment,
            term: invoice.term,
            invoiceLabel: invoice.description ?? invoice.term,
            eventAt:
              payment.status === "refunded"
                ? (payment.refundedAt ?? payment.createdAt)
                : payment.status === "success"
                  ? (payment.settledAt ?? payment.createdAt)
                  : payment.createdAt,
          })),
        )
        .sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [account],
  );

  const wires = useMemo(
    () =>
      (account?.invoices ?? [])
        .flatMap((invoice) =>
          invoice.wireTransfers.map((wire) => ({
            ...wire,
            term: invoice.term,
            invoiceLabel: invoice.description ?? invoice.term,
          })),
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [account],
  );

  async function startProofPayment(nextMethod: ProofPaymentMethod) {
    const context = activeChildContext.current;
    if (!context.studentId || !target)
      throw new Error("Nothing outstanding to pay");
    const snapshot: ChildRequestSnapshot = {
      studentId: context.studentId,
      version: context.version,
    };
    setBusy(true);
    setActionError(null);
    try {
      const result = await initiateChildPayment(
        snapshot.studentId,
        target.invoice.id,
        target.amountXof,
        nextMethod,
      );
      if (isCurrentChild(snapshot)) {
        setPaymentAttempt(result);
        setPaymentAttempts((current) => [
          result,
          ...current.filter((attempt) => attempt.id !== result.id),
        ]);
      }
      return result;
    } catch (cause) {
      if (isCurrentChild(snapshot)) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Could not start the payment.",
        );
      }
      throw cause;
    } finally {
      if (isCurrentChild(snapshot)) setBusy(false);
    }
  }

  async function sendPiSpi(alias: string) {
    const context = activeChildContext.current;
    if (!context.studentId || !target) {
      throw new Error("Nothing outstanding to pay");
    }
    const snapshot: ChildRequestSnapshot = {
      studentId: context.studentId,
      version: context.version,
    };
    const summary = await submitChildPiSpi({
      studentId: snapshot.studentId,
      invoiceId: target.invoice.id,
      alias,
      amountXof: target.amountXof,
    });
    if (isCurrentChild(snapshot)) setPiSpiRequest(summary);
    return summary;
  }

  async function pollPiSpi(txId: string) {
    const context = activeChildContext.current;
    if (!context.studentId) throw new Error("Select a student");
    const snapshot: ChildRequestSnapshot = {
      studentId: context.studentId,
      version: context.version,
    };
    const summary = await getChildPiSpiRequest(snapshot.studentId, txId);
    if (!isCurrentChild(snapshot)) return summary;
    setPiSpiRequest(summary);
    if (summary.status === "settled") await loadAccount(snapshot);
    return summary;
  }

  async function changeProofMethod(id: string, nextMethod: ProofPaymentMethod) {
    if (!paymentAttempt?.resumeToken)
      throw new Error("Payment resume token is missing");
    const next = await changeResumablePaymentMethod(
      paymentAttempt.resumeToken,
      id,
      nextMethod,
    );
    setPaymentAttempt(next);
    setPaymentAttempts((current) =>
      current.map((attempt) => (attempt.id === next.id ? next : attempt)),
    );
    return next;
  }

  async function uploadProof(id: string, proof: File) {
    if (!paymentAttempt?.resumeToken)
      throw new Error("Payment resume token is missing");
    const next = await submitResumablePaymentProof(
      paymentAttempt.resumeToken,
      id,
      proof,
    );
    setPaymentAttempt(next);
    setPaymentAttempts((current) =>
      current.map((attempt) => (attempt.id === next.id ? next : attempt)),
    );
    return next;
  }

  async function showReceipt(paymentId: string) {
    const context = activeChildContext.current;
    if (!context.studentId) return;
    const snapshot: ChildRequestSnapshot = {
      studentId: context.studentId,
      version: context.version,
    };
    setActionError(null);
    try {
      const next = await getChildReceipt(snapshot.studentId, paymentId);
      if (isCurrentChild(snapshot)) setReceipt(next);
    } catch (cause) {
      if (isCurrentChild(snapshot)) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Could not load the receipt.",
        );
      }
    }
  }

  if (error)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0)
    return <EmptyState title="No students linked to your account" />;

  const balance = account?.totals.balance ?? 0;
  const accountSummary = resolveAccountSummary(account?.summary, {
    balanceXof: balance,
    billedXof: account?.totals.billed,
    installments: account?.invoices.flatMap((invoice) => invoice.installments),
  });
  const accountMeta = accountPresentation(accountSummary);
  return (
    <>
      <PageHeader
        eyebrow="Fees & payment"
        title={active ? `Billing — ${active.name}` : "Billing"}
        subtitle="Review the account and pay securely without re-entering student details."
      />

      <ChildSwitcher
        children={children}
        activeId={activeId}
        onSelect={select}
      />

      {(loadError || actionError) && (
        <p className="card" role="alert" style={{ color: "var(--danger)" }}>
          {loadError ?? actionError}
        </p>
      )}
      {!account && !loadError && <p className="muted">Loading account…</p>}

      {account && (
        <>
          <div className="parent-billing-overview">
            <section
              className="parent-billing-position"
              aria-label="Account position"
            >
              <div className="parent-billing-position__label">
                Account position{" "}
                <AccountStandingBadge summary={accountSummary} />
              </div>
              <div
                className="parent-billing-position__amount"
                style={{
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
                {accountBalanceLabel(accountSummary)}
              </div>
              <p>{accountMeta.description}</p>
              <dl>
                <div>
                  <dt>Billed</dt>
                  <dd>{formatXof(account.totals.billed)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{formatXof(account.totals.paid)}</dd>
                </div>
                {accountSummary.overdueXof > 0 && (
                  <div>
                    <dt>Overdue portion</dt>
                    <dd>{formatXof(accountSummary.overdueXof)}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section
              className="parent-payment-panel"
              aria-labelledby="parent-payment-title"
            >
              <div>
                <span className="parent-payment-panel__eyebrow">
                  Pay for {active?.name}
                </span>
                <h2 id="parent-payment-title">
                  {target ? formatXof(target.amountXof) : "Account settled"}
                </h2>
                <p>
                  {target?.installment
                    ? `${target.installment.label ?? `Installment ${target.installment.sequence}`} · due ${formatDate(target.installment.dueDate)}`
                    : target
                      ? (target.invoice.description ?? target.invoice.term)
                      : "There is no outstanding charge to pay."}
                </p>
              </div>

              {target && (
                <div className="parent-payment-panel__actions">
                  <>
                    <label className="parent-payment-panel__method">
                      <span>Payment method</span>
                      <Select
                        value={method}
                        onChange={setMethod}
                        options={[
                          {
                            value: "proof",
                            label: "Wave, Orange Money, or bank",
                          },
                          ...(piSpiEnabled
                            ? [
                                {
                                  value: "pi_spi",
                                  label: "Instant payment (PI-SPI)",
                                },
                              ]
                            : []),
                        ]}
                        style={{ width: "100%" }}
                      />
                    </label>

                    {method === "pi_spi" && piSpiEnabled ? (
                      <PiSpiPayForm
                        key={`${activeId}:pi-spi`}
                        amountXof={target.amountXof}
                        request={piSpiRequest}
                        onVerifyAlias={verifyPiSpiAlias}
                        onSend={(alias) => sendPiSpi(alias)}
                        onPoll={pollPiSpi}
                      />
                    ) : (
                      <ProofPaymentPanel
                        key={`${activeId}:proof`}
                        amountXof={target.amountXof}
                        attempt={paymentAttempt}
                        history={paymentAttempts.filter(
                          (attempt) => attempt.invoiceId === target.invoice.id,
                        )}
                        onSelectAttempt={setPaymentAttempt}
                        onStart={startProofPayment}
                        onChangeMethod={changeProofMethod}
                        onUploadProof={uploadProof}
                      />
                    )}
                  </>
                </div>
              )}
            </section>
          </div>

          <Card title="Charges and installment schedule">
            {account.invoices.length === 0 ? (
              <EmptyState title="No charges yet" />
            ) : (
              account.invoices.map((invoice) => {
                const isCredit = invoice.total < 0;
                const outstanding = invoiceEffectiveOutstanding(invoice);
                const summary = resolveAccountSummary(invoice.summary, {
                  balanceXof: outstanding,
                  billedXof: invoice.total,
                  installments: invoice.installments,
                });
                return (
                  <section key={invoice.id} className="parent-invoice">
                    <header>
                      <div>
                        <strong>
                          {invoice.description ??
                            (isCredit ? "Account credit" : invoice.term)}
                        </strong>
                        <span>{invoice.term}</span>
                      </div>
                      {!isCredit && <AccountStandingBadge summary={summary} />}
                      <b
                        className={
                          isCredit ? "parent-invoice__credit" : undefined
                        }
                      >
                        {isCredit
                          ? `−${formatXof(-invoice.total)}`
                          : `${formatXof(invoice.total - outstanding)} / ${formatXof(invoice.total)}`}
                      </b>
                    </header>
                    {!isCredit && invoice.installments.length > 0 && (
                      <div className="parent-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Installment</th>
                              <th>Due</th>
                              <th>Amount</th>
                              <th>Settled</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoice.installments.map((line) => (
                              <tr key={line.id}>
                                <td>
                                  {line.label ?? `Installment ${line.sequence}`}
                                </td>
                                <td>{formatDate(line.dueDate)}</td>
                                <td>{formatXof(line.amountDue)}</td>
                                <td>
                                  {formatXof(installmentEffectiveSettled(line))}
                                </td>
                                <td>
                                  <InstallmentStandingBadge
                                    installment={line}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </Card>

          <div className="parent-billing-history">
            <Card
              title="Payment history"
              action={<ReceiptText size={17} aria-hidden="true" />}
            >
              {payments.length === 0 ? (
                <EmptyState title="No payments recorded" />
              ) : (
                <div className="parent-history-list">
                  {payments.map((payment) => (
                    <div key={payment.id} className="parent-history-row">
                      <span className="parent-history-row__icon">
                        <CheckCircle2 size={16} />
                      </span>
                      <span>
                        <strong>{formatXof(payment.amount)}</strong>
                        <small>
                          {payment.invoiceLabel} ·{" "}
                          {payment.method.replaceAll("_", " ")} ·{" "}
                          {formatDate(payment.eventAt)}
                        </small>
                      </span>
                      <Badge tone={paymentTone(payment.status)}>
                        {payment.status}
                      </Badge>
                      {(payment.status === "success" ||
                        payment.status === "refunded") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Download size={13} />}
                          onClick={() => showReceipt(payment.id)}
                        >
                          Receipt
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Wire submissions"
              action={<Banknote size={17} aria-hidden="true" />}
            >
              {wires.length === 0 ? (
                <EmptyState title="No wire proofs submitted" />
              ) : (
                <div className="parent-history-list">
                  {wires.map((wire) => (
                    <div key={wire.id} className="parent-history-row">
                      <span className="parent-history-row__icon">
                        <Clock3 size={16} />
                      </span>
                      <span>
                        <strong>
                          {formatXof(
                            wire.confirmedAmountXof ?? wire.submittedAmountXof,
                          )}
                        </strong>
                        <small>
                          {wire.invoiceLabel} · submitted{" "}
                          {formatDate(wire.submittedAt)}
                        </small>
                      </span>
                      <Badge
                        tone={
                          wire.status === "approved"
                            ? "success"
                            : wire.status === "submitted"
                              ? "warning"
                              : "error"
                        }
                      >
                        {wire.status === "submitted"
                          ? "under review"
                          : wire.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {receipt && (
            <div className="parent-print-receipt">
              <Card
                title={`Receipt ${receipt.providerRef}`}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                  >
                    Print / save PDF
                  </Button>
                }
              >
                <div className="parent-receipt" aria-label="Payment receipt">
                  <div>
                    <span>Student</span>
                    <strong>
                      {receipt.student} · {receipt.studentNo}
                    </strong>
                  </div>
                  <div>
                    <span>Term</span>
                    <strong>{receipt.term}</strong>
                  </div>
                  <div>
                    <span>Amount</span>
                    <strong>{formatXof(receipt.amount)}</strong>
                  </div>
                  <div>
                    <span>Method</span>
                    <strong>{receipt.method.replaceAll("_", " ")}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{receipt.status}</strong>
                  </div>
                  <div>
                    <span>Recorded</span>
                    <strong>{formatDate(receipt.paidAt)}</strong>
                  </div>
                  {receipt.refundedAt && (
                    <div>
                      <span>Refunded</span>
                      <strong>{formatDate(receipt.refundedAt)}</strong>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          <style jsx>{`
            .parent-billing-overview {
              display: grid;
              grid-template-columns: minmax(260px, 0.85fr) minmax(
                  340px,
                  1.15fr
                );
              gap: 18px;
              margin-bottom: 18px;
              align-items: start;
            }
            .parent-billing-position {
              background: var(--grad-brand);
              color: #fff;
              border-radius: var(--radius-lg);
              padding: clamp(20px, 3vw, 28px);
              box-shadow: var(--shadow-navy);
            }
            .parent-billing-position__label {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: var(--tracking-wider);
              text-transform: uppercase;
            }
            .parent-billing-position__amount {
              font-family: var(--font-display);
              font-size: clamp(30px, 5vw, 42px);
              font-weight: 800;
              margin-top: 7px;
              font-variant-numeric: tabular-nums;
            }
            .parent-billing-position p {
              opacity: 0.84;
              font-size: 12.5px;
              line-height: 1.55;
            }
            .parent-billing-position dl {
              display: grid;
              gap: 8px;
              margin: 18px 0 0;
              padding-top: 14px;
              border-top: 1px solid rgba(255, 255, 255, 0.2);
            }
            .parent-billing-position dl div {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              font-size: 12.5px;
            }
            .parent-billing-position dt {
              opacity: 0.76;
            }
            .parent-billing-position dd {
              margin: 0;
              font-weight: 700;
              font-variant-numeric: tabular-nums;
            }
            .parent-payment-panel {
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
              background: var(--surface);
              padding: clamp(18px, 3vw, 24px);
            }
            .parent-payment-panel__eyebrow {
              color: var(--daust-orange);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .parent-payment-panel h2 {
              font-family: var(--font-display);
              margin: 4px 0 2px;
              font-size: 26px;
            }
            .parent-payment-panel p {
              color: var(--fg3);
              font-size: 12.5px;
              margin: 0;
            }
            .parent-payment-panel__actions {
              display: grid;
              gap: 10px;
              margin-top: 18px;
            }
            .parent-payment-panel__method {
              display: grid;
              gap: 5px;
            }
            .parent-payment-panel__method > span {
              color: var(--fg3);
              font-size: 11.5px;
              font-weight: 700;
            }
            .parent-payment-panel__pending {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              border: 1px solid #f1d3a7;
              border-radius: var(--radius-md);
              padding: 13px;
              background: #fff7e8;
              color: #8a5319;
            }
            .parent-payment-panel__pending > span {
              display: grid;
              gap: 3px;
            }
            .parent-payment-panel__pending small {
              line-height: 1.5;
            }
            .parent-invoice {
              padding: 14px 0;
              border-bottom: 1px solid var(--divider);
            }
            .parent-invoice:last-child {
              border-bottom: 0;
            }
            .parent-invoice header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto auto;
              gap: 12px;
              align-items: center;
            }
            .parent-invoice header div {
              display: flex;
              min-width: 0;
              flex-direction: column;
            }
            .parent-invoice header span {
              color: var(--fg3);
              font-size: 11.5px;
            }
            .parent-invoice header b {
              font-variant-numeric: tabular-nums;
              font-size: 12.5px;
            }
            .parent-invoice__credit {
              color: var(--success-500);
            }
            .parent-table-scroll {
              overflow-x: auto;
              margin-top: 8px;
            }
            .parent-table-scroll td:nth-child(n + 3),
            .parent-table-scroll th:nth-child(n + 3) {
              text-align: right;
              white-space: nowrap;
            }
            .parent-billing-history {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 18px;
              margin-top: 18px;
            }
            .parent-history-list {
              display: grid;
              gap: 2px;
            }
            .parent-history-row {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr) auto auto;
              align-items: center;
              gap: 10px;
              padding: 10px 0;
              border-bottom: 1px solid var(--divider);
            }
            .parent-history-row:last-child {
              border-bottom: 0;
            }
            .parent-history-row__icon {
              width: 30px;
              height: 30px;
              display: grid;
              place-items: center;
              border-radius: 50%;
              color: var(--daust-navy);
              background: var(--bg-tint);
            }
            .parent-history-row > span:nth-child(2) {
              min-width: 0;
              display: flex;
              flex-direction: column;
            }
            .parent-history-row small {
              color: var(--fg3);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .parent-receipt {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 16px 24px;
            }
            .parent-receipt div {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            .parent-receipt span {
              color: var(--fg3);
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            @media (max-width: 820px) {
              .parent-billing-overview,
              .parent-billing-history {
                grid-template-columns: 1fr;
              }
              .parent-receipt {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
            @media (max-width: 560px) {
              .parent-invoice header {
                grid-template-columns: minmax(0, 1fr) auto;
              }
              .parent-invoice header b {
                grid-column: 1 / -1;
              }
              .parent-history-row {
                grid-template-columns: auto minmax(0, 1fr) auto;
              }
              .parent-history-row button {
                grid-column: 2 / -1;
                justify-self: start;
              }
              .parent-receipt {
                grid-template-columns: 1fr;
              }
            }
            @media print {
              :global(.portal-sidebar),
              :global(.portal-topbar) {
                display: none !important;
              }
              :global(.portal-main) > * {
                visibility: hidden;
              }
              .parent-print-receipt,
              .parent-print-receipt * {
                visibility: visible;
              }
              .parent-print-receipt {
                position: absolute;
                inset: 24px;
              }
              .parent-print-receipt button {
                display: none;
              }
            }
          `}</style>
        </>
      )}
    </>
  );
}
