"use client";

import { useMemo, useState } from "react";
import { Check, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import {
  type AccountInvoice,
  type AvailableFeeComponent,
  type InvoiceFeeComponent,
  addInvoiceFeeComponent,
  removeInvoiceFeeComponent,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, Button, Field } from "@/components/ui";

export function splitAnnualAmount(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function componentKey(component: InvoiceFeeComponent): string {
  return component.key;
}

interface CatalogRow extends AvailableFeeComponent {
  selectedComponent?: InvoiceFeeComponent;
}

type Proposal = {
  mode: "add" | "remove";
  component: CatalogRow;
};

export function InvoiceComponentManager({
  invoice,
  onSubmitted,
}: {
  invoice: AccountInvoice;
  onSubmitted: (message: string) => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = useMemo<CatalogRow[]>(() => {
    const selectedByKey = new Map(
      (invoice.components ?? [])
        .filter((component) => component.selected && component.amountXof > 0)
        .map((component) => [componentKey(component), component]),
    );
    const listed = (invoice.availableComponents ?? []).map((component) => ({
      ...component,
      selected: selectedByKey.has(component.key) || component.selected,
      selectedComponent: selectedByKey.get(component.key),
    }));
    const listedKeys = new Set(listed.map((component) => component.key));
    for (const component of invoice.components ?? []) {
      if (!component.selected || component.amountXof <= 0) continue;
      const key = componentKey(component);
      if (listedKeys.has(key)) continue;
      listed.push({
        id: component.id,
        key,
        label: component.label,
        description: null,
        costCenterCode: component.costCenterCode,
        annualAmountXof: component.amountXof,
        defaultSelected: false,
        sortOrder: listed.length,
        selected: true,
        invoiceComponentId: component.id,
        allocatedXof: component.allocatedXof,
        selectedComponent: component,
      });
    }
    return listed.sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label),
    );
  }, [invoice.availableComponents, invoice.components]);

  const componentDataAvailable =
    invoice.components !== undefined ||
    invoice.availableComponents !== undefined;
  const currentTotal = componentDataAvailable
    ? catalog.reduce(
        (sum, component) =>
          sum +
          (component.selected
            ? (component.selectedComponent?.amountXof ??
              component.annualAmountXof)
            : 0),
        0,
      )
    : invoice.total;
  const delta = proposal
    ? (proposal.mode === "add" ? 1 : -1) *
      (proposal.component.selectedComponent?.amountXof ??
        proposal.component.annualAmountXof)
    : 0;
  const proposedTotal = currentTotal + delta;
  const installments = [...invoice.installments].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const projectedAmounts = splitAnnualAmount(
    proposedTotal,
    Math.max(installments.length, 1),
  );
  const paidFloorFailure =
    proposal?.mode === "remove"
      ? installments.find(
          (installment, index) =>
            (projectedAmounts[index] ?? 0) < installment.amountPaid,
        )
      : undefined;
  const allocatedAmount =
    proposal?.component.selectedComponent?.allocatedXof ?? 0;
  const unsafeRemoval =
    proposal?.mode === "remove" &&
    (allocatedAmount > 0 || proposedTotal < invoice.paid || !!paidFloorFailure);
  const cannotSubmit =
    busy ||
    !proposal ||
    !reason.trim() ||
    unsafeRemoval ||
    invoice.hasPendingPlanChange;

  function choose(mode: Proposal["mode"], component: CatalogRow) {
    setProposal({ mode, component });
    setReason("");
    setError(null);
  }

  async function submit() {
    if (!proposal || cannotSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        proposal.mode === "add"
          ? await addInvoiceFeeComponent(
              invoice.id,
              proposal.component.key,
              reason.trim(),
            )
          : await removeInvoiceFeeComponent(
              invoice.id,
              proposal.component.key,
              reason.trim(),
            );
      const verb = proposal.mode === "add" ? "addition" : "removal";
      onSubmitted(
        result.applied
          ? `Component ${verb} approved and applied`
          : `Component ${verb} submitted for administrator approval`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit the component change.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!componentDataAvailable) {
    return (
      <div className="fee-component-legacy-note">
        <ShieldCheck size={17} aria-hidden />
        <span>
          Component details are unavailable for this legacy charge. Its existing
          payment schedule can still be reviewed below.
        </span>
      </div>
    );
  }

  return (
    <section
      className="invoice-component-manager"
      aria-labelledby="components-title"
    >
      <div className="invoice-component-head">
        <div>
          <h4 id="components-title">Annual charges</h4>
          <p>
            Charges set the total. The total is then divided across this
            student&apos;s payment dates.
          </p>
        </div>
        <strong>{formatXof(currentTotal)}</strong>
      </div>

      {invoice.hasIndividualComponentOverride && (
        <div className="fee-component-pending" role="status">
          <Badge tone="info">Individual selection</Badge>
          <span>
            This student&apos;s included charges differ from the standard
            package; approved global prices still flow through.
          </span>
        </div>
      )}

      {invoice.hasPendingPlanChange && (
        <div className="fee-component-pending" role="status">
          <Badge tone="warning">Approval pending</Badge>
          <span>
            Finish the current request before proposing another account change.
          </span>
        </div>
      )}

      <div className="fee-component-list">
        {catalog.map((component) => {
          const amount =
            component.selectedComponent?.amountXof ?? component.annualAmountXof;
          const allocated = component.selectedComponent?.allocatedXof ?? 0;
          const removeBlocked =
            allocated > 0 ||
            currentTotal - amount < invoice.paid ||
            installments.some(
              (installment, index) =>
                (splitAnnualAmount(
                  currentTotal - amount,
                  Math.max(installments.length, 1),
                )[index] ?? 0) < installment.amountPaid,
            );
          return (
            <div className="fee-component-row" key={component.key}>
              <span
                className={`fee-component-marker${component.selected ? " selected" : ""}`}
                aria-hidden
              >
                {component.selected ? <Check size={13} /> : <Plus size={13} />}
              </span>
              <span className="fee-component-copy">
                <strong>{component.label}</strong>
                <small>
                  {component.description ||
                    `Cost center ${component.costCenterCode}`}
                </small>
                {component.selected && removeBlocked && (
                  <small style={{ color: "var(--warning)" }}>
                    Protected by payment already received
                  </small>
                )}
              </span>
              <span className="fee-component-money">
                <strong>{formatXof(amount)}</strong>
                {allocated > 0 && (
                  <small>{formatXof(allocated)} allocated</small>
                )}
              </span>
              <Button
                size="sm"
                variant={component.selected ? "ghost" : "secondary"}
                disabled={
                  invoice.hasPendingPlanChange ||
                  (component.selected && removeBlocked)
                }
                title={
                  component.selected && removeBlocked
                    ? "This charge has paid allocations or removing it would put an installment below its paid amount."
                    : undefined
                }
                onClick={() =>
                  choose(component.selected ? "remove" : "add", component)
                }
              >
                {component.selected ? "Remove" : "Add"}
              </Button>
            </div>
          );
        })}
      </div>

      {catalog.length === 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          No approved charge components are available for this academic year.
        </p>
      )}

      {proposal && (
        <div className="fee-component-proposal">
          <div className="fee-component-proposal-title">
            <span>
              {proposal.mode === "add" ? "Add" : "Remove"}{" "}
              <strong>{proposal.component.label}</strong>
            </span>
            <button
              type="button"
              onClick={() => setProposal(null)}
              aria-label="Clear component proposal"
            >
              <RotateCcw size={14} /> Clear
            </button>
          </div>

          <div className="fee-component-total-change">
            <span>
              Current total <strong>{formatXof(currentTotal)}</strong>
            </span>
            <span aria-hidden>→</span>
            <span>
              Proposed total <strong>{formatXof(proposedTotal)}</strong>
            </span>
          </div>

          <div
            className="fee-split-preview"
            aria-label="Proposed installment split"
          >
            {(installments.length ? installments : [null]).map(
              (installment, index) => (
                <div key={installment?.id ?? "single"}>
                  <span>
                    {installment?.label ?? `Payment ${index + 1}`}
                    <small>
                      {installment
                        ? formatDate(installment.dueDate)
                        : "One payment"}
                    </small>
                  </span>
                  <strong>{formatXof(projectedAmounts[index] ?? 0)}</strong>
                  {(installment?.amountPaid ?? 0) > 0 && (
                    <small>
                      {formatXof(installment?.amountPaid ?? 0)} paid
                    </small>
                  )}
                </div>
              ),
            )}
          </div>

          {unsafeRemoval && (
            <p className="fee-component-error" role="alert">
              This charge cannot be removed because payment has already been
              allocated to it or the resulting schedule would be lower than the
              amount already paid.
            </p>
          )}
          {error && (
            <p className="fee-component-error" role="alert">
              {error}
            </p>
          )}

          <Field
            label="Reason for this student’s exception"
            hint="The administrator sees this reason with the before-and-after totals."
          >
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Explain why this annual charge should change"
            />
          </Field>
          <div className="fee-component-submit">
            <span>
              One component change can be reviewed at a time. The exception
              remains while later approved global fees and amounts continue to
              apply.
            </span>
            <Button variant="primary" disabled={cannotSubmit} onClick={submit}>
              {busy ? "Submitting…" : "Submit for approval"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
