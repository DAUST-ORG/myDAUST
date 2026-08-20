import {
  Award,
  Banknote,
  BookMarked,
  BookOpen,
  BookUser,
  Building,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageSquare,
  Network,
  Newspaper,
  Receipt,
  Rocket,
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
export type BadgeKey =
  | "register"
  | "messages"
  | "billing"
  | "admissions"
  | "approvals"
  | "approvalRequests"
  | "grading"
  | "notifications";

export interface PortalNav {
  /** Small caps caption under the wordmark, e.g. "PARENT ACCESS". */
  label: string;
  /** Meta line under the user's name in the sidebar footer, e.g. "Registrar · Admin". */
  meta: string;
  groups: NavGroup[];
}

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: BadgeKey;
};
const g = (label: string, items: Item[]): NavGroup => ({ label, items });

export const STUDENT_NAV: PortalNav = {
  label: "Student Portal",
  meta: "Student",
  groups: [
    g("Academics", [
      { href: "/student", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/student/registration",
        label: "Registration",
        icon: ClipboardList,
        badgeKey: "register",
      },
      { href: "/student/courses", label: "My Courses", icon: BookOpen },
      { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/student/grades", label: "Grades", icon: GraduationCap },
      { href: "/student/degree", label: "Degree Progress", icon: Target },
      { href: "/student/attendance", label: "Attendance", icon: CheckCheck },
    ]),
    g("Finance & campus", [
      {
        href: "/student/billing",
        label: "Billing",
        icon: Wallet,
        badgeKey: "billing",
      },
      { href: "/student/dining", label: "Dining", icon: Utensils },
      { href: "/student/housing", label: "Housing", icon: Building2 },
    ]),
    g("Communication", [
      {
        href: "/student/announcements",
        label: "Announcements",
        icon: Megaphone,
      },
      {
        href: "/student/inbox",
        label: "Messages",
        icon: Mail,
        badgeKey: "messages",
      },
    ]),
    g("Account", [
      { href: "/student/profile", label: "My Profile", icon: UserRound },
    ]),
  ],
};

export const PARENT_NAV: PortalNav = {
  label: "Parent Access",
  meta: "Guardian",
  groups: [
    g("Overview", [
      { href: "/parent", label: "Dashboard", icon: LayoutDashboard },
    ]),
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
    g("Overview", [
      { href: "/faculty", label: "Dashboard", icon: LayoutDashboard },
    ]),
    g("Teaching", [
      { href: "/faculty/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/faculty/grades", label: "Grade Entry", icon: GraduationCap },
      {
        href: "/faculty/gradebook",
        label: "Gradebook",
        icon: Table2,
        badgeKey: "grading",
      },
      { href: "/faculty/attendance", label: "Attendance", icon: CheckCheck },
      {
        href: "/faculty/materials",
        label: "Course Materials",
        icon: FolderOpen,
      },
      {
        href: "/faculty/messages",
        label: "Messages",
        icon: Mail,
        badgeKey: "messages",
      },
    ]),
  ],
};

export const REGISTRAR_NAV: PortalNav = {
  label: "Registrar Portal",
  meta: "Registrar · Admin",
  groups: [
    g("Overview", [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/admin/admissions",
        label: "Admissions",
        icon: UserPlus,
        badgeKey: "admissions",
      },
      { href: "/admin/students", label: "Students", icon: Users },
      { href: "/admin/parents", label: "Parents", icon: UsersRound },
      {
        href: "/admin/student-success",
        label: "Student Success",
        icon: HeartPulse,
      },
    ]),
    g("Academic structure", [
      { href: "/admin/departments", label: "Departments", icon: Building },
      {
        href: "/admin/academic-years",
        label: "Academic Catalog",
        icon: CalendarClock,
      },
      {
        href: "/admin/courses",
        label: "Course Catalog",
        icon: BookMarked,
      },
      {
        href: "/admin/programs",
        label: "Programs & Curriculum",
        icon: Network,
      },
      {
        href: "/admin/offerings",
        label: "Course Sections",
        icon: ListChecks,
      },
      {
        href: "/admin/calendar",
        label: "Academic Calendar",
        icon: CalendarRange,
      },
    ]),
    g("Policy & rules", [
      { href: "/admin/rules", label: "Rule Engine", icon: GitBranch },
      { href: "/admin/grading-schemes", label: "Grading Schemes", icon: Scale },
      {
        href: "/admin/grade-approvals",
        label: "Grade Approvals",
        icon: ClipboardCheck,
        badgeKey: "approvals",
      },
    ]),
    g("Administration", [
      { href: "/admin/directory", label: "Directory", icon: BookUser },
      { href: "/admin/staff", label: "Roles & Permissions", icon: ShieldCheck },
      { href: "/admin/settings", label: "Security & System", icon: Settings },
    ]),
    g("Communication", [
      { href: "/admin/messages", label: "Messages", icon: Mail },
    ]),
  ],
};

