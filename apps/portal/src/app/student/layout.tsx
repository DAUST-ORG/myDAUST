import { PortalShell } from "@/components/PortalShell";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="student" requiresAnyRole={["student"]}>{children}</PortalShell>;
}
