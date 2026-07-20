import { PortalShell } from "@/components/PortalShell";

/**
 * Registrar portal. The finance suite moved to its own `/finance` area (owned by
 * the bursar role), so this nav no longer carries finance entries — a registrar
 * cannot read those endpoints anyway and the old sidebar produced 403s on load.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="registrar">{children}</PortalShell>;
}
