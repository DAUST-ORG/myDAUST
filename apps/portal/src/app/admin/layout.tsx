"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Clock,
  GraduationCap,
  LayoutDashboard,
  Library,
  Link2,
  LineChart,
  Megaphone,
  PieChart,
  Receipt,
  Settings,
  Wallet,
} from "lucide-react";
import { AppShell, type NavGroup } from "@/components/AppShell";
import type { RoleView } from "@/components/Topbar";
import { getAdmissions, getOverdue } from "@/lib/api";

// Cosmetic "Viewing as" preview — filters which nav a role would see.
// Real authorization is enforced server-side (RolesGuard); this only shapes the sidebar.
// access = "all", or a list of href entries matched exactly ("/admin") or by prefix ("/admin/finance").
const ROLE_VIEWS: (RoleView & { access: "all" | string[] })[] = [
  { key: "admin", label: "Super Admin", access: "all" },
  { key: "registrar", label: "Registrar", access: ["/admin", "/admin/admissions", "/admin/students", "/admin/programs", "/admin/schedule", "/admin/reports"] },
  { key: "bursar", label: "Accountant", access: ["/admin", "/admin/finance", "/admin/reports"] },
  { key: "hr", label: "HR Officer", access: ["/admin", "/admin/staff", "/admin/reports"] },
  { key: "it_admin", label: "IT Admin", access: ["/admin", "/admin/settings", "/admin/reports"] },
];

function hrefAllowed(href: string, access: "all" | string[]): boolean {
  if (access === "all") return true;
  return access.some((e) => href === e || (e !== "/admin" && href.startsWith(e + "/")));
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [openApplicants, setOpenApplicants] = useState<number | undefined>();
  const [overdueCount, setOverdueCount] = useState<number | undefined>();
  const [viewAs, setViewAs] = useState("admin");

  useEffect(() => {
    getAdmissions()
      .then((a) => {
        const open = a.funnel
          .filter((f) => !["accepted", "rejected"].includes(f.stage))
          .reduce((sum, f) => sum + f.count, 0);
        setOpenApplicants(open);
      })
      .catch(() => {});
    getOverdue()
      .then((rows) => setOverdueCount(rows.length))
      .catch(() => {});
  }, []);

  const fullNav: NavGroup[] = useMemo(
    () => [
      { label: "Main", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }] },
      {
        label: "Academic",
        items: [
          { href: "/admin/admissions", label: "Admissions", icon: ClipboardList, count: openApplicants },
          { href: "/admin/students", label: "Students", icon: GraduationCap },
          { href: "/admin/programs", label: "Programs & Courses", icon: BookOpen },
        ],
      },
      {
        label: "Finance",
        items: [
          { href: "/admin/finance/director", label: "Director overview", icon: LineChart },
          { href: "/admin/finance", label: "Collections", icon: Wallet, count: overdueCount },
          { href: "/admin/finance/aging", label: "A/R Aging", icon: Clock },
          { href: "/admin/finance/links", label: "Payment Links", icon: Link2 },
          { href: "/admin/finance/expenses", label: "Expenses", icon: Receipt },
          { href: "/admin/finance/budgets", label: "Budgets", icon: PieChart },
        ],
      },
      {
        label: "Operations",
        items: [
          { href: "/admin/staff", label: "Faculty & Staff", icon: Briefcase, disabled: true },
          { href: "/admin/housing", label: "Housing", icon: Building2, disabled: true },
          { href: "/admin/library", label: "Library", icon: Library, disabled: true },
        ],
      },
      {
        label: "Engagement",
        items: [
          { href: "/admin/announcements", label: "Announcements", icon: Megaphone, disabled: true },
          { href: "/admin/reports", label: "Reports", icon: BarChart3, disabled: true },
        ],
      },
      { label: "System", items: [{ href: "/admin/settings", label: "Settings", icon: Settings }] },
    ],
    [openApplicants, overdueCount],
  );

  const nav: NavGroup[] = useMemo(() => {
    const access = ROLE_VIEWS.find((r) => r.key === viewAs)?.access ?? "all";
    return fullNav
      .map((g) => ({ ...g, items: g.items.filter((it) => hrefAllowed(it.href, access)) }))
      .filter((g) => g.items.length > 0);
  }, [fullNav, viewAs]);

  return (
    <AppShell
      variant="navy"
      portalName="Admin Portal"
      nav={nav}
      viewAs={viewAs}
      onViewAs={setViewAs}
      viewAsRoles={ROLE_VIEWS.map((r) => ({ key: r.key, label: r.label }))}
    >
      {children}
    </AppShell>
  );
}
