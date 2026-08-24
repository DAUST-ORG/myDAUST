import { PortalShell } from "@/components/PortalShell";

/**
 * The admissions office is its own area rather than a corner of the registrar console: the
 * role reaches the applicant pipeline and nothing else, so the registrar sidebar would be a
 * list of links that 403.
 */
export default function AdmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell portal="admissions">{children}</PortalShell>;
}
