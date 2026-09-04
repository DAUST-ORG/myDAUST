"use client";

import { ApprovalRequestList } from "@/components/ApprovalRequestList";
import { PageHeader } from "@/components/ui";

export default function FinanceRequestsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance · Change control"
        title="My Requests"
        subtitle="Track fee, billing, and payment-plan changes submitted for Director approval."
      />
      <ApprovalRequestList mode="requester" />
    </>
  );
}
