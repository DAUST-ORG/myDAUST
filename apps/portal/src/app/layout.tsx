import type { Metadata } from "next";
import PhoneLandscapeGate from "@/components/PhoneLandscapeGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "myDAUST",
  description: "DAUST campus platform",
  icons: {
    icon: [
      {
        url: "/daust-favicon.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/daust-favicon.png",
    apple: [
      {
        url: "/daust-favicon.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PhoneLandscapeGate />
        {children}
      </body>
    </html>
  );
}
