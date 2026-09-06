"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  type ApprovalRequestRow,
  type BillingProfileView,
  listApprovalRequests,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { BillingProfileSummary } from "@/components/BillingProfileSummary";
import { Badge, Button, Card } from "@/components/ui";

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
  profile,
  canEdit,
  onEdit,
}: {
  studentId: string;
  profile: BillingProfileView | null | undefined;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [pending, setPending] = useState<ApprovalRequestRow | null>(null);
  const [checked, setChecked] = useState(false);

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

  // The rail allows exactly one open billing_profile request per student, so a
  // second one is refused only after the whole form has been filled in. Say so
  // before that happens.
  const blocked = Boolean(pending);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <BillingProfileSummary
        profile={profile}
        title="Annual services"
        action={
          canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil size={14} />}
              disabled={blocked || !checked}
              title={
                blocked
                  ? "A change for this student is already awaiting Director approval"
                  : undefined
              }
              onClick={onEdit}
            >
              Change services
            </Button>
          ) : undefined
        }
      />

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
    </div>
  );
}
