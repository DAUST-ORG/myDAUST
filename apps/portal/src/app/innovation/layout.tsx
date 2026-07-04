import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  {
    label: "Studio",
    items: [
      { href: "/innovation", label: "Overview" },
      { href: "/innovation/projects", label: "Projects" },
      { href: "/innovation/review", label: "Review Queue" },
      { href: "/innovation/global-tasks", label: "Global Tasks" },
    ],
  },
];

export default function InnovationLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Innovation Studio" nav={nav}>
      {children}
    </AppShell>
  );
}
