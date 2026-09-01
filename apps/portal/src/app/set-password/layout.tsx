import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set your password | DAUST",
  description: "Finish setting up your myDAUST account.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function SetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
