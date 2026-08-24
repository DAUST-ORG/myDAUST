import { PortalShell } from "@/components/PortalShell";

/**
 * Every screen here except Users is admin-only, and Users is shared with IT. An it_admin
 * therefore gets the IT sidebar rather than a director one whose every other entry 403s.
 * Nesting a second PortalShell under this layout would render two shells, so the choice
 * has to happen here.
 */
export default function DirectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell portal="director" requiresAnyRole={["admin"]}>
      {children}
    </PortalShell>
  );
}
