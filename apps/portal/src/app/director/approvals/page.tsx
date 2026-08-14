"use client";

import { ApprovalRequestList } from "@/components/ApprovalRequestList";
import { PageHeader } from "@/components/ui";

export default function DirectorApprovalsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Director · Change control"
        title="Approvals"
        subtitle="Review protected budgets, management actuals, fees and payment schedules before they affect institutional records."
      />
      <ApprovalRequestList mode="director" />
    </>
  );
}
