import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Application status | DAUST",
  description: "Review your DAUST admission and enrollment payment status.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ApplicationStatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
