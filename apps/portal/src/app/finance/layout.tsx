import { PortalShell } from "@/components/PortalShell";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="finance" requiresAnyRole={["bursar", "admin"]}>{children}</PortalShell>;
}
