import { PortalShell } from "@/components/PortalShell";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="parent">{children}</PortalShell>;
}
