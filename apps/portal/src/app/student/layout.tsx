import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  { items: [{ href: "/student", label: "Dashboard" }, { href: "/student/id", label: "Student ID" }] },
  {
    label: "Academics",
    items: [
      { href: "/student/courses", label: "Courses" },
      { href: "/student/schedule", label: "Schedule" },
      { href: "/student/assignments", label: "Assignments" },
      { href: "/student/grades", label: "Grades" },
      { href: "/student/innovation", label: "Innovation" },
    ],
  },
  {
    label: "Campus",
    items: [
      { href: "/student/announcements", label: "Announcements" },
      { href: "/student/inbox", label: "Inbox" },
      { href: "/student/dining", label: "Dining" },
      { href: "/student/events", label: "Events" },
      { href: "/student/library", label: "Library" },
      { href: "/student/documents", label: "Documents" },
    ],
  },
  { label: "Account", items: [{ href: "/student/billing", label: "Billing" }] },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Student Portal" nav={nav}>
      {children}
    </AppShell>
  );
}
