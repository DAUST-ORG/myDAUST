import { PortalShell } from "@/components/PortalShell";

export default function DirectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell portal="director">{children}</PortalShell>;
}
