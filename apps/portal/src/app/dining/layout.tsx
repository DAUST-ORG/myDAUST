import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  {
    label: "Service",
    items: [
      { href: "/dining", label: "Overview" },
      { href: "/dining/scanner", label: "Scanner Station" },
      { href: "/dining/orders", label: "Weekend Orders" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dining/menus", label: "Menus" },
      { href: "/dining/settlement", label: "Finance / Settlement" },
    ],
  },
];

export default function DiningLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Dining Console" nav={nav}>
      {children}
    </AppShell>
  );
}
