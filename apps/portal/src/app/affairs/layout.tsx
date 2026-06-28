import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  { items: [{ href: "/affairs", label: "Dashboard" }] },
  {
    label: "Residence",
    items: [
      { href: "/affairs/housing", label: "Housing & Residence" },
      { href: "/affairs/roommate", label: "Roommate Matching" },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/affairs/conduct", label: "Conduct & Disputes" },
      { href: "/affairs/clubs", label: "Clubs & Orgs" },
      { href: "/affairs/budget", label: "Co-curricular Budget" },
    ],
  },
];

export default function AffairsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Student Affairs" nav={nav}>
      {children}
    </AppShell>
  );
}
