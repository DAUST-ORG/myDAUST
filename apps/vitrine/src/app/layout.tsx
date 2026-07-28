import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAUST — Dakar American University of Science & Technology",
  description:
    "An American-style, five-year engineering university in Somone, Senegal — rigorous academics, state-of-the-art labs, and research that shapes the continent.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
