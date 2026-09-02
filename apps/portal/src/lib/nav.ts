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
  ChefHat,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Flag,
  FileText,
  FolderOpen,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  ListChecks,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageSquare,
  Network,
  Newspaper,
  Pill,
  Radio,
  Receipt,
  Rocket,
  Scale,
  Settings,
  ShieldAlert,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Stethoscope,
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
      { href: "/student/overrides", label: "Overrides", icon: ShieldAlert },

      { href: "/student/courses", label: "My Courses", icon: BookOpen },
      { href: "/student/assignments", label: "Assignments", icon: ListChecks },
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
      {
        href: "/student/evaluations",
        label: "Evaluations",
        icon: ClipboardCheck,
      },
    ]),
    g("Account", [
      { href: "/student/profile", label: "My Profile", icon: UserRound },
      { href: "/student/documents", label: "Documents", icon: FolderOpen },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
        href: "/faculty/overrides",
        label: "Override Requests",
        icon: ShieldAlert,
        badgeKey: "approvalRequests",
      },
      {
        href: "/faculty/messages",
        label: "Messages",
        icon: Mail,
        badgeKey: "messages",
      },
      {
        href: "/faculty/evaluations",
        label: "Evaluations",
        icon: ClipboardCheck,
      },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
      { href: "/admin/housing", label: "Housing", icon: Building2 },
      { href: "/admin/directory", label: "Directory", icon: BookUser },
      {
        href: "/admin/workbook-cutover-attestation",
        label: "Cutover Attestation",
        icon: ShieldCheck,
      },
      { href: "/admin/settings", label: "Security & System", icon: Settings },
    ]),
    g("Communication", [
      { href: "/admin/messages", label: "Messages", icon: Mail },
    ]),
    g("Custom Forms", [
      { href: "/admin/forms", label: "Forms", icon: FileText },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
      {
        href: "/director/evaluations",
        label: "Course Evaluations",
        icon: ClipboardList,
      },
    ]),
    g("Administration", [
      { href: "/director/users", label: "Users", icon: Users },
      {
        href: "/director/workbook-cutover-attestation",
        label: "Cutover Attestation",
        icon: ShieldCheck,
      },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
      {
        href: "/finance/billing-catalog",
        label: "Billing Catalog",
        icon: SlidersHorizontal,
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
      {
        href: "/finance/workbook-cutover-attestation",
        label: "Cutover Attestation",
        icon: ShieldCheck,
      },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
  ],
};

/**
 * IT administration. it_admin owns directory administration and nothing else today, so this
 * area is deliberately a single entry rather than a copy of the registrar sidebar -- which is
 * where the role used to be pointed, and which it cannot actually load.
 *
 * The Backlog entry points at the GitHub Issues integration (see
 * docs/specs/phase-0-it-issues.md). It is reachable by any authenticated session;
 * the portal shell renders the IT sidebar for it_admin / admin, and the page itself
 * is a static link-out. See AGENTS.md §12 for the routing context that keeps
 * it_admin from falling back to the student portal.
 */
export const IT_NAV: PortalNav = {
  label: "IT Administration",
  meta: "Accounts & access · IT",
  groups: [
    g("Administration", [
      { href: "/director/users", label: "Users", icon: Users },
    ]),
    g("Backlog", [
      { href: "/it/backlog", label: "IT backlog", icon: ClipboardList },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
  ],
};

/**
 * Admissions office. Deliberately a single entry: this role holds the applicant pipeline and
 * nothing else, and every other staff endpoint 403s for it, so a second item would be a link
 * to a permission error.
 */
export const ADMISSIONS_NAV: PortalNav = {
  label: "Admissions Office",
  meta: "Applicant pipeline · Admissions",
  groups: [
    g("Admissions", [
      {
        href: "/admissions",
        label: "Applicants",
        icon: UserPlus,
        badgeKey: "admissions",
      },
      {
        href: "/admissions/workbook-cutover-attestation",
        label: "Cutover Attestation",
        icon: ShieldCheck,
      },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
  ],
};

export const INFIRMARY_NAV: PortalNav = {
  label: "Health Center",
  meta: "Infirmary · Staff",
  groups: [
    g("Overview", [
      { href: "/infirmary", label: "Dashboard", icon: LayoutDashboard },
    ]),
    g("Clinical", [
      {
        href: "/infirmary/consultations",
        label: "Consultations",
        icon: Stethoscope,
      },
      { href: "/infirmary/prescriptions", label: "Prescriptions", icon: Pill },
      { href: "/infirmary/medications", label: "Medications", icon: Pill },
      {
        href: "/infirmary/appointments",
        label: "Appointments",
        icon: CalendarDays,
      },
    ]),
    g("Records", [
      { href: "/infirmary/students", label: "Students", icon: Users },
      {
        href: "/infirmary/follow-ups",
        label: "Follow-ups",
        icon: ClipboardList,
      },
      { href: "/infirmary/documents", label: "Documents", icon: FileText },
      {
        href: "/infirmary/consultations/flagged",
        label: "Flagged today",
        icon: Flag,
      },
    ]),
    g("Administration", [
      { href: "/infirmary/forms", label: "Forms", icon: ClipboardList },
      {
        href: "/infirmary/analytics",
        label: "Analytics",
        icon: ChartNoAxesCombined,
      },
      { href: "/infirmary/settings", label: "Settings", icon: Settings },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
  ],
};

/**
 * Dining console. Mirrors the DAUST-dining prototype's eight back-office entries. The
 * scanner is listed here but lives at /station: it is a full-bleed kiosk surface, not a
 * page inside this shell.
 */
export const DINING_NAV: PortalNav = {
  label: "Dining Admin",
  meta: "Cafeteria service · Dining",
  groups: [
    g("Service", [
      { href: "/dining", label: "Overview", icon: LayoutDashboard },
      { href: "/dining/live", label: "Live Service", icon: Radio },
      { href: "/dining/scanner", label: "Scanner Station", icon: ScanLine },
    ]),
    g("Manage", [
      { href: "/dining/students", label: "Students", icon: Users },
      { href: "/dining/orders", label: "Weekend Orders", icon: ShoppingBag },
      { href: "/dining/menus", label: "Menus", icon: ChefHat },
    ]),
    g("Business", [
      { href: "/dining/finances", label: "Finances", icon: Wallet },
      { href: "/dining/reports", label: "Reports", icon: ChartNoAxesCombined },
      { href: "/dining/settings", label: "Settings", icon: Settings },
    ]),
    g("Support", [{ href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy }]),
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
  it: IT_NAV,
  admissions: ADMISSIONS_NAV,
  dining: DINING_NAV,
  infirmary: INFIRMARY_NAV,
} as const;
export type PortalKey = keyof typeof PORTALS;

/**
 * Page title + breadcrumb per route, taken from the prototype's `titles`/`crumbs`
 * maps. `{term}` is substituted with the active term name at render time.
 */
export const PAGE_META: Record<string, { title: string; crumb: string }> = {
  "/student/assignments": {
    title: "Assignments",
    crumb: "Coursework · {term}",
  },
  "/student/evaluations": {
    title: "Course evaluations",
    crumb: "Anonymous feedback",
  },
  "/student/documents": { title: "Documents", crumb: "Letters & records" },
  "/student/courses/": { title: "My Courses", crumb: "Course detail · {term}" },
  "/faculty/evaluations": {
    title: "Course evaluations",
    crumb: "What your students said",
  },
  "/director/evaluations": {
    title: "Course evaluations",
    crumb: "Rounds, results & release",
  },
  "/admissions": {
    title: "Applicants",
    crumb: "Application pipeline · Admissions",
  },
  "/admin/admissions": {
    title: "Applicants",
    crumb: "Application pipeline · Registrar",
  },
  "/director/users": {
    title: "Users",
    crumb: "Accounts, roles & access · Administration",
  },
  "/faculty/submissions/": { title: "Submissions", crumb: "Review & grade" },
  "/admissions/[id]/notes": { title: "Notes", crumb: "Applicant · Admissions" },
  // student
  "/it/backlog": { title: "IT backlog", crumb: "Issues & requests · IT" },
  "/student": { title: "Dashboard", crumb: "Academic overview · {term}" },
  "/student/registration": {
    title: "Course Registration",
    crumb: "{term} · Add / drop",
  },
  "/student/overrides": {
    title: "Enrollment overrides",
    crumb: "Submitted override requests",
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
  "/admin/housing": {
    title: "Housing",
    crumb: "Annual room assignments · Administration",
  },
  "/admin/workbook-cutover-attestation": {
    title: "Reviewer Attestation",
    crumb: "Workbook cutover · Administration",
  },
  "/admin/settings": {
    title: "Security & System",
    crumb: "System configuration · Administration",
  },
  "/admin/messages": {
    title: "Messages",
    crumb: "Broadcast & direct messaging · Administration",
  },
  "/admin/forms": {
    title: "Custom Forms",
    crumb: "Custom forms · Administration",
  },
  "/admin/forms/new": {
    title: "New Form",
    crumb: "Create form · Custom Forms",
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
  "/finance/billing-catalog": {
    title: "Billing Catalog",
    crumb: "Services, scholarships & adjustments · Finance",
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
  "/finance/workbook-cutover-attestation": {
    title: "Reviewer Attestation",
    crumb: "Workbook cutover · Finance",
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
  "/faculty/overrides": {
    title: "Override Requests",
    crumb: "Student enrollment override requests",
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
  "/director/workbook-cutover-attestation": {
    title: "Reviewer Attestation",
    crumb: "Workbook cutover · Administration",
  },
  "/admissions/workbook-cutover-attestation": {
    title: "Reviewer Attestation",
    crumb: "Workbook cutover · Admissions",
  },
  "/finance/requests": {
    title: "My Requests",
    crumb: "Submitted changes · Finance",
  },
  // dining
  "/dining": { title: "Overview", crumb: "Cafeteria service · Dining" },
  "/dining/live": { title: "Live Service", crumb: "Now serving · Dining" },
  "/dining/scanner": { title: "Scanner Station", crumb: "Entrance · Dining" },
  "/dining/students": { title: "Students", crumb: "Meal plans · Dining" },
  "/dining/orders": { title: "Weekend Orders", crumb: "Fulfilment · Dining" },
  "/dining/menus": { title: "Menus", crumb: "Weekend menu · Dining" },
  "/dining/finances": { title: "Finances", crumb: "Cost center 3600 · Dining" },
  "/dining/reports": { title: "Reports", crumb: "Service trends · Dining" },
  "/dining/settings": { title: "Settings", crumb: "Service rules · Dining" },
  // infirmary
  "/infirmary": {
    title: "Dashboard",
    crumb: "Health center overview",
  },
  "/infirmary/consultations": {
    title: "Consultations",
    crumb: "Clinical visits · Infirmary",
  },
  "/infirmary/prescriptions": {
    title: "Prescriptions",
    crumb: "Medication orders · Infirmary",
  },
  "/infirmary/medications": {
    title: "Medications",
    crumb: "Inventory management · Infirmary",
  },
  "/infirmary/appointments": {
    title: "Appointments",
    crumb: "Scheduled visits · Infirmary",
  },
  "/infirmary/students": {
    title: "Students",
    crumb: "Student health records · Infirmary",
  },
  "/infirmary/follow-ups": {
    title: "Follow-ups",
    crumb: "Pending follow-up tasks · Infirmary",
  },
  "/infirmary/documents": {
    title: "Documents",
    crumb: "Medical documents · Infirmary",
  },
  "/infirmary/forms": {
    title: "Forms",
    crumb: "Health forms & questionnaires · Infirmary",
  },
  "/infirmary/analytics": {
    title: "Analytics",
    crumb: "Health center metrics · Infirmary",
  },
  "/infirmary/settings": {
    title: "Settings",
    crumb: "Clinic configuration · Infirmary",
  },
  "/infirmary/consultations/flagged": {
    title: "Flagged today",
    crumb: "Sick-flagged visits · Infirmary",
  },
  "/helpdesk": {
    title: "Helpdesk",
    crumb: "In-app support tickets",
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
    { role: "admissions", portal: "admissions", home: "/admissions" },
    { role: "bursar", portal: "finance", home: "/finance" },
    { role: "dining", portal: "dining", home: "/dining" },
    { role: "faculty", portal: "faculty", home: "/faculty" },
    { role: "communications", portal: "comms", home: "/comms" },
    { role: "it_admin", portal: "it", home: "/director/users" },
    { role: "infirmary", portal: "infirmary", home: "/infirmary" },
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
