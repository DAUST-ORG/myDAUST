"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  type ApprovalRequestRow,
  type BillingProfileOptions,
  type BillingProfileView,
  type StudentAccount,
  getBillingProfileOptions,
  listApprovalRequests,
} from "@/lib/api";
import { BillingProfileEditor } from "@/components/BillingProfileEditor";
import { formatDateTime } from "@/lib/format";
import { BillingProfileSummary } from "@/components/BillingProfileSummary";
import { Badge, Button, Card } from "@/components/ui";
import { formatXof } from "@/lib/format";

/**
 * What the student is actually billed for, read off the invoice.
 *
 * Most students predate AnnualBillingProfile: their services exist only as
 * charges on the standard package, so the profile read returns null and the
 * editor would otherwise preselect nothing and read as "no housing". Each
 * charged component is matched back to the catalog option carrying that price,
 * which is unambiguous today because amounts are distinct within a kind.
 */
function deriveSelectionFromInvoice(
  account: StudentAccount | null | undefined,
  options: BillingProfileOptions | null,
) {
  if (!account || !options) return undefined;
  const invoice = account.invoices.find(
    (row) => row.packageType === "standard_full" && row.status !== "void",
  );
  if (!invoice) return undefined;
  const charged = new Map(
    (invoice.components ?? [])
      .filter((component) => component.amountXof > 0)
      .map((component) => [component.kind, component.amountXof]),
  );
  const match = (
    kind: string,
    candidates: { code: string; amountXof: number }[],
  ) => {
    const amount = charged.get(kind);
    if (amount === undefined) {
      return candidates.find((option) => option.code === "none")?.code;
    }
    return candidates.find((option) => option.amountXof === amount)?.code;
  };
  return {
    housingCode: match("housing", options.housingOptions),
    cafeteriaCode: match("cafeteria", options.cafeteriaOptions),
    insuranceSelected: (charged.get("insurance") ?? 0) > 0,
    cautionSelected: (charged.get("housing_caution") ?? 0) > 0,
    charged,
  };
}

/**
 * The registrar's way into a student's annual services: housing tier, cafeteria
 * plan, insurance and the housing caution.
 *
 * The editing itself is BillingProfileEditor, mounted by the page. This tab only
 * shows the current selections, whether a change is already queued, and what
 * approving one actually moves — which is more than the bill, so it is worth
 * saying out loud.
 */
export function StudentServicesTab({
  studentId,
  student,
  account,
  profile,
  canEdit,
  onChanged,
}: {
  studentId: string;
  student: { id: string; name: string; studentNo: string };
  account: StudentAccount | null;
  profile: BillingProfileView | null | undefined;
  canEdit: boolean;
  onChanged: (message: string) => void;
}) {
  const [pending, setPending] = useState<ApprovalRequestRow | null>(null);
  const [checked, setChecked] = useState(false);
  const [options, setOptions] = useState<BillingProfileOptions | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    let active = true;
    listApprovalRequests("pending")
      .then((rows) => {
        if (!active) return;
        setPending(
          rows.find(
            (row) =>
              row.kind === "billing_profile" && row.targetId === studentId,
          ) ?? null,
        );
      })
      .catch(() => active && setPending(null))
      .finally(() => active && setChecked(true));
    return () => {
      active = false;
    };
  }, [studentId]);
  useEffect(() => load(), [load]);

  useEffect(() => {
    let active = true;
    getBillingProfileOptions()
      .then((next) => active && setOptions(next))
      .catch(() => active && setOptions(null));
    return () => {
      active = false;
    };
  }, []);

  const derived = deriveSelectionFromInvoice(account, options);
  // A profile row is authoritative when it exists; otherwise fall back to what
  // the invoice says the student is actually paying for.
  const showDerived = !profile && Boolean(derived);

  // The rail allows exactly one open billing_profile request per student, so a
  // second one is refused only after the whole form has been filled in. Say so
  // before that happens.
  const blocked = Boolean(pending);

  const editButton = canEdit ? (
    <Button
      size="sm"
      variant="secondary"
      icon={<Pencil size={14} />}
      disabled={blocked || !checked || !options}
      title={
        blocked
          ? "A change for this student is already awaiting Director approval"
          : undefined
      }
      onClick={() => setEditing(true)}
    >
      Change services
    </Button>
  ) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showDerived && derived ? (
        <Card title="Annual services" action={editButton}>
          <div className="services-derived-grid">
            {[
              {
                label: "Housing",
                option: options?.housingOptions.find(
                  (row) => row.code === derived.housingCode,
                ),
                charged: derived.charged.get("housing") ?? 0,
              },
              {
                label: "Cafeteria",
                option: options?.cafeteriaOptions.find(
                  (row) => row.code === derived.cafeteriaCode,
                ),
                charged: derived.charged.get("cafeteria") ?? 0,
              },
              {
                label: "Insurance",
                option: derived.insuranceSelected
                  ? options?.insuranceOption
                  : undefined,
                charged: derived.charged.get("insurance") ?? 0,
              },
              {
                label: "Housing caution",
                option: derived.cautionSelected
                  ? options?.cautionOption
                  : undefined,
                charged: derived.charged.get("housing_caution") ?? 0,
              },
            ].map((row) => (
              <div key={row.label} className="services-derived-cell">
                <small>{row.label}</small>
                <strong>{row.option?.label ?? "None"}</strong>
                <span>{formatXof(row.charged)}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 11.5 }}>
            Read from the charges already on this student&apos;s bill — they
            have no annual profile record yet. Saving a change creates one.
          </p>
        </Card>
      ) : (
        <BillingProfileSummary
          profile={profile}
          title="Annual services"
          action={editButton}
        />
      )}
      {blocked && pending && (
        <div className="services-pending" role="status">
          <Badge tone="warning">Awaiting Director approval</Badge>
          <span>
            {pending.requester?.name ?? "A colleague"} submitted a change on{" "}
            {formatDateTime(pending.createdAt)}
            {pending.reason ? ` — “${pending.reason}”` : ""}. The Director must
            decide it before another change can be proposed.
          </span>
        </div>
      )}

      <Card title="What changes when this is approved">
        <ul className="services-explainer">
          <li>
            <strong>The annual bill is recomputed.</strong> Charges are replaced
            with the newly selected services, the total and the payment schedule
            move with it, and amounts already paid are preserved.
          </li>
          <li>
            <strong>The meal plan follows the cafeteria choice.</strong>{" "}
            Removing the plan deactivates it; selecting one activates it for the
            year.
          </li>
          <li>
            <strong>The housing record follows the tier.</strong> Selecting
            housing puts the student back in the room queue; removing it clears
            the billed room. An already-assigned room is not given up by a
            pricing change.
          </li>
          <li>
            <strong>The housing caution is derived, not chosen.</strong> It is a
            percentage of whichever housing tier is selected, so changing the
            tier re-prices it. It cannot be kept without housing.
          </li>
        </ul>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 11.5 }}>
          A service cannot be reduced below money already settled against it —
          the request is refused rather than silently lowering a paid charge.
        </p>
      </Card>

      {editing && (
        <BillingProfileEditor
          student={student}
          fallbackSelection={
            derived && {
              housingCode: derived.housingCode,
              cafeteriaCode: derived.cafeteriaCode,
              insuranceSelected: derived.insuranceSelected,
              cautionSelected: derived.cautionSelected,
            }
          }
          onClose={() => setEditing(false)}
          onSubmitted={(message) => {
            setEditing(false);
            load();
            onChanged(message);
          }}
        />
      )}
    </div>
  );
}
