"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, UserCheck } from "lucide-react";
import {
  type ApplicantBillingProfileInput,
  type BillingProfileOptions,
  getApplicantBillingProfileOptions,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Badge, Button, Field, Modal, Select, Toggle } from "@/components/ui";

export function ApplicantBillingAcceptanceModal({
  applicant,
  onClose,
  onConfirm,
}: {
  applicant: {
    id: string;
    name: string;
    score: number | null;
    housingPreference?: string | null;
    cafeteriaPreference?: string | null;
  };
  onClose: () => void;
  onConfirm: (billingProfile: ApplicantBillingProfileInput) => Promise<void>;
}) {
  const [options, setOptions] = useState<BillingProfileOptions | null>(null);
  // Prefill from the applicant's own pick when it is still a live option.
  const [housingCode, setHousingCode] = useState(applicant.housingPreference ?? "");
  const [cafeteriaCode, setCafeteriaCode] = useState(applicant.cafeteriaPreference ?? "");
  const [insuranceSelected, setInsuranceSelected] = useState(false);
  const [cautionSelected, setCautionSelected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getApplicantBillingProfileOptions(applicant.id)
      .then((result) => {
        if (!active) return;
        setOptions({
          ...result,
          housingOptions: result.housingOptions.filter(
            (option) => option.active,
          ),
          cafeteriaOptions: result.cafeteriaOptions.filter(
            (option) => option.active,
          ),
        });
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applicant.id]);

  const selectedHousing = options?.housingOptions.find(
    (option) => option.code === housingCode,
  );
  const selectedCafeteria = options?.cafeteriaOptions.find(
    (option) => option.code === cafeteriaCode,
  );
  const housingHasCharge = (selectedHousing?.amountXof ?? 0) > 0;
  const cautionAmountXof =
    cautionSelected && options?.cautionOption
      ? options.cautionOption.percentageBasisPoints != null
        ? Math.round(
            ((selectedHousing?.amountXof ?? 0) *
              options.cautionOption.percentageBasisPoints) /
              10_000,
          )
        : options.cautionOption.amountXof
      : 0;
  const selectedOptionsTotalXof = useMemo(
    () =>
      (selectedHousing?.amountXof ?? 0) +
      (selectedCafeteria?.amountXof ?? 0) +
      (insuranceSelected ? (options?.insuranceOption?.amountXof ?? 0) : 0) +
      cautionAmountXof,
    [
      cautionAmountXof,
      insuranceSelected,
      options?.insuranceOption?.amountXof,
      selectedCafeteria?.amountXof,
      selectedHousing?.amountXof,
    ],
  );
  const valid =
    housingCode.length > 0 &&
    cafeteriaCode.length > 0 &&
    Boolean(
      options?.feeScheduleId &&
      options.feeScheduleRevision > 0 &&
      options.feeScheduleFingerprintSha256 &&
      options.billingCatalogFingerprintSha256,
    );

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (
        !options?.feeScheduleId ||
        !options.feeScheduleFingerprintSha256 ||
        !options.billingCatalogFingerprintSha256
      ) {
        throw new Error(
          "Approved intake pricing is incomplete. Refresh after Finance configures this academic year.",
        );
      }
      await onConfirm({
        academicYearId: options.academicYearId,
        academicYearLabel: options.academicYearLabel,
        feeScheduleId: options.feeScheduleId,
        feeScheduleRevision: options.feeScheduleRevision,
        feeScheduleFingerprintSha256: options.feeScheduleFingerprintSha256,
        billingCatalogFingerprintSha256:
          options.billingCatalogFingerprintSha256,
        housingOptionCode: housingCode,
        cafeteriaOptionCode: cafeteriaCode,
        insuranceSelected,
        cautionSelected,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not accept this applicant.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Accept applicant and prepare billing"
      width={650}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<UserCheck size={15} />}
            disabled={loading || busy || !valid}
            onClick={submit}
          >
            {busy ? "Preparing…" : "Accept and prepare payment"}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading the approved annual options…
        </p>
      ) : options ? (
        <div className="acceptance-profile">
          <div className="acceptance-profile__impact">
            <span>
              <strong>{applicant.name}</strong>
              <small>
                Permanent Student ID · payment-pending access until Finance
                verifies the enrollment cash threshold
              </small>
            </span>
            <Badge tone="navy">{options.academicYearLabel}</Badge>
          </div>

          {error && (
            <p role="alert" className="acceptance-profile__error">
              {error}
            </p>
          )}

          <div className="acceptance-profile__grid">
            <Field
              label="Housing"
              hint="The room assignment can change later without silently changing this price."
            >
              <Select
                ariaLabel="Housing option"
                value={housingCode}
                onChange={(code) => {
                  setHousingCode(code);
                  const selected = options.housingOptions.find(
                    (option) => option.code === code,
                  );
                  if (!selected || selected.amountXof <= 0) {
                    setCautionSelected(false);
                  }
                }}
                options={[
                  { value: "", label: "— Select housing —" },
                  ...options.housingOptions.map((option) => ({
                    value: option.code,
                    label: `${option.label} · ${formatXof(option.amountXof)}`,
                  })),
                ]}
              />
            </Field>
            <Field
              label="Cafeteria"
              hint="Only active options from the approved annual catalog are selectable."
            >
              <Select
                ariaLabel="Cafeteria plan"
                value={cafeteriaCode}
                onChange={setCafeteriaCode}
                options={[
                  { value: "", label: "— Select cafeteria —" },
                  ...options.cafeteriaOptions.map((option) => ({
                    value: option.code,
                    label: `${option.label} · ${formatXof(option.amountXof)}`,
                  })),
                ]}
              />
            </Field>
          </div>

          <div className="acceptance-profile__toggles">
            <Toggle
              checked={insuranceSelected}
              disabled={!options.insuranceOption}
              onChange={setInsuranceSelected}
              label={
                options.insuranceOption
                  ? `${options.insuranceOption.label} · ${formatXof(options.insuranceOption.amountXof)}`
                  : "Insurance unavailable"
              }
            />
            <Toggle
              checked={cautionSelected}
              disabled={!options.cautionOption || !housingHasCharge}
              onChange={setCautionSelected}
              label={
                options.cautionOption
                  ? `${options.cautionOption.label}${options.cautionOption.percentageBasisPoints != null ? ` · ${options.cautionOption.percentageBasisPoints / 100}%` : ""} · ${formatXof(cautionAmountXof)} refundable`
                  : "Housing caution unavailable"
              }
            />
          </div>

          <div className="acceptance-profile__award">
            <BadgeCheck size={19} aria-hidden="true" />
            <span>
              <strong>BAC award policy applies automatically</strong>
              <small>
                {applicant.score != null
                  ? `Recorded BAC score: ${applicant.score}. The server will select the approved merit definition and snapshot it on the invoice.`
                  : "No BAC score is recorded. The server will apply only awards supported by the accepted applicant record."}
              </small>
            </span>
          </div>

          <div className="acceptance-profile__preview">
            <span>
              <small>
                Selected services
                {cautionSelected ? " and refundable caution" : ""} before
                tuition and awards
              </small>
              <strong>{formatXof(selectedOptionsTotalXof)}</strong>
            </span>
            <p>
              Finance creates the canonical enrollment invoice from the approved
              fee schedule. Students and guardians can review this profile but
              cannot change it.
            </p>
          </div>
        </div>
      ) : (
        <p role="alert" style={{ margin: 0, color: "var(--danger)" }}>
          {error ?? "Approved annual options are unavailable."}
        </p>
      )}

      <style jsx>{`
        .acceptance-profile {
          display: grid;
          gap: 18px;
        }
        .acceptance-profile__impact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 12px 13px;
          border-radius: var(--radius-md);
          background: var(--bg-tint);
        }
        .acceptance-profile__impact > span,
        .acceptance-profile__award > span {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .acceptance-profile__impact strong,
        .acceptance-profile__award strong {
          color: var(--fg1);
          font-size: 13px;
        }
        .acceptance-profile__impact small,
        .acceptance-profile__award small {
          color: var(--fg3);
          font-size: 11.5px;
          line-height: 1.45;
        }
        .acceptance-profile__error {
          margin: 0;
          padding: 9px 11px;
          border-radius: var(--radius-md);
          background: color-mix(in srgb, var(--danger) 8%, var(--surface));
          color: var(--danger);
          font-size: 12.5px;
        }
        .acceptance-profile__grid,
        .acceptance-profile__toggles {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .acceptance-profile__toggles {
          padding: 13px;
          border: 1px solid var(--divider);
          border-radius: var(--radius-md);
        }
        .acceptance-profile__award {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 13px;
          border: 1px solid
            color-mix(in srgb, var(--success) 24%, var(--border));
          border-radius: var(--radius-md);
          color: var(--success);
          background: color-mix(in srgb, var(--success) 7%, var(--surface));
        }
        .acceptance-profile__preview {
          display: grid;
          grid-template-columns: minmax(180px, 0.65fr) minmax(0, 1.35fr);
          gap: 18px;
          align-items: center;
          padding-top: 15px;
          border-top: 1px solid var(--divider);
        }
        .acceptance-profile__preview > span {
          display: grid;
          gap: 2px;
        }
        .acceptance-profile__preview small {
          color: var(--fg3);
          font-size: 10.5px;
        }
        .acceptance-profile__preview strong {
          color: var(--daust-navy);
          font-family: var(--font-display);
          font-size: 21px;
          font-variant-numeric: tabular-nums;
        }
        .acceptance-profile__preview p {
          margin: 0;
          color: var(--fg3);
          font-size: 11.5px;
          line-height: 1.55;
        }
        @media (max-width: 560px) {
          .acceptance-profile__grid,
          .acceptance-profile__toggles,
          .acceptance-profile__preview {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Modal>
  );
}
