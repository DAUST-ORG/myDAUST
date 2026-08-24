import { PortalShell } from "@/components/PortalShell";

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="faculty" requiresAnyRole={["faculty", "admin"]}>{children}</PortalShell>;
}
