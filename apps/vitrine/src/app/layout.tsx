import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://daust.org"),
  title: "DAUST · Dakar American University of Science & Technology",
  description:
    "An American-style, five-year engineering university in Somone, Senegal. Rigorous academics, state-of-the-art labs, and research that shapes the continent.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "DAUST",
    title: "DAUST · Dakar American University of Science & Technology",
    description:
      "An American-style, five-year engineering university in Somone, Senegal. Rigorous academics, state-of-the-art labs, and research that shapes the continent.",
  },
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js');",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
