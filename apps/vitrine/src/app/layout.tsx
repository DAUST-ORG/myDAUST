import type { Metadata } from "next";
import { LangProvider } from "@/i18n/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAUST - Dakar American University of Science & Technology",
  description: "An elite American-style engineering education in Senegal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
