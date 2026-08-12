"use client";

import { ApprovalRequestList } from "@/components/ApprovalRequestList";
import { PageHeader } from "@/components/ui";

export default function DirectorApprovalsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Director · Change control"
        title="Approvals"
        subtitle="Review protected Finance changes before they affect student accounts or the institution-wide fee schedule."
      />
      <ApprovalRequestList mode="director" />
    </>
  );
}
