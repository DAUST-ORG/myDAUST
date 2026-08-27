import { PortalShell } from "@/components/PortalShell";
import { InfirmaryStoreProvider } from "./store";

export default function InfirmaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell portal="infirmary">
      <InfirmaryStoreProvider>{children}</InfirmaryStoreProvider>
    </PortalShell>
  );
}
