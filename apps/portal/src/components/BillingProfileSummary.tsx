"use client";

import {
  AlertCircle,
  BedDouble,
  Info,
  ReceiptText,
  ShieldCheck,
  Utensils,
  WalletCards,
} from "lucide-react";
import type { BillingProfileView } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";

function selectedLabel(selected: boolean, label?: string) {
  return selected ? (label ?? "Included") : "Not included";
}

function sourceLabel(profile: BillingProfileView) {
  if (profile.source?.workbookRow != null) {
    return `Workbook row ${profile.source.workbookRow}`;
  }
  if (profile.source?.kind === "admissions") return "Admissions";
  if (profile.source?.kind === "approved_change") return "Approved change";
  return profile.source?.kind?.replaceAll("_", " ") ?? "myDAUST";
}

function warningTone(severity: "info" | "warning" | "error") {
  if (severity === "error") {
    return {
      icon: AlertCircle,
      color: "var(--danger)",
      background: "color-mix(in srgb, var(--danger) 8%, var(--surface))",
    };
  }
  if (severity === "warning") {
    return {
      icon: AlertCircle,
      color: "var(--warning)",
      background: "color-mix(in srgb, var(--warning) 9%, var(--surface))",
    };
  }
  return {
    icon: Info,
    color: "var(--info)",
    background: "color-mix(in srgb, var(--info) 8%, var(--surface))",
  };
}

