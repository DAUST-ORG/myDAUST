"use client";

import { ApprovalRequestList } from "@/components/ApprovalRequestList";
import { PageHeader } from "@/components/ui";

export default function FinanceRequestsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance · Change control"
        title="My Requests"
        subtitle="Track budget, management actual, fee and payment-plan changes submitted for administrator approval."
      />
      <ApprovalRequestList mode="requester" />
    </>
  );
}
