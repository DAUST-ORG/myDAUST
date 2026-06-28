import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  { label: "Main", items: [{ href: "/admin", label: "Dashboard" }] },
  {
    label: "Academic",
    items: [
      { href: "/admin/admissions", label: "Admissions" },
      { href: "/admin/students", label: "Students" },
      { href: "/admin/programs", label: "Programs & Courses" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/finance/director", label: "Director overview" },
      { href: "/admin/finance", label: "Collections" },
      { href: "/admin/finance/aging", label: "A/R Aging" },
      { href: "/admin/finance/expenses", label: "Expenses" },
      { href: "/admin/finance/budgets", label: "Budgets" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/staff", label: "Faculty & Staff" },
      { href: "/admin/housing", label: "Housing" },
      { href: "/admin/library", label: "Library" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/admin/announcements", label: "Announcements" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  { label: "System", items: [{ href: "/admin/settings", label: "Settings" }] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Admin Portal" nav={nav}>
      {children}
    </AppShell>
  );
}
