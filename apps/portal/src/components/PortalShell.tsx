"use client";

import { useEffect, useState } from "react";
import { AppShell, type ViewAsOption } from "./AppShell";
import { getMe, type Me } from "@/lib/api";
import { PORTALS, type PortalKey } from "@/lib/nav";

/**
 * Client boundary between a portal's server layout and AppShell.
 *
 * Nav definitions carry Lucide icon components, which are functions and so cannot
 * cross the server/client boundary as props. Layouts therefore pass only a portal
 * key (a plain string) and the nav is resolved here, on the client side of the
 * boundary. This keeps each portal's layout a server component.
 */

/**
 * Portals the "VIEW AS" switcher can offer, in the design's tab order.
 *
 * The prototype shows all five unconditionally because it fakes the session. Here
 * the list is filtered to the roles the person actually holds: authorization is
 * enforced server-side, so offering a portal they have no role for would only
 * navigate them into 403s. A true "view as *this student*" impersonation needs a
 * subject, not just a role, and is deliberately not part of this switcher.
 */
const VIEW_AS_ALL: (ViewAsOption & { role: string })[] = [
  { key: "student", label: "student", href: "/student", role: "student" },
  { key: "faculty", label: "faculty", href: "/faculty", role: "faculty" },
  { key: "registrar", label: "registrar", href: "/admin", role: "registrar" },
  { key: "finance", label: "finance", href: "/finance", role: "bursar" },
  { key: "parent", label: "parent", href: "/parent", role: "parent" },
];

/** Only the student portal has a profile screen behind the sidebar identity block. */
const PROFILE_HREF: Partial<Record<PortalKey, string>> = { student: "/student/profile" };

export function PortalShell({
  portal,
  children,
}: {
  portal: PortalKey;
  children: React.ReactNode;
}) {
  const nav = PORTALS[portal];
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
  }, []);

  // The design gives the switcher to the registrar/admin console only.
  const isAdmin = me?.roles.includes("admin") ?? false;
  const options = isAdmin
    ? VIEW_AS_ALL.filter((o) => me?.roles.includes(o.role)).map(({ role: _role, ...o }) => o)
    : [];

  return (
    <AppShell
      variant="navy"
      portalName={nav.label}
      portalMeta={nav.meta}
      nav={nav.groups}
      viewAs={portal}
      viewAsOptions={options.length > 1 ? options : undefined}
      profileHref={PROFILE_HREF[portal]}
    >
      {children}
    </AppShell>
  );
}