export function BillingProfileSummary({
  profile,
  title = "Annual billing profile",
  action,
}: {
  profile: BillingProfileView | null | undefined;
  title?: string;
  action?: React.ReactNode;
}) {
  if (profile === undefined) {
    return (
      <Card title={title} action={action}>
        <p className="muted" style={{ margin: 0 }}>
          Loading billing profile…
        </p>
      </Card>
    );
  }

  if (profile === null) {
    return (
      <Card title={title} action={action}>
        <EmptyState
          icon={<WalletCards size={22} />}
          title="No annual profile yet"
          note="Service choices and awards will appear here when Finance issues the annual billing profile."
        />
      </Card>
    );
  }

  const adjustmentNetXof =
    profile.awards.reduce(
      (sum, award) =>
        sum + (award.effect === "discount" ? -1 : 1) * award.amountXof,
      0,
    ) +
    profile.adjustments.reduce(
      (sum, adjustment) => sum + adjustment.amountXof,
      0,
    );

  return (
    <Card
      title={title}
      action={
        <div className="billing-profile__actions">
          <Badge tone="navy">{profile.academicYearLabel}</Badge>
          <Badge tone="neutral">{sourceLabel(profile)}</Badge>
          {action}
        </div>
      }
    >
      <div className="billing-profile">
        <div className="billing-profile__services">
          <Service
            icon={<BedDouble size={17} />}
            label="Housing"
            value={profile.housing?.label ?? "No housing"}
            amount={profile.housing?.amountXof ?? 0}
          />
          <Service
            icon={<Utensils size={17} />}
            label="Cafeteria"
            value={profile.cafeteria?.label ?? "No meal plan"}
            amount={profile.cafeteria?.amountXof ?? 0}
          />
          <Service
            icon={<ShieldCheck size={17} />}
            label="Insurance"
            value={selectedLabel(
              profile.insurance.selected,
              profile.insurance.label,
            )}
            amount={
              profile.insurance.selected ? profile.insurance.amountXof : 0
            }
          />
          <Service
            icon={<ReceiptText size={17} />}
            label="Housing caution"
            value={selectedLabel(
              profile.caution.selected,
              profile.caution.label,
            )}
            detail={
              profile.caution.selected && profile.caution.refundable
                ? "Refundable"
                : undefined
            }
            amount={profile.caution.selected ? profile.caution.amountXof : 0}
          />
        </div>

        <div className="billing-profile__body">
          <section aria-labelledby={`awards-${profile.id}`}>
            <div className="billing-profile__section-title">
              <span id={`awards-${profile.id}`}>Awards & adjustments</span>
              {adjustmentNetXof !== 0 && (
                <strong>
                  {adjustmentNetXof < 0 ? "−" : "+"}
                  {formatXof(Math.abs(adjustmentNetXof))}
                </strong>
              )}
            </div>
            {profile.awards.length === 0 && profile.adjustments.length === 0 ? (
              <p className="muted billing-profile__empty">
                No awards or manual adjustments.
              </p>
            ) : (
              <div className="billing-profile__lines">
                {profile.awards.map((award) => (
                  <div key={award.id} className="billing-profile__line">
                    <span>
                      <strong>{award.label}</strong>
                      <small>
                        {award.basis.replaceAll("_", " ")} ·{" "}
                        {award.calculation.replaceAll("_", " ")}
                      </small>
                    </span>
                    <b
                      className={
                        award.effect === "discount"
                          ? "billing-profile__discount"
                          : undefined
                      }
                    >
                      {award.effect === "discount" ? "−" : "+"}
                      {formatXof(Math.abs(award.amountXof))}
                    </b>
                  </div>
                ))}
                {profile.adjustments.map((adjustment) => {
                  const isDiscount =
                    adjustment.kind === "discount" || adjustment.amountXof < 0;
                  return (
                    <div key={adjustment.id} className="billing-profile__line">
                      <span>
                        <strong>{adjustment.label}</strong>
                        <small>
                          {adjustment.reason ?? "Approved reconciliation"}
                        </small>
                      </span>
                      <b
                        className={
                          isDiscount ? "billing-profile__discount" : undefined
                        }
                      >
                        {isDiscount ? "−" : "+"}
                        {formatXof(Math.abs(adjustment.amountXof))}
                      </b>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <dl className="billing-profile__ledger">
            <div>
              <dt>Gross services</dt>
              <dd>{formatXof(profile.grossChargesXof)}</dd>
            </div>
            <div className="billing-profile__ledger-net">
              <dt>Net billed</dt>
              <dd>{formatXof(profile.netBilledXof)}</dd>
            </div>
            <div>
              <dt>Paid to date</dt>
              <dd>{formatXof(profile.paidXof)}</dd>
            </div>
            <div className="billing-profile__ledger-balance">
              <dt>Outstanding</dt>
              <dd>{formatXof(profile.outstandingXof)}</dd>
            </div>
            {profile.accountCreditXof > 0 && (
              <div className="billing-profile__ledger-credit">
                <dt>Account credit</dt>
                <dd>{formatXof(profile.accountCreditXof)}</dd>
              </div>
            )}
          </dl>
        </div>

        {profile.warnings.length > 0 && (
          <div
            className="billing-profile__warnings"
            aria-label="Profile warnings"
          >
            {profile.warnings.map((warning) => {
              const tone = warningTone(warning.severity);
              const Icon = tone.icon;
              return (
                <div
                  key={`${warning.code}:${warning.message}`}
                  role={warning.severity === "error" ? "alert" : "status"}
                  style={{ color: tone.color, background: tone.background }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{warning.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .billing-profile {
          display: grid;
          gap: 18px;
        }
        .billing-profile__actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          flex-wrap: wrap;
        }
        .billing-profile__services {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          background: var(--surface);
        }
        .billing-profile__body {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr);
          gap: clamp(20px, 4vw, 42px);
          align-items: start;
        }
        .billing-profile__section-title {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          padding-bottom: 9px;
          border-bottom: 1px solid var(--divider);
          color: var(--fg3);
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .billing-profile__section-title strong {
          color: var(--success-500);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        .billing-profile__empty {
          margin: 12px 0 0;
          font-size: 12.5px;
        }
        .billing-profile__lines {
          display: grid;
        }
        .billing-profile__line {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid var(--divider);
        }
        .billing-profile__line > span {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .billing-profile__line strong {
          color: var(--fg1);
          font-size: 13px;
        }
        .billing-profile__line small {
          color: var(--fg3);
          font-size: 11.5px;
          text-transform: capitalize;
        }
        .billing-profile__line b {
          color: var(--fg1);
          font-size: 12.5px;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .billing-profile__line .billing-profile__discount {
          color: var(--success-500);
        }
        .billing-profile__ledger {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 15px 16px;
          border-radius: var(--radius-lg);
          background: var(--bg-tint);
        }
        .billing-profile__ledger div {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          color: var(--fg3);
          font-size: 12.5px;
        }
        .billing-profile__ledger dd {
          margin: 0;
          color: var(--fg1);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .billing-profile__ledger-net {
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }
        .billing-profile__ledger-net dd {
          color: var(--daust-navy);
        }
        .billing-profile__ledger-balance {
          margin: 5px -7px -7px;
          padding: 10px 7px 7px;
          border-top: 1px solid var(--border);
          color: var(--fg1) !important;
          font-weight: 700;
        }
        .billing-profile__ledger-balance dd {
          font-family: var(--font-display);
          font-size: 17px;
        }
        .billing-profile__ledger-credit dd {
          color: var(--success-500);
        }
        .billing-profile__warnings {
          display: grid;
          gap: 7px;
        }
        .billing-profile__warnings > div {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border-radius: var(--radius-md);
          padding: 9px 11px;
          font-size: 12.5px;
          line-height: 1.45;
        }
        .billing-profile__warnings svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }
        @media (max-width: 860px) {
          .billing-profile__services {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .billing-profile__body {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 520px) {
          .billing-profile__services {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Card>
  );
}

function Service({
  icon,
  label,
  value,
  detail,
  amount,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  amount: number;
}) {
  return (
    <div className="billing-service">
      <div className="billing-service__label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <span className="billing-service__amount">
        {amount > 0 ? formatXof(amount) : "No charge"}
        {detail && <small>{detail}</small>}
      </span>
      <style jsx>{`
        .billing-service {
          min-width: 0;
          padding: 14px 15px;
          border-right: 1px solid var(--divider);
        }
        .billing-service:last-child {
          border-right: 0;
        }
        .billing-service__label {
          display: flex;
          align-items: center;
          gap: 7px;
          color: var(--fg3);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.045em;
          text-transform: uppercase;
        }
        .billing-service__label :global(svg) {
          color: var(--daust-orange);
        }
        .billing-service > strong {
          display: block;
          overflow: hidden;
          margin-top: 9px;
          color: var(--fg1);
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .billing-service__amount {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 7px;
          margin-top: 3px;
          color: var(--fg3);
          font-size: 11.5px;
          font-variant-numeric: tabular-nums;
        }
        .billing-service__amount small {
          color: var(--success-500);
          font-size: 10.5px;
          font-weight: 700;
        }
        @media (max-width: 860px) {
          .billing-service:nth-child(2) {
            border-right: 0;
          }
          .billing-service:nth-child(-n + 2) {
            border-bottom: 1px solid var(--divider);
          }
        }
        @media (max-width: 520px) {
          .billing-service {
            border-right: 0;
            border-bottom: 1px solid var(--divider);
          }
          .billing-service:last-child {
            border-bottom: 0;
          }
        }
      `}</style>
    </div>
  );
}