export const DIRECTOR_NAV: PortalNav = {
  label: "Director Portal",
  meta: "Administration · Director",
  groups: [
    g("Executive overview", [
      { href: "/director", label: "Overview", icon: LayoutDashboard },
      {
        href: "/director/approvals",
        label: "Approvals",
        icon: ClipboardCheck,
        badgeKey: "approvalRequests",
      },
      {
        href: "/director/payments",
        label: "Payment Verifications",
        icon: Banknote,
      },
    ]),
  ],
};

export const FINANCE_NAV: PortalNav = {
  label: "Finance Portal",
  meta: "Finance · Bursar",
  groups: [
    g("Overview", [
      { href: "/finance", label: "Dashboard", icon: LayoutDashboard },
    ]),
    g("Finance", [
      {
        href: "/finance/budget",
        label: "Budgeting & Cashflow",
        icon: ChartNoAxesCombined,
      },
      {
        href: "/finance/fee-schedule",
        label: "Fees & Payment Schedule",
        icon: Receipt,
      },
      { href: "/finance/accounts", label: "Student Accounts", icon: Wallet },
      {
        href: "/finance/payment-reviews",
        label: "Payment Reviews",
        icon: Banknote,
      },
      {
        href: "/finance/requests",
        label: "My Requests",
        icon: ClipboardCheck,
        badgeKey: "approvalRequests",
      },
    ]),
  ],
};

export const COMMS_NAV: PortalNav = {
  label: "Communications",
  meta: "Communications · Website",
  groups: [
    g("Overview", [
      { href: "/comms", label: "Dashboard", icon: LayoutDashboard },
    ]),
    g("Public website", [
      { href: "/comms/site", label: "Content Editor", icon: LayoutTemplate },
      { href: "/comms/media", label: "Images", icon: ImageIcon },
      { href: "/comms/news", label: "News", icon: Newspaper },
      { href: "/comms/startups", label: "Startups", icon: Rocket },
      { href: "/comms/directors", label: "Center Directors", icon: Award },
      { href: "/comms/assistant", label: "AI Assistant", icon: MessageSquare },
    ]),
    g("Inbox", [{ href: "/comms/messages", label: "Messages", icon: Mail }]),
  ],
};

/** Portal registry, keyed so a server layout can name one without importing icons. */
export const PORTALS = {
  director: DIRECTOR_NAV,
  student: STUDENT_NAV,
  parent: PARENT_NAV,
  faculty: FACULTY_NAV,
  registrar: REGISTRAR_NAV,
  finance: FINANCE_NAV,
  comms: COMMS_NAV,
} as const;
export type PortalKey = keyof typeof PORTALS;

/**
 * Page title + breadcrumb per route, taken from the prototype's `titles`/`crumbs`
 * maps. `{term}` is substituted with the active term name at render time.
 */
