"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Check,
  Pencil,
  Percent,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  type FeePlan,
  type ScholarshipBasis,
  type ScholarshipCatalog,
  type ScholarshipDefinitionRow,
  getFeePlan,
  getScholarshipCatalog,
  replaceScholarshipCatalog,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";

/**
 * A fixed award carries its rate in the catalog; a per-student award carries none,
 * so the three rate kinds collapse the server's `rateMode` plus the pct/flat choice
 * into one control and the per-student option removes the rate input entirely.
 */
type RateKind = "pct" | "flat" | "per_student";

interface ScholarshipDraft {
  /** Stable React identity; `key` is regenerated while a new award is being named. */
  uid: string;
  key: string;
  label: string;
  description: string;
  basis: ScholarshipBasis;
  rateKind: RateKind;
  /** Percent as typed, so a half-entered "12." survives a keystroke. */
  pctInput: string;
  flatXof: number;
  costCenterCode: string;
  active: boolean;
  /** Already in the approved catalog: retire it, never delete it. */
  approved: boolean;
}

const SCHOLARSHIP_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_SCHOLARSHIPS = 50;
const MAX_FLAT_XOF = 100_000_000;

const RATE_KIND_OPTIONS = [
  { value: "pct", label: "Percentage of basis" },
  { value: "flat", label: "Flat amount" },
  { value: "per_student", label: "Set per student" },
];
const BASIS_OPTIONS = [
  { value: "tuition", label: "Tuition" },
  { value: "package", label: "Full package" },
];

function toInt(value: string): number {
  return Math.max(0, Math.round(Number(value.replace(/[^\d]/g, "")) || 0));
}

function bpsToPctInput(bps: number | null | undefined): string {
  return bps ? String(parseFloat((bps / 100).toFixed(2))) : "";
}

