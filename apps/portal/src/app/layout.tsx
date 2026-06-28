import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "myDAUST",
  description: "DAUST campus platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
