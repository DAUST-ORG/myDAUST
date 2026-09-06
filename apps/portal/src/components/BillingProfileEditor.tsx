"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Send } from "lucide-react";
import {
  type BillingProfileOptions,
  type BillingProfileView,
  getAdminBillingProfile,
  getBillingProfileOptions,
  requestBillingProfileChange,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import { BillingProfileSummary } from "@/components/BillingProfileSummary";

interface ManualAdjustmentDraft {
  key: string;
  definitionId: string;
  label: string;
  amount: string;
  reason: string;
}

function signedWholeXof(value: string): number | null {
  const normalized = value.replace(/\s/g, "");
  if (!/^-?\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount !== 0 ? amount : null;
}

/**
 * Never invent a selection.
 *
 * Falling back to "none" here used to present a student who is billed for
 * housing as having none, so an unrelated edit silently proposed removing it.
 * A caller that knows the student's real state passes it as `fallback`;
 * otherwise this returns "" and the form stays unsubmittable until a human
 * chooses, which is the honest outcome.
 */
function defaultCode(
  current: string | undefined,
  options: { code: string; label: string }[],
  fallback?: string,
) {
  for (const candidate of [current, fallback]) {
    if (candidate && options.some((option) => option.code === candidate)) {
      return candidate;
    }
  }
  return "";
}

export function BillingProfileEditor({
  student,
  onClose,
  onSubmitted,
  fallbackSelection,
}: {
  student: { id: string; name: string; studentNo: string };
  onClose: () => void;
  onSubmitted: (message: string) => void;
  /**
   * What the student is actually billed for, when no annual profile row exists
   * yet. Most students predate the profile model: their services live only as
   * charges on the invoice, and without this the form cannot tell "no housing"
   * from "housing recorded the old way".
   */
  fallbackSelection?: {
    housingCode?: string;
    cafeteriaCode?: string;
    insuranceSelected?: boolean;
    cautionSelected?: boolean;
  };
}) {
  const {
    housingCode: fallbackHousingCode,
    cafeteriaCode: fallbackCafeteriaCode,
    insuranceSelected: fallbackInsuranceSelected,
    cautionSelected: fallbackCautionSelected,
  } = fallbackSelection ?? {};
  const [profile, setProfile] = useState<BillingProfileView | null>(null);
  const [options, setOptions] = useState<BillingProfileOptions | null>(null);
  const [housingCode, setHousingCode] = useState("");
  const [cafeteriaCode, setCafeteriaCode] = useState("");
  const [insuranceSelected, setInsuranceSelected] = useState(false);
  const [cautionSelected, setCautionSelected] = useState(false);
  const [awardIds, setAwardIds] = useState<string[]>([]);
  const [manualAdjustments, setManualAdjustments] = useState<
    ManualAdjustmentDraft[]
  >([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getAdminBillingProfile(student.id)
      .then(async (current) => ({
        current,
        choices: await getBillingProfileOptions(
          current?.academicYearLabel ?? undefined,
        ),
      }))
      .then(({ current, choices }) => {
        if (!active) return;
        const housing = choices.housingOptions.filter(
          (option) => option.active,
        );
        const cafeteria = choices.cafeteriaOptions.filter(
          (option) => option.active,
        );
        const awardDefinitions = choices.awardDefinitions.filter(
          (definition) => definition.active,
        );
        setProfile(current);
        setOptions({
          ...choices,
          housingOptions: housing,
          cafeteriaOptions: cafeteria,
          awardDefinitions,
        });
        setHousingCode(
          defaultCode(current?.housing?.code, housing, fallbackHousingCode),
        );
        setCafeteriaCode(
          defaultCode(
            current?.cafeteria?.code,
            cafeteria,
            fallbackCafeteriaCode,
          ),
        );
        setInsuranceSelected(
          current?.insurance.selected ?? fallbackInsuranceSelected ?? false,
        );
        setCautionSelected(
          current?.caution.selected ?? fallbackCautionSelected ?? false,
        );
        setAwardIds(
          awardDefinitions
            .filter(
              (definition) =>
                definition.calculation !== "manual" &&
                current?.awards.some((award) => award.code === definition.code),
            )
            .map((definition) => definition.id),
        );
        const definitionByCode = new Map(
          awardDefinitions.map((definition) => [definition.code, definition]),
        );
        const retainedManualAwards = (current?.awards ?? []).flatMap(
          (award) => {
            if (award.calculation !== "manual") return [];
            const definition = definitionByCode.get(award.code);
            if (!definition || definition.calculation !== "manual") return [];
            return [
              {
                key: window.crypto.randomUUID(),
                definitionId: definition.id,
                label: definition.label,
                amount: String(
                  award.effect === "discount"
                    ? -Math.abs(award.amountXof)
                    : Math.abs(award.amountXof),
                ),
                reason:
                  award.reason ??
                  `Retain current approved ${definition.label} adjustment`,
              },
            ];
          },
        );
        const retainedGenericAdjustments = (current?.adjustments ?? []).map(
          (adjustment) => ({
            key: window.crypto.randomUUID(),
            definitionId: "",
            label: adjustment.label,
            amount: String(adjustment.amountXof),
            reason:
              adjustment.reason ??
              `Retain current reviewed ${adjustment.label} reconciliation`,
          }),
        );
        setManualAdjustments([
          ...retainedManualAwards,
          ...retainedGenericAdjustments,
        ]);
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
  }, [
    student.id,
    fallbackHousingCode,
    fallbackCafeteriaCode,
    fallbackInsuranceSelected,
    fallbackCautionSelected,
  ]);

  const parsedManualAdjustments = useMemo(
    () =>
      manualAdjustments.map((adjustment) => ({
        definitionId: adjustment.definitionId || undefined,
        label: adjustment.label.trim(),
        amountXof: signedWholeXof(adjustment.amount),
        reason: adjustment.reason.trim(),
      })),
    [manualAdjustments],
  );
  const manualDefinitionEffectById = useMemo(
    () =>
      new Map(
        (options?.awardDefinitions ?? [])
          .filter((definition) => definition.calculation === "manual")
          .map((definition) => [definition.id, definition.effect]),
      ),
    [options],
  );
  const manualValid = parsedManualAdjustments.every((adjustment) => {
    const definitionEffect = adjustment.definitionId
      ? manualDefinitionEffectById.get(adjustment.definitionId)
      : null;
    return (
      adjustment.label.length > 0 &&
      adjustment.amountXof !== null &&
      (!definitionEffect ||
        (definitionEffect === "discount"
          ? adjustment.amountXof < 0
          : adjustment.amountXof > 0)) &&
      adjustment.reason.length > 0
    );
  });
  const valid =
    options !== null &&
    housingCode.length > 0 &&
    cafeteriaCode.length > 0 &&
    reason.trim().length > 0 &&
    manualValid;

  const selectedHousing = options?.housingOptions.find(
    (option) => option.code === housingCode,
  );
  const selectedCafeteria = options?.cafeteriaOptions.find(
    (option) => option.code === cafeteriaCode,
  );
  const housingHasCharge = (selectedHousing?.amountXof ?? 0) > 0;
  const selectedCautionAmountXof =
    cautionSelected && options?.cautionOption
      ? options.cautionOption.percentageBasisPoints != null
        ? Math.round(
            ((selectedHousing?.amountXof ?? 0) *
              options.cautionOption.percentageBasisPoints) /
              10_000,
          )
        : options.cautionOption.amountXof
      : 0;

  function toggleAward(id: string, checked: boolean) {
    setAwardIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((candidate) => candidate !== id),
    );
  }

  function addManualAdjustment() {
    setManualAdjustments((current) => [
      ...current,
      {
        key: window.crypto.randomUUID(),
        definitionId: "",
        label: "",
        amount: "",
        reason: "",
      },
    ]);
  }

  function editManualAdjustment(
    key: string,
    patch: Partial<ManualAdjustmentDraft>,
  ) {
    setManualAdjustments((current) =>
      current.map((adjustment) =>
        adjustment.key === key ? { ...adjustment, ...patch } : adjustment,
      ),
    );
  }

  async function submit() {
    if (!options || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestBillingProfileChange(student.id, {
        academicYearLabel: options.academicYearLabel,
        baseRevision: profile?.revision ?? 0,
        housingOptionCode: housingCode,
        cafeteriaOptionCode: cafeteriaCode,
        insuranceSelected,
        cautionSelected,
        awardDefinitionIds: awardIds,
        ...(parsedManualAdjustments.length
          ? {
              manualAdjustments: parsedManualAdjustments.map((adjustment) => ({
                ...(adjustment.definitionId
                  ? { definitionId: adjustment.definitionId }
                  : {}),
                label: adjustment.label,
                amountXof: adjustment.amountXof!,
                reason: adjustment.reason,
              })),
            }
          : {}),
        reason: reason.trim(),
      });
      onSubmitted(
        result.applied
          ? `Billing profile updated for ${student.name}.`
          : `Billing profile change for ${student.name} was submitted for Director approval.`,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not submit the billing profile change.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Annual profile — ${student.name}`}
      width={760}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send size={15} />}
            disabled={loading || busy || !valid}
            onClick={submit}
          >
            {busy ? "Submitting…" : "Submit for Director approval"}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading approved options…
        </p>
      ) : error && !options ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : options ? (
        <div className="profile-editor">
          <div className="profile-editor__context">
            <span>
              <strong>{student.studentNo}</strong>
              <small>{options.academicYearLabel}</small>
            </span>
            <Badge tone={profile ? "navy" : "warning"}>
              {profile ? `Revision ${profile.revision}` : "New profile"}
            </Badge>
          </div>

          {profile && (
            <BillingProfileSummary
              profile={profile}
              title="Current annual profile"
            />
          )}

          {error && (
            <p className="profile-editor__error" role="alert">
              {error}
            </p>
          )}

          {!loading && (!housingCode || !cafeteriaCode) && (
            <p className="fee-component-error" role="alert">
              This student&apos;s current services could not be determined, so
              nothing is preselected below. Choose each one deliberately —
              submitting a guess here would change what they are billed.
            </p>
          )}

          <section aria-labelledby="service-selections-heading">
            <h4 id="service-selections-heading">Service selections</h4>
            <div className="profile-editor__grid">
              <Field
                label="Housing"
                hint={
                  selectedHousing
                    ? formatXof(selectedHousing.amountXof)
                    : "Select the billed housing type"
                }
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
                hint={
                  selectedCafeteria
                    ? formatXof(selectedCafeteria.amountXof)
                    : "Select an active approved plan"
                }
              >
                <Select
                  ariaLabel="Cafeteria option"
                  value={cafeteriaCode}
                  onChange={setCafeteriaCode}
                  options={[
                    { value: "", label: "— Select cafeteria plan —" },
                    ...options.cafeteriaOptions.map((option) => ({
                      value: option.code,
                      label: `${option.label} · ${formatXof(option.amountXof)}`,
                    })),
                  ]}
                />
              </Field>
            </div>
            <div className="profile-editor__toggles">
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
                    ? `${options.cautionOption.label}${options.cautionOption.percentageBasisPoints != null ? ` · ${options.cautionOption.percentageBasisPoints / 100}%` : ""} · ${formatXof(selectedCautionAmountXof)} refundable`
                    : "Housing caution unavailable"
                }
              />
            </div>
          </section>

          <section aria-labelledby="profile-awards-heading">
            <h4 id="profile-awards-heading">Awards</h4>
            {options.awardDefinitions.filter(
              (definition) => definition.calculation !== "manual",
            ).length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                No active percentage or fixed awards for this academic year.
              </p>
            ) : (
              <div className="profile-editor__awards">
                {options.awardDefinitions
                  .filter((definition) => definition.calculation !== "manual")
                  .map((definition) => {
                    const checked = awardIds.includes(definition.id);
                    return (
                      <label key={definition.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleAward(definition.id, event.target.checked)
                          }
                        />
                        <span>
                          <strong>{definition.label}</strong>
                          <small>
                            {definition.basis.replaceAll("_", " ")} ·{" "}
                            {definition.calculation.replaceAll("_", " ")}
                            {definition.value != null
                              ? ` · ${definition.value}${definition.calculation === "percentage" ? "%" : ""}`
                              : ""}
                          </small>
                        </span>
                        {definition.requiresApproval && (
                          <Badge tone="neutral">Director approval</Badge>
                        )}
                      </label>
                    );
                  })}
              </div>
            )}
          </section>

          <section aria-labelledby="manual-adjustments-heading">
            <div className="profile-editor__section-head">
              <span>
                <h4 id="manual-adjustments-heading">Manual adjustments</h4>
                <small>
                  Select a configured manual discount or charge and enter its
                  reviewed signed amount, or leave the definition blank for a
                  free-form reconciliation. Existing reviewed rows are carried
                  forward unless removed here.
                </small>
              </span>
              <Button
                variant="outline"
                size="sm"
                icon={<Plus size={14} />}
                onClick={addManualAdjustment}
              >
                Add award or adjustment
              </Button>
            </div>
            {manualAdjustments.map((adjustment) => (
              <div key={adjustment.key} className="profile-editor__manual-row">
                <Select
                  ariaLabel="Configured award definition"
                  value={adjustment.definitionId}
                  onChange={(definitionId) => {
                    const definition = options.awardDefinitions.find(
                      (candidate) => candidate.id === definitionId,
                    );
                    const currentAmount = signedWholeXof(adjustment.amount);
                    editManualAdjustment(adjustment.key, {
                      definitionId,
                      label: definition?.label ?? "",
                      ...(definition && currentAmount !== null
                        ? {
                            amount: String(
                              definition.effect === "discount"
                                ? -Math.abs(currentAmount)
                                : Math.abs(currentAmount),
                            ),
                          }
                        : {}),
                    });
                  }}
                  options={[
                    { value: "", label: "Reviewed reconciliation" },
                    ...options.awardDefinitions
                      .filter(
                        (definition) => definition.calculation === "manual",
                      )
                      .map((definition) => ({
                        value: definition.id,
                        label: definition.label,
                      })),
                  ]}
                />
                <Input
                  value={adjustment.label}
                  placeholder="Adjustment label"
                  disabled={Boolean(adjustment.definitionId)}
                  invalid={!adjustment.label.trim()}
                  onChange={(label) =>
                    editManualAdjustment(adjustment.key, { label })
                  }
                />
                <Input
                  value={adjustment.amount}
                  placeholder={
                    manualDefinitionEffectById.get(adjustment.definitionId) ===
                    "charge"
                      ? "e.g. 50000"
                      : "e.g. -50000"
                  }
                  inputMode="numeric"
                  align="right"
                  invalid={
                    signedWholeXof(adjustment.amount) === null ||
                    (manualDefinitionEffectById.get(adjustment.definitionId) ===
                      "discount" &&
                      (signedWholeXof(adjustment.amount) ?? 0) >= 0) ||
                    (manualDefinitionEffectById.get(adjustment.definitionId) ===
                      "charge" &&
                      (signedWholeXof(adjustment.amount) ?? 0) <= 0)
                  }
                  onChange={(amount) =>
                    editManualAdjustment(adjustment.key, { amount })
                  }
                />
                <Input
                  value={adjustment.reason}
                  placeholder="Reviewed reason"
                  invalid={!adjustment.reason.trim()}
                  onChange={(adjustmentReason) =>
                    editManualAdjustment(adjustment.key, {
                      reason: adjustmentReason,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Minus size={14} />}
                  onClick={() =>
                    setManualAdjustments((current) =>
                      current.filter((row) => row.key !== adjustment.key),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </section>

          <Field
            label="Reason for change"
            hint="The Director sees this reason with the before-and-after profile."
          >
            <Textarea
              value={reason}
              rows={3}
              invalid={reason.length > 0 && !reason.trim()}
              placeholder="Explain the approved source or reviewed correction…"
              onChange={setReason}
            />
          </Field>
        </div>
      ) : null}

      <style jsx>{`
        .profile-editor {
          display: grid;
          gap: 22px;
        }
        .profile-editor__context {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 13px;
          border-radius: var(--radius-md);
          background: var(--bg-tint);
        }
        .profile-editor__context > span {
          display: grid;
          gap: 2px;
        }
        .profile-editor__context strong {
          color: var(--daust-navy);
          font-family: var(--font-mono);
          font-size: 12.5px;
        }
        .profile-editor__context small,
        .profile-editor__section-head small {
          color: var(--fg3);
          font-size: 11.5px;
        }
        .profile-editor__error {
          margin: 0;
          padding: 9px 11px;
          border-radius: var(--radius-md);
          background: color-mix(in srgb, var(--danger) 8%, var(--surface));
          color: var(--danger);
          font-size: 12.5px;
        }
        section {
          display: grid;
          gap: 12px;
        }
        h4 {
          margin: 0;
          color: var(--fg1);
          font-family: var(--font-display);
          font-size: 14px;
        }
        .profile-editor__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .profile-editor__toggles {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 11px;
          padding: 12px;
          border: 1px solid var(--divider);
          border-radius: var(--radius-md);
        }
        .profile-editor__awards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .profile-editor__awards label {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          padding: 10px 11px;
          border: 1px solid var(--divider);
          border-radius: var(--radius-md);
          cursor: pointer;
        }
        .profile-editor__awards input {
          width: 16px;
          height: 16px;
          accent-color: var(--daust-navy);
        }
        .profile-editor__awards label > span {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .profile-editor__awards strong {
          color: var(--fg1);
          font-size: 12.5px;
        }
        .profile-editor__awards small {
          overflow: hidden;
          color: var(--fg3);
          font-size: 10.5px;
          text-overflow: ellipsis;
          text-transform: capitalize;
          white-space: nowrap;
        }
        .profile-editor__section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
        }
        .profile-editor__section-head > span {
          display: grid;
          gap: 2px;
        }
        .profile-editor__manual-row {
          display: grid;
          grid-template-columns:
            minmax(150px, 0.9fr) minmax(140px, 1fr) 125px minmax(160px, 1.2fr)
            auto;
          gap: 8px;
          align-items: center;
        }
        @media (max-width: 680px) {
          .profile-editor__grid,
          .profile-editor__toggles,
          .profile-editor__awards {
            grid-template-columns: 1fr;
          }
          .profile-editor__manual-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Modal>
  );
}
