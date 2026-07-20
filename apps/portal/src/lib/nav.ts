import {
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LibraryBig,
  type LucideIcon,
  Mail,
  Megaphone,
  Receipt,
  Scale,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import type { NavGroup } from "@/components/AppShell";

/**
 * Sidebar navigation per role, mirroring the `navGroups` definitions in the SIS
 * design prototype (design/Student information system design (1)).
 *
 * The design resolves nav from a client-side role switcher; here the role always
 * comes from the authenticated session. This is presentation only — every route
 * behind these links is independently guarded server-side by RolesGuard.
 */

export interface PortalNav {
  /** Small caps caption under the wordmark, e.g. "PARENT ACCESS". */
  label: string;
  groups: NavGroup[];
}

type Item = { href: string; label: string; icon: LucideIcon };
const g = (label: string, items: Item[]): NavGroup => ({ label, items });

export const STUDENT_NAV: PortalNav = {
  label: "Student Portal",
  groups: [
    g("Academics", [
      { href: "/student", label: "Dashboard", icon: LayoutDashboard },
      { href: "/student/registration", label: "Registration", icon: ClipboardList },
      { href: "/student/courses", label: "My Courses", icon: BookOpen },
      { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/student/grades", label: "Grades", icon: GraduationCap },
      { href: "/student/degree", label: "Degree Progress", icon: Layers },
      { href: "/student/attendance", label: "Attendance", icon: UserCheck },
    ]),
    g("Finance & campus", [
      { href: "/student/billing", label: "Billing", icon: Wallet },
      { href: "/student/dining", label: "Dining", icon: Utensils },
      { href: "/student/housing", label: "Housing", icon: Building2 },
    ]),
    g("Communication", [
      { href: "/student/announcements", label: "Announcements", icon: Megaphone },
      { href: "/student/messages", label: "Messages", icon: Mail },
    ]),
    g("Account", [{ href: "/student/profile", label: "My Profile", icon: UserRound }]),
  ],
};

export const PARENT_NAV: PortalNav = {
  label: "Parent Access",
  groups: [
    g("Overview", [{ href: "/parent", label: "Dashboard", icon: LayoutDashboard }]),
    g("My child", [
      { href: "/parent/grades", label: "Grades", icon: GraduationCap },
      { href: "/parent/attendance", label: "Attendance", icon: UserCheck },
      { href: "/parent/billing", label: "Billing", icon: Wallet },
    ]),
  ],
};

export const FACULTY_NAV: PortalNav = {
  label: "Faculty Portal",
  groups: [
    g("Overview", [{ href: "/faculty", label: "Dashboard", icon: LayoutDashboard }]),
    g("Teaching", [
      { href: "/faculty/grades", label: "Grade Entry", icon: ClipboardCheck },
      { href: "/faculty/gradebook", label: "Gradebook", icon: FileSpreadsheet },
      { href: "/faculty/attendance", label: "Attendance", icon: UserCheck },
      { href: "/faculty/materials", label: "Course Materials", icon: LibraryBig },
      { href: "/faculty/messages", label: "Messages", icon: Mail },
    ]),
  ],
};

export const REGISTRAR_NAV: PortalNav = {
  label: "Registrar Portal",
  groups: [
    g("Overview", [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/admissions", label: "Admissions", icon: ClipboardList },
      { href: "/admin/students", label: "Students", icon: Users },
      { href: "/admin/parents", label: "Parents", icon: UserRound },
      { href: "/admin/student-success", label: "Student Success", icon: UserCheck },
    ]),
    g("Academic structure", [
      { href: "/admin/departments", label: "Departments", icon: Building2 },
      { href: "/admin/academic-years", label: "Academic Years", icon: CalendarRange },
      { href: "/admin/programs", label: "Programs & Curriculum", icon: GraduationCap },
      { href: "/admin/courses", label: "Course Catalog", icon: BookOpen },
      { href: "/admin/offerings", label: "Course Enrollment", icon: Layers },
      { href: "/admin/calendar", label: "Academic Calendar", icon: CalendarDays },
    ]),
    g("Policy & rules", [
      { href: "/admin/rules", label: "Rule Engine", icon: GitBranch },
      { href: "/admin/grading-schemes", label: "Grading Schemes", icon: Scale },
      { href: "/admin/grade-approvals", label: "Grade Approvals", icon: ClipboardCheck },
    ]),
    g("Administration", [
      { href: "/admin/roles", label: "Roles & Permissions", icon: UserCog },
      { href: "/admin/settings", label: "Security & System", icon: ShieldCheck },
    ]),
    g("Communication", [{ href: "/admin/messages", label: "Messages", icon: Mail }]),
  ],
};

export const FINANCE_NAV: PortalNav = {
  label: "Finance Office",
  groups: [
    g("Overview", [{ href: "/finance", label: "Dashboard", icon: LayoutDashboard }]),
    g("Finance", [
      { href: "/finance/fee-schedule", label: "Fee Schedule", icon: Coins },
      { href: "/finance/accounts", label: "Student Accounts", icon: Receipt },
    ]),
  ],
};

/** Portal registry, keyed so a server layout can name one without importing icons. */
export const PORTALS = {
  student: STUDENT_NAV,
  parent: PARENT_NAV,
  faculty: FACULTY_NAV,
  registrar: REGISTRAR_NAV,
  finance: FINANCE_NAV,
} as const;
export type PortalKey = keyof typeof PORTALS;

/**
 * Which portal a person lands in, most privileged first. A person can hold
 * several roles (e.g. admin + bursar), so order decides the default home.
 */
export const ROLE_PORTALS: { role: string; nav: PortalNav; home: string }[] = [
  { role: "admin", nav: REGISTRAR_NAV, home: "/admin" },
  { role: "registrar", nav: REGISTRAR_NAV, home: "/admin" },
  { role: "bursar", nav: FINANCE_NAV, home: "/finance" },
  { role: "faculty", nav: FACULTY_NAV, home: "/faculty" },
  { role: "student", nav: STUDENT_NAV, home: "/student" },
  { role: "parent", nav: PARENT_NAV, home: "/parent" },
];

export function portalForRoles(roles: string[]): { nav: PortalNav; home: string } {
  const match = ROLE_PORTALS.find((p) => roles.includes(p.role));
  return match ? { nav: match.nav, home: match.home } : { nav: STUDENT_NAV, home: "/student" };
}
