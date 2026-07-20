"use client";

import { AppShell } from "./AppShell";
import { PORTALS, type PortalKey } from "@/lib/nav";

/**
 * Client boundary between a portal's server layout and AppShell.
 *
 * Nav definitions carry Lucide icon components, which are functions and so cannot
 * cross the server/client boundary as props. Layouts therefore pass only a portal
 * key (a plain string) and the nav is resolved here, on the client side of the
 * boundary. This keeps each portal's layout a server component.
 */
export function PortalShell({
  portal,
  children,
}: {
  portal: PortalKey;
  children: React.ReactNode;
}) {
  const nav = PORTALS[portal];
  return (
    <AppShell variant="navy" portalName={nav.label} nav={nav.groups}>
      {children}
    </AppShell>
  );
}
