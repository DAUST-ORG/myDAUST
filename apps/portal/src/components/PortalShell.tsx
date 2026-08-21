"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
const VIEW_AS_ALL: (ViewAsOption & { roles: string[] })[] = [
  { key: "director", label: "director", href: "/director", roles: ["admin"] },
  { key: "student", label: "student", href: "/student", roles: ["student"] },
  { key: "faculty", label: "faculty", href: "/faculty", roles: ["faculty"] },
  {
    key: "registrar",
    label: "registrar",
    href: "/admin",
    roles: ["registrar", "admin"],
  },
  {
    key: "finance",
    label: "finance",
    href: "/finance",
    roles: ["bursar", "admin"],
  },
  {
    key: "comms",
    label: "website",
    href: "/comms",
    roles: ["communications", "admin"],
  },
  { key: "parent", label: "parent", href: "/parent", roles: ["parent"] },
  {
    key: "it",
    label: "IT",
    href: "/director/users",
    roles: ["it_admin", "admin"],
  },
];

/** Only the student portal has a profile screen behind the sidebar identity block. */
const PROFILE_HREF: Partial<Record<PortalKey, string>> = {
  student: "/student/profile",
};

export function PortalShell({
  portal,
  requiresRole,
  fallbackPortal,
  children,
}: {
  portal: PortalKey;
  /**
   * Role the primary portal's sidebar assumes. A route shared by two audiences names it
   * here with a fallback, so someone who can use the page but not the rest of the area
   * gets their own sidebar instead of one whose every other entry 403s.
   */
  requiresRole?: string;
  fallbackPortal?: PortalKey;
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const effective =
    requiresRole && fallbackPortal && me && !me.roles.includes(requiresRole)
      ? fallbackPortal
      : portal;
  const nav = PORTALS[effective];
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {});
  }, []);

  // A temp-password account must change it before using the app.
  useEffect(() => {
    if (me?.mustChangePassword && pathname !== "/change-password")
      router.replace("/change-password");
  }, [me, pathname, router]);

  // The design gives the switcher to the registrar/admin console only.
  const isAdmin = me?.roles.includes("admin") ?? false;
  const options = isAdmin
    ? VIEW_AS_ALL.filter((o) => o.roles.some((r) => me?.roles.includes(r))).map(
        ({ roles: _roles, ...o }) => o,
      )
    : [];

  return (
    <AppShell
      variant="navy"
      portalName={nav.label}
      portalMeta={nav.meta}
      nav={nav.groups}
      viewAs={effective}
      viewAsOptions={options.length > 1 ? options : undefined}
      profileHref={PROFILE_HREF[effective]}
    >
      {children}
    </AppShell>
  );
}
