"use client";

import Link from "next/link";
import { FileText, ShieldCheck } from "lucide-react";

const DOCS = [
  { href: "/student/documents/transcript", icon: FileText, title: "Official Transcript", desc: "Your full academic record with GPA, printable to PDF.", color: "var(--daust-navy)" },
  { href: "/student/documents/enrollment", icon: ShieldCheck, title: "Enrollment Verification", desc: "Proof of current enrollment for the active term.", color: "#2e7d52" },
];

export default function DocumentsPage() {
  return (
    <>
      <p className="eyebrow">Records</p>
      <h1 className="page-title">Documents</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {DOCS.map((d) => (
          <Link key={d.href} href={d.href} className="card" style={{ display: "flex", gap: 14, padding: 18, textDecoration: "none", color: "inherit", alignItems: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: `color-mix(in srgb, ${d.color} 14%, white)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <d.icon size={22} color={d.color} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{d.title}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{d.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
