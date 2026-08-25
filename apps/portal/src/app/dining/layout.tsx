import { PortalShell } from "@/components/PortalShell";

/**
 * The dining console is its own area rather than a corner of finance: cafeteria staff read
 * meal plans and a student's overdue total, and nothing else. Putting it under /finance would
 * hand them the bursar sidebar — student accounts, payment reviews, the approval queue.
 */
export default function DiningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell portal="dining" requiresAnyRole={["dining", "admin"]}>
      {children}
    </PortalShell>
  );
}
