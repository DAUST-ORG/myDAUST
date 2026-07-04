import { AppShell, type NavGroup } from "@/components/AppShell";

const nav: NavGroup[] = [
  {
    label: "Teaching",
    items: [
      { href: "/faculty", label: "Dashboard" },
      { href: "/faculty/classes", label: "My Classes" },
      { href: "/faculty/schedule", label: "Schedule" },
      { href: "/faculty/insights", label: "Insights" },
      { href: "/faculty/advising", label: "Advising" },
      { href: "/faculty/messages", label: "Messages" },
    ],
  },
  {
    label: "Campus",
    items: [
      { href: "/faculty/announcements", label: "Announcements" },
      { href: "/faculty/documents", label: "Documents" },
      { href: "/faculty/dining", label: "Dining" },
      { href: "/faculty/pay", label: "Pay & Payslips" },
      { href: "/faculty/leave", label: "Leave & Absence" },
      { href: "/faculty/booking", label: "Room Booking" },
      { href: "/faculty/profile", label: "My Profile" },
    ],
  },
];

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell variant="navy" portalName="Teacher Portal" nav={nav}>
      {children}
    </AppShell>
  );
}