export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  // student
  "/student": { title: "Dashboard", crumb: "Academic overview · {term}" },
  "/student/registration": {
    title: "Course Registration",
    crumb: "{term} · Add / drop",
  },
  "/student/courses": { title: "My Courses", crumb: "{term} & past terms" },
  "/student/schedule": { title: "Weekly Schedule", crumb: "{term}" },
  "/student/grades": {
    title: "Grades & Transcript",
    crumb: "Unofficial record",
  },
  "/student/degree": { title: "Degree Audit", crumb: "Programme requirements" },
  "/student/attendance": { title: "Attendance", crumb: "{term}" },
  "/student/billing": {
    title: "Billing & Financials",
    crumb: "Student account",
  },
  "/student/dining": { title: "Dining", crumb: "Meal plan" },
  "/student/housing": { title: "Housing", crumb: "Residential life" },
  "/student/announcements": { title: "Announcements", crumb: "Campus updates" },
  "/student/inbox": { title: "Messages", crumb: "Inbox" },
  "/student/profile": { title: "My Profile", crumb: "Student record" },
  // registrar
  "/admin": {
    title: "Dashboard",
    crumb: "Academic overview · {term} · Administration",
  },
  "/admin/admissions": {
    title: "Admissions",
    crumb: "{term} intake · Administration",
  },
  "/admin/students": {
    title: "Students",
    crumb: "Student directory · Administration",
  },
  "/admin/parents": {
    title: "Parents",
    crumb: "Parent accounts & assignments · Administration",
  },
  "/admin/student-success": {
    title: "Student Success",
    crumb: "Performance monitoring & early alerts · Administration",
  },
  "/admin/departments": {
    title: "Departments",
    crumb: "Department directory · Administration",
  },
  "/admin/academic-years": {
    title: "Academic Catalog",
    crumb: "Years, programme requirements and progression · Administration",
  },
  "/admin/programs": {
    title: "Programs & Curriculum",
    crumb: "Curriculum management · Administration",
  },
  "/admin/courses": {
    title: "Course Catalog",
    crumb: "Catalog management · Administration",
  },
  "/admin/offerings": {
    title: "Course Sections",
    crumb: "Term sections and registration availability · Administration",
  },
  "/admin/calendar": {
    title: "Academic Calendar & Terms",
    crumb: "Term configuration · Administration",
  },
  "/admin/rules": {
    title: "Rule Engine — Prerequisites & Co-requisites",
    crumb: "Enrollment rule engine · Administration",
  },
  "/admin/grading-schemes": {
    title: "Grading Scales & Schemes",
    crumb: "Grade scheme configuration · Administration",
  },
  "/admin/grade-approvals": {
    title: "Grade Approvals",
    crumb: "Approve submitted grades · Administration",
  },
  "/admin/directory": {
    title: "Directory",
    crumb: "Faculty & staff directory · Administration",
  },
  "/admin/staff": {
    title: "Roles & Permissions",
    crumb: "Role-based access control · Administration",
  },
  "/admin/settings": {
    title: "Security & System",
    crumb: "System configuration · Administration",
  },
  "/admin/messages": {
    title: "Messages",
    crumb: "Broadcast & direct messaging · Administration",
  },
  // finance
  "/finance": {
    title: "Dashboard",
    crumb: "Receivables overview · {term} · Finance",
  },
  "/finance/fee-schedule": {
    title: "Fees & Payment Schedule",
    crumb: "Annual charges & payment dates · Finance",
  },
  "/finance/budget": {
    title: "Budgeting & Cashflow",
    crumb: "Budget vs actual & cashflow forecast · Finance",
  },
  "/finance/accounts": {
    title: "Student Accounts",
    crumb: "Student billing accounts · Finance",
  },
  "/finance/wires": {
    title: "Wire Transfers",
    crumb: "Bank settings and proof review · Finance",
  },
  "/finance/payment-reviews": {
    title: "Payment Reviews",
    crumb: "Proof review and payment settings · Finance",
  },
  // communications (site CMS)
  "/comms": { title: "Dashboard", crumb: "Public website · Communications" },
  "/comms/site": {
    title: "Content Editor",
    crumb: "Edit site text · Communications",
  },
  "/comms/media": { title: "Images", crumb: "Site imagery · Communications" },
  "/comms/news": { title: "News", crumb: "News articles · Communications" },
  "/comms/startups": {
    title: "Startups",
    crumb: "Innovation ventures & partners · Communications",
  },
  "/comms/directors": {
    title: "Center Directors",
    crumb: "Research center directors · Communications",
  },
  "/comms/assistant": {
    title: "AI Assistant",
    crumb: "Chatbot trigger words & answers · Communications",
  },
  "/comms/messages": {
    title: "Messages",
    crumb: "Contact-form inbox · Communications",
  },
  // faculty
  "/faculty": { title: "Dashboard", crumb: "Teaching overview · {term}" },
  "/faculty/schedule": {
    title: "Weekly Schedule",
    crumb: "Teaching timetable",
  },
  "/faculty/grades": { title: "Grade Entry", crumb: "Final grade submission" },
  "/faculty/gradebook": {
    title: "Gradebook",
    crumb: "Continuous assessment gradebook",
  },
  "/faculty/attendance": {
    title: "Take Attendance",
    crumb: "Session attendance",
  },
  "/faculty/materials": {
    title: "Course Materials",
    crumb: "Upload course documents",
  },
  "/faculty/messages": { title: "Messages", crumb: "Message students" },
  // parent
  "/parent": { title: "Dashboard", crumb: "Academic overview · {term}" },
  "/parent/grades": { title: "Grades", crumb: "Academic record" },
  "/parent/attendance": { title: "Attendance", crumb: "Attendance record" },
  "/parent/billing": { title: "Billing", crumb: "Fees & payment" },
  // director
  "/director": {
    title: "Director Overview",
    crumb: "Institutional operations · Administration",
  },
  "/director/approvals": {
    title: "Approvals",
    crumb: "Finance change control · Administration",
  },
  "/director/payments": {
    title: "Payment Verifications",
    crumb: "Collections assurance · Administration",
  },
  "/finance/requests": {
    title: "My Requests",
    crumb: "Submitted changes · Finance",
  },
};

/**
 * Which portal a person lands in, most privileged first. A person can hold
 * several roles (e.g. admin + bursar), so order decides the default home.
 */
export const ROLE_PORTALS: { role: string; portal: PortalKey; home: string }[] =
  [
    { role: "admin", portal: "director", home: "/director" },
    { role: "registrar", portal: "registrar", home: "/admin" },
    { role: "bursar", portal: "finance", home: "/finance" },
    { role: "faculty", portal: "faculty", home: "/faculty" },
    { role: "communications", portal: "comms", home: "/comms" },
    { role: "student", portal: "student", home: "/student" },
    { role: "parent", portal: "parent", home: "/parent" },
  ];

export function portalForRoles(roles: string[]): {
  nav: PortalNav;
  home: string;
} {
  const match = ROLE_PORTALS.find((p) => roles.includes(p.role));
  return match
    ? { nav: PORTALS[match.portal], home: match.home }
    : { nav: STUDENT_NAV, home: "/student" };
}
