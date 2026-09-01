import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activate student account | DAUST",
  description:
    "Use your Student ID and date of birth to set up your student account.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ActivateStudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
