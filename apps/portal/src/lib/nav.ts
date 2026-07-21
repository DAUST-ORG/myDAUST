import {
  BookMarked,
  BookOpen,
  Building,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  Clock,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  FolderOpen,
  GitBranch,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Link2,
  ListChecks,
  type LucideIcon,
  Mail,
  Megaphone,
  Network,
  PieChart,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Table2,
  Target,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Utensils,
  Wallet,
} from "lucide-react";
import type { NavGroup } from "@/components/AppShell";

/**
 * Sidebar navigation per role, mirroring the `navGroups` definitions in the SIS
 * design prototype (design/Student information system design (1)) — group titles,
 * item order, labels and Lucide icons are taken from it verbatim.
 *
 * The design resolves nav from a client-side role switcher; here the role always
 * comes from the authenticated session. This is presentation only — every route
 * behind these links is independently guarded server-side by RolesGuard.
 */

/** Badge slots the design puts on nav items; resolved against live counts in the shell. */
export type BadgeKey = "register" | "messages" | "billing" | "admissions" | "approvals";

export interface PortalNav {
  /** Small caps caption under the wordmark, e.g. "PARENT ACCESS". */
  label: string;
  /** Meta line under the user's name in the sidebar footer, e.g. "Registrar · Admin". */
  meta: string;
  groups: NavGroup[];
}

type Item = { href: string; label: string; icon: LucideIcon; badgeKey?: BadgeKey };
const g = (label: string, items: Item[]): NavGroup => ({ label, items });

