import { PortalShell } from "@/components/PortalShell";

/**
 * IT administration area. Anyone authenticated can reach /it/backlog because the
 * filing CTAs link out to GitHub and the backlog is org-public — but the IT
 * sidebar is rendered through `portal="it"`, which only the IT nav registry
 * knows about. Server-side authorization still gates every other IT route.
 */
export default function ItLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="it">{children}</PortalShell>;
}
