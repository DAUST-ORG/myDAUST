import { PortalShell } from "@/components/PortalShell";

export default function CommsLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="comms">{children}</PortalShell>;
}