export const STUDENT_NAV: PortalNav = {
  label: "Student Portal",
  meta: "Student",
  groups: [
    g("Academics", [
      { href: "/student", label: "Dashboard", icon: LayoutDashboard },
      { href: "/student/registration", label: "Registration", icon: ClipboardList, badgeKey: "register" },
      { href: "/student/courses", label: "My Courses", icon: BookOpen },
      { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/student/grades", label: "Grades", icon: GraduationCap },
      { href: "/student/degree", label: "Degree Progress", icon: Target },
      { href: "/student/attendance", label: "Attendance", icon: CheckCheck },
    ]),
    g("Finance & campus", [
      { href: "/student/billing", label: "Billing", icon: Wallet, badgeKey: "billing" },
      { href: "/student/dining", label: "Dining", icon: Utensils },
      { href: "/student/housing", label: "Housing", icon: Building2 },
    ]),
    g("Communication", [
      { href: "/student/announcements", label: "Announcements", icon: Megaphone },
      { href: "/student/inbox", label: "Messages", icon: Mail, badgeKey: "messages" },
    ]),
    g("Account", [{ href: "/student/profile", label: "My Profile", icon: UserRound }]),
  ],
};

export const PARENT_NAV: PortalNav = {
  label: "Parent Access",
  meta: "Guardian",
  groups: [
    g("Overview", [{ href: "/parent", label: "Dashboard", icon: LayoutDashboard }]),
    g("My child", [
      { href: "/parent/grades", label: "Grades", icon: GraduationCap },
      { href: "/parent/attendance", label: "Attendance", icon: CheckCheck },
      { href: "/parent/billing", label: "Billing", icon: Wallet },
    ]),
  ],
};

export const FACULTY_NAV: PortalNav = {
  label: "Faculty Portal",
  meta: "Faculty",
  groups: [
    g("Overview", [{ href: "/faculty", label: "Dashboard", icon: LayoutDashboard }]),
    g("Teaching", [
      { href: "/faculty/grades", label: "Grade Entry", icon: GraduationCap },
      { href: "/faculty/gradebook", label: "Gradebook", icon: Table2 },
      { href: "/faculty/attendance", label: "Attendance", icon: CheckCheck },
      { href: "/faculty/materials", label: "Course Materials", icon: FolderOpen },
      { href: "/faculty/messages", label: "Messages", icon: Mail },
    ]),
  ],
};

export const REGISTRAR_NAV: PortalNav = {
  label: "Registrar Portal",
  meta: "Registrar · Admin",
  groups: [
    g("Overview", [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/admissions", label: "Admissions", icon: UserPlus, badgeKey: "admissions" },
      { href: "/admin/students", label: "Students", icon: Users },
      { href: "/admin/parents", label: "Parents", icon: UsersRound },
      { href: "/admin/student-success", label: "Student Success", icon: HeartPulse },
    ]),
    g("Academic structure", [
      { href: "/admin/departments", label: "Departments", icon: Building },
      { href: "/admin/academic-years", label: "Academic Years", icon: CalendarClock },
      { href: "/admin/programs", label: "Programs & Curriculum", icon: Network },
      { href: "/admin/courses", label: "Course Catalog", icon: BookMarked },
      { href: "/admin/offerings", label: "Course Enrollment", icon: ListChecks },
      { href: "/admin/calendar", label: "Academic Calendar", icon: CalendarRange },
    ]),
    g("Policy & rules", [
      { href: "/admin/rules", label: "Rule Engine", icon: GitBranch },
      { href: "/admin/grading-schemes", label: "Grading Schemes", icon: Scale },
      { href: "/admin/grade-approvals", label: "Grade Approvals", icon: ClipboardCheck, badgeKey: "approvals" },
    ]),
    g("Administration", [
      { href: "/admin/staff", label: "Roles & Permissions", icon: ShieldCheck },
      { href: "/admin/settings", label: "Security & System", icon: Settings },
    ]),
    g("Communication", [{ href: "/admin/messages", label: "Messages", icon: Mail }]),
  ],
};

export const FINANCE_NAV: PortalNav = {
  label: "Finance Portal",
  meta: "Finance · Bursar",
  groups: [
    g("Overview", [{ href: "/finance", label: "Dashboard", icon: LayoutDashboard }]),
    g("Finance", [
      { href: "/finance/fee-schedule", label: "Fee Schedule", icon: Receipt },
      { href: "/finance/accounts", label: "Student Accounts", icon: Wallet },
    ]),
    // Beyond the design: the management-accounting suite that already ships. The
    // design's finance portal covers receivables only, so these stay in their own
    // group rather than being dropped along with the screens they support.
    g("Management accounting", [
      { href: "/admin/finance/director", label: "Money in & out", icon: LineChart },
      { href: "/admin/finance", label: "Collections", icon: Coins },
      { href: "/admin/finance/aging", label: "A/R Aging", icon: Clock },
      { href: "/admin/finance/links", label: "Payment Links", icon: Link2 },
      { href: "/admin/finance/expenses", label: "Expenses", icon: Receipt },
      { href: "/admin/finance/budgets", label: "Budgets", icon: PieChart },
      { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
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
 * Page title + breadcrumb per route, taken from the prototype's `titles`/`crumbs`
 * maps. `{term}` is substituted with the active term name at render time.
 */
export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  // student
  "/student": { title: "Dashboard", crumb: "Academic overview · {term}" },
  "/student/registration": { title: "Course Registration", crumb: "{term} · Add / drop" },
  "/student/courses": { title: "My Courses", crumb: "{term} & past terms" },
  "/student/schedule": { title: "Weekly Schedule", crumb: "{term}" },
  "/student/grades": { title: "Grades & Transcript", crumb: "Unofficial record" },
  "/student/degree": { title: "Degree Audit", crumb: "Programme requirements" },
  "/student/attendance": { title: "Attendance", crumb: "{term}" },
  "/student/billing": { title: "Billing & Financials", crumb: "Student account" },
  "/student/dining": { title: "Dining", crumb: "Meal plan" },
  "/student/housing": { title: "Housing", crumb: "Residential life" },
  "/student/announcements": { title: "Announcements", crumb: "Campus updates" },
  "/student/inbox": { title: "Messages", crumb: "Inbox" },
  "/student/profile": { title: "My Profile", crumb: "Student record" },
  // registrar
  "/admin": { title: "Dashboard", crumb: "Academic overview · {term} · Administration" },
  "/admin/admissions": { title: "Admissions", crumb: "{term} intake · Administration" },
  "/admin/students": { title: "Students", crumb: "Student directory · Administration" },
  "/admin/parents": { title: "Parents", crumb: "Parent accounts & assignments · Administration" },
  "/admin/student-success": { title: "Student Success", crumb: "Performance monitoring & early alerts · Administration" },
  "/admin/departments": { title: "Departments", crumb: "Department directory · Administration" },
  "/admin/academic-years": { title: "Academic Years", crumb: "Catalog year configuration · Administration" },
  "/admin/programs": { title: "Programs & Curriculum", crumb: "Curriculum management · Administration" },
  "/admin/courses": { title: "Course Catalog", crumb: "Catalog management · Administration" },
  "/admin/offerings": { title: "Course Enrollment", crumb: "Offered course sections · Administration" },
  "/admin/calendar": { title: "Academic Calendar & Terms", crumb: "Term configuration · Administration" },
  "/admin/rules": { title: "Rule Engine — Prerequisites & Co-requisites", crumb: "Enrollment rule engine · Administration" },
  "/admin/grading-schemes": { title: "Grading Scales & Schemes", crumb: "Grade scheme configuration · Administration" },
  "/admin/grade-approvals": { title: "Grade Approvals", crumb: "Approve submitted grades · Administration" },
  "/admin/staff": { title: "Roles & Permissions", crumb: "Access control (RBAC) · Administration" },
  "/admin/settings": { title: "Security & System", crumb: "System configuration · Administration" },
  "/admin/messages": { title: "Messages", crumb: "Broadcast & direct messaging · Administration" },
  // finance
  "/finance": { title: "Dashboard", crumb: "Receivables overview · {term} · Finance" },
  "/finance/fee-schedule": { title: "Tuition & Fees", crumb: "Fee structure & payment plan · Finance" },
  "/finance/accounts": { title: "Student Accounts", crumb: "Student billing accounts · Finance" },
  // faculty
  "/faculty": { title: "Dashboard", crumb: "Teaching overview · {term}" },
  "/faculty/grades": { title: "Grade Entry", crumb: "Final grade submission" },
  "/faculty/gradebook": { title: "Gradebook", crumb: "Continuous assessment gradebook" },
  "/faculty/attendance": { title: "Take Attendance", crumb: "Session attendance" },
  "/faculty/materials": { title: "Course Materials", crumb: "Upload course documents" },
  "/faculty/messages": { title: "Messages", crumb: "Message students" },
  // parent
  "/parent": { title: "Dashboard", crumb: "Academic overview · {term}" },
  "/parent/grades": { title: "Grades", crumb: "Academic record" },
  "/parent/attendance": { title: "Attendance", crumb: "Attendance record" },
  "/parent/billing": { title: "Billing", crumb: "Fees & payment" },
};

/**
 * Which portal a person lands in, most privileged first. A person can hold
 * several roles (e.g. admin + bursar), so order decides the default home.
 */
export const ROLE_PORTALS: { role: string; portal: PortalKey; home: string }[] = [
  { role: "admin", portal: "registrar", home: "/admin" },
  { role: "registrar", portal: "registrar", home: "/admin" },
  { role: "bursar", portal: "finance", home: "/finance" },
  { role: "faculty", portal: "faculty", home: "/faculty" },
  { role: "student", portal: "student", home: "/student" },
  { role: "parent", portal: "parent", home: "/parent" },
];

export function portalForRoles(roles: string[]): { nav: PortalNav; home: string } {
  const match = ROLE_PORTALS.find((p) => roles.includes(p.role));
  return match ? { nav: PORTALS[match.portal], home: match.home } : { nav: STUDENT_NAV, home: "/student" };
}