function pctInputToBps(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function formatPctBps(bps: number): string {
  return `${parseFloat((bps / 100).toFixed(2))}%`;
}

function basisLabel(basis: ScholarshipBasis): string {
  return basis === "package" ? "full package" : "tuition";
}

function rateKindOf(entry: ScholarshipDefinitionRow): RateKind {
  if (entry.rateMode === "per_student") return "per_student";
  return entry.flatXof ? "flat" : "pct";
}

function toDraft(entry: ScholarshipDefinitionRow): ScholarshipDraft {
  return {
    uid: entry.key,
    key: entry.key,
    label: entry.label,
    description: entry.description ?? "",
    basis: entry.basis,
    rateKind: rateKindOf(entry),
    pctInput: bpsToPctInput(entry.pctBps),
    flatXof: entry.flatXof ?? 0,
    costCenterCode: entry.costCenterCode,
    active: entry.active,
    approved: true,
  };
}

function sortedCatalog(
  catalog: ScholarshipCatalog | null,
): ScholarshipDefinitionRow[] {
  return [...(catalog?.scholarships ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Derives a stable key from the label; awards on students reference it forever. */
function keyFromLabel(label: string, taken: Set<string>): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const base = SCHOLARSHIP_KEY.test(slug)
    ? slug
    : `award_${Date.now().toString(36)}`.slice(0, 40);
  let key = base;
  let suffix = 2;
  while (taken.has(key)) {
    key = `${base}_${suffix++}`.slice(0, 40);
  }
  return key;
}

/**
 * What one fixed award is worth today, for orientation only. The bill is priced
 * server-side from the approved schedule, not from this number.
 */
function awardValueXof(
  entry: ScholarshipDefinitionRow,
  amounts: { tuition: number; package: number } | null,
): number | null {
  if (!amounts || entry.rateMode !== "fixed") return null;
  if (entry.flatXof) return entry.flatXof;
  if (!entry.pctBps) return null;
  const basis = entry.basis === "package" ? amounts.package : amounts.tuition;
  return basis ? Math.round((basis * entry.pctBps) / 10_000) : null;
}

function basisAmounts(
  plan: FeePlan | null,
): { tuition: number; package: number } | null {
  if (!plan) return null;
  const components = plan.components ?? [];
  const included = components.reduce(
    (sum, component) =>
      sum + (component.defaultSelected ? component.annualAmountXof : 0),
    0,
  );
  return {
    tuition:
      components.find((component) => component.key === "tuition")
        ?.annualAmountXof ?? plan.totals.tuition,
    package: plan.packageTotalXof || included || plan.totals.full,
  };
}

function rateSummary(entry: ScholarshipDefinitionRow): string {
  if (entry.rateMode === "per_student") return "Set per student";
  if (entry.pctBps) return formatPctBps(entry.pctBps);
  if (entry.flatXof) return formatXof(entry.flatXof);
  return "—";
}

function draftError(drafts: ScholarshipDraft[]): string | null {
  if (drafts.length > MAX_SCHOLARSHIPS) {
    return `A fee schedule carries at most ${MAX_SCHOLARSHIPS} awards.`;
  }
  const keys = new Set<string>();
  for (const draft of drafts) {
    const duplicate = keys.has(draft.key);
    keys.add(draft.key);
    if (duplicate || !SCHOLARSHIP_KEY.test(draft.key)) {
      return `${draft.label || "An award"} does not have a unique identifier.`;
    }
    const label = draft.label.trim();
    if (!label || label.length > 80) {
      return "Every award needs a name of 1 to 80 characters.";
    }
    const costCenter = draft.costCenterCode.trim();
    if (!costCenter || costCenter.length > 8) {
      return `${label} needs a cost center of 1 to 8 characters.`;
    }
    if (draft.description.trim().length > 240) {
      return `${label} has a description longer than 240 characters.`;
    }
    if (draft.rateKind === "pct") {
      const bps = pctInputToBps(draft.pctInput);
      if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) {
        return `${label} needs a percentage between 0.01 and 100.`;
      }
    }
    if (
      draft.rateKind === "flat" &&
      (draft.flatXof < 1 || draft.flatXof > MAX_FLAT_XOF)
    ) {
      return `${label} needs a flat amount between 1 and ${formatXof(MAX_FLAT_XOF)}.`;
    }
  }
  return null;
}

function toPayload(drafts: ScholarshipDraft[]) {
  return drafts.map((draft, sortOrder) => ({
    key: draft.key,
    label: draft.label.trim(),
    description: draft.description.trim() || undefined,
    basis: draft.basis,
    rateMode:
      draft.rateKind === "per_student"
        ? ("per_student" as const)
        : ("fixed" as const),
    pctBps:
      draft.rateKind === "pct" ? pctInputToBps(draft.pctInput) : undefined,
    flatXof: draft.rateKind === "flat" ? draft.flatXof : undefined,
    costCenterCode: draft.costCenterCode.trim(),
    active: draft.active,
    sortOrder,
  }));
}

export default function ScholarshipsPage() {
  const [catalog, setCatalog] = useState<ScholarshipCatalog | null>(null);
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<ScholarshipDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    getScholarshipCatalog()
      .then((next) => {
        setCatalog(next);
        setError(null);
      })
      .catch((caught: Error) => setError(caught.message));
    // The fee plan only supplies the indicative FCFA values; the screen works without it.
    getFeePlan()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);
  useEffect(load, [load]);

  const awards = useMemo(() => sortedCatalog(catalog), [catalog]);
  const amounts = useMemo(() => basisAmounts(plan), [plan]);
  const activeAwards = awards.filter((entry) => entry.active);
  const perStudentAwards = activeAwards.filter(
    (entry) => entry.rateMode === "per_student",
  );
  const year = catalog?.academicYearLabel ?? plan?.academicYearLabel ?? "";

  function openEditor() {
    setDrafts(awards.map(toDraft));
    setReason("");
    setModalError(null);
    setNote(null);
    setOpen(true);
  }

  function editDraft(index: number, patch: Partial<ScholarshipDraft>) {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function addDraft() {
    setDrafts((current) => [
      ...current,
      {
        uid: `new_${current.length}_${Date.now().toString(36)}`,
        key: keyFromLabel("", new Set(current.map((draft) => draft.key))),
        label: "",
        description: "",
        basis: "tuition",
        rateKind: "pct",
        pctInput: "",
        flatXof: 0,
        costCenterCode: "9100",
        active: true,
        approved: false,
      },
    ]);
  }

  function removeDraft(index: number) {
    setDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index),
    );
  }

  /** A new award keeps its key in step with its name until it is submitted. */
  function renameDraft(index: number, label: string) {
    setDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== index) return draft;
        if (draft.approved) return { ...draft, label };
        const taken = new Set(
          current
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => other.key),
        );
        return { ...draft, label, key: keyFromLabel(label, taken) };
      }),
    );
  }

  async function saveCatalog() {
    if (!reason.trim()) {
      setModalError("Explain why the award catalog is changing.");
      return;
    }
    const invalid = draftError(drafts);
    if (invalid) {
      setModalError(invalid);
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      const result = await replaceScholarshipCatalog({
        academicYearLabel: year || undefined,
        reason: reason.trim(),
        scholarships: toPayload(drafts),
      });
      setOpen(false);
      setNote(
        result.applied
          ? "Award catalog approved and applied. New awards can be granted from it immediately."
          : "Award catalog revision submitted for administrator approval. The awards students already carry are unchanged until approval.",
      );
      if (result.applied) load();
    } catch (caught) {
      setModalError(
        caught instanceof Error
          ? caught.message
          : "Could not update the award catalog.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !catalog) {
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title="Scholarships & Awards"
        subtitle={`Define what each award takes off, on what basis, and where the credit books${year ? ` · ${year}` : ""}`}
        actions={
          catalog ? (
            <Button
              variant="navy"
              icon={<Pencil size={15} />}
              onClick={openEditor}
            >
              Edit awards
            </Button>
          ) : undefined
        }
      />

      {note && (
        <p className="card" role="status" style={{ color: "var(--success)" }}>
          {note}
        </p>
      )}
      {error && catalog && (
        <p className="card" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {!catalog && <p className="muted">Loading…</p>}

      {catalog && awards.length === 0 && (
        <EmptyState
          icon={<Award size={26} />}
          title="No awards defined for this fee schedule"
          note="Add the merit mentions, discounts and subsidies your students receive so they stop being retyped per account."
          action={
            <Button
              variant="navy"
              icon={<Plus size={15} />}
              onClick={openEditor}
            >
              Add the first award
            </Button>
          }
        />
      )}

      {catalog && awards.length > 0 && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Awards offered"
              value={activeAwards.length}
              sub={`${awards.length - activeAwards.length} retired`}
              icon={<Award size={16} />}
            />
            <Stat
              label="Rate set per student"
              value={perStudentAwards.length}
              sub="the rest carry a catalog rate"
              icon={<UserRound size={16} />}
            />
            <Stat
              label="Approved revision"
              value={catalog.revision ?? plan?.revision ?? "—"}
              sub={year || "Active academic year"}
              icon={<Check size={16} />}
            />
          </div>

          <div className="fee-page-grid">
            <Card
              title="Award catalog"
              action={<Badge tone="success">Source of student awards</Badge>}
            >
              <p
                className="muted"
                style={{ margin: "-4px 0 10px", fontSize: 12 }}
              >
                A retired award stays here for the records it already priced,
                but cannot be granted to anyone new.
              </p>
              <div className="fee-component-list">
                {awards.map((entry) => {
                  const value = awardValueXof(entry, amounts);
                  return (
                    <div className="fee-component-row" key={entry.key}>
                      <span
                        className={`fee-component-marker${entry.active ? " selected" : ""}`}
                        aria-hidden
                      >
                        {entry.rateMode === "per_student" ? (
                          <UserRound size={13} />
                        ) : (
                          <Percent size={13} />
                        )}
                      </span>
                      <span className="fee-component-copy">
                        <strong>{entry.label}</strong>
                        <small>
                          {entry.description ||
                            `Cost center ${entry.costCenterCode}`}
                        </small>
                        <small className="scholarship-key">{entry.key}</small>
                      </span>
                      <span className="fee-component-money">
                        <strong>{rateSummary(entry)}</strong>
                        <small>
                          {entry.rateMode === "per_student"
                            ? `of ${basisLabel(entry.basis)}, rate on the award`
                            : value !== null
                              ? `≈ ${formatXof(value)} of ${basisLabel(entry.basis)}`
                              : `of ${basisLabel(entry.basis)}`}
                        </small>
                      </span>
                      <Badge tone={entry.active ? "success" : "neutral"}>
                        {entry.active ? "Offered" : "Retired"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card
              title="How a rate is set"
              action={<Badge tone="navy">Reference</Badge>}
            >
              <div className="scholarship-basis-legend">
                <div>
                  <strong>Catalog rate</strong>
                  <small>
                    The percentage or flat amount lives here and applies to
                    every student who receives the award. Change it once and
                    every new bill follows.
                  </small>
                </div>
                <div>
                  <strong>Set per student</strong>
                  <small>
                    The catalog defines the award and where it books; the rate
                    is entered on each student&apos;s award, because it is
                    negotiated case by case.
                  </small>
                </div>
                {amounts && (
                  <>
                    <div>
                      <strong>Tuition basis</strong>
                      <em>{formatXof(amounts.tuition)}</em>
                      <small>
                        A tuition-basis award is a share of this figure.
                      </small>
                    </div>
                    <div>
                      <strong>Package basis</strong>
                      <em>{formatXof(amounts.package)}</em>
                      <small>
                        A package-basis award is a share of the full annual
                        package, housing and cafeteria included.
                      </small>
                    </div>
                  </>
                )}
              </div>
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 11 }}>
                FCFA figures shown against each award are indicative. Bills are
                priced from the approved schedule at the moment they are raised.
              </p>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit scholarships & awards"
        width={880}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={busy}
              onClick={saveCatalog}
            >
              {busy ? "Submitting…" : "Submit revision"}
            </Button>
          </>
        }
      >
        <div className="fee-component-pending" style={{ marginBottom: 18 }}>
          <Award size={16} aria-hidden />
          <span>
            This is an institution-wide change for{" "}
            <strong>{year || "the active year"}</strong>. A bursar submission
            requires administrator approval; nothing here changes a student
            account until it is approved.
          </span>
        </div>
        {modalError && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {modalError}
          </p>
        )}

        <section aria-labelledby="award-catalog-heading">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 6,
            }}
          >
            <div>
              <h4 id="award-catalog-heading" style={{ margin: 0 }}>
                Awards offered
              </h4>
              <p
                className="muted"
                style={{ margin: "3px 0 0", fontSize: 11.5 }}
              >
                Retire an award by clearing Offered. It keeps pricing the bills
                it already touched and stops being grantable.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={addDraft}
            >
              Add award
            </Button>
          </div>

          {drafts.map((draft, index) => (
            <div className="scholarship-editor-grid" key={draft.uid}>
              <Field label="Award name">
                <Input
                  value={draft.label}
                  onChange={(value) => renameDraft(index, value)}
                  placeholder="e.g. Mention Bien"
                />
              </Field>
              <Field label="Applies to">
                <Select
                  value={draft.basis}
                  options={BASIS_OPTIONS}
                  ariaLabel={`Basis for ${draft.label || "the new award"}`}
                  onChange={(value) =>
                    editDraft(index, { basis: value as ScholarshipBasis })
                  }
                />
              </Field>
              <Field label="Rate type">
                <Select
                  value={draft.rateKind}
                  options={RATE_KIND_OPTIONS}
                  ariaLabel={`Rate type for ${draft.label || "the new award"}`}
                  onChange={(value) =>
                    editDraft(index, { rateKind: value as RateKind })
                  }
                />
              </Field>
              {draft.rateKind === "per_student" ? (
                <div className="scholarship-rate-note">
                  <strong>No catalog rate</strong>
                  <span>Entered on each student&apos;s award.</span>
                </div>
              ) : draft.rateKind === "pct" ? (
                <Field label="Percentage" hint="of the basis">
                  <Input
                    value={draft.pctInput}
                    onChange={(value) =>
                      editDraft(index, {
                        pctInput: value.replace(/[^\d.,]/g, "").slice(0, 6),
                      })
                    }
                    inputMode="decimal"
                    align="right"
                    placeholder="15"
                  />
                </Field>
              ) : (
                <Field label="Flat amount" hint="FCFA">
                  <Input
                    value={draft.flatXof || ""}
                    onChange={(value) =>
                      editDraft(index, { flatXof: toInt(value) })
                    }
                    inputMode="numeric"
                    align="right"
                  />
                </Field>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 38,
                }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  title={
                    draft.approved
                      ? "An approved award is retired, not deleted, so the records it already priced still resolve."
                      : "Discard this new award"
                  }
                  disabled={draft.approved}
                  onClick={() => removeDraft(index)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>

              <div className="scholarship-editor-meta">
                <Field label="Cost center">
                  <Input
                    value={draft.costCenterCode}
                    onChange={(value) =>
                      editDraft(index, { costCenterCode: value.slice(0, 8) })
                    }
                    placeholder="9100"
                  />
                </Field>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 38,
                    color: "var(--fg2)",
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      editDraft(index, { active: event.target.checked })
                    }
                  />
                  Offered
                </label>
                <label style={{ display: "grid", gap: 5 }}>
                  <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>
                    Description (optional)
                  </span>
                  <input
                    value={draft.description}
                    onChange={(event) =>
                      editDraft(index, {
                        description: event.target.value.slice(0, 240),
                      })
                    }
                    maxLength={240}
                    placeholder="Describe who qualifies for this award"
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="fee-component-total-change" style={{ marginTop: 12 }}>
            <span>
              Awards offered{" "}
              <strong>{drafts.filter((draft) => draft.active).length}</strong>
            </span>
            <span className="muted">
              {
                drafts.filter((draft) => draft.rateKind === "per_student")
                  .length
              }{" "}
              of {drafts.length} have their rate set per student
            </span>
          </div>
        </section>

        <Field
          label="Reason for revision"
          hint="Included in the administrator approval record with the before-and-after catalog."
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Explain why the award catalog is changing"
          />
        </Field>
      </Modal>
    </>
  );
}
