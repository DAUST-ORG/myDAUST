"use client";

import { PublishBar, SiteEditor, useDraft } from "../cms";
import { Card } from "@/components/ui";

// Everything except the AI knowledge base (that has its own screen).
const AI_SECTIONS = ["chatKb", "chatFallback", "suggestions"];

export default function SiteContentPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <div style={{ marginBottom: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)" }}>
              This editor controls the site&apos;s homepage text, images and sections. <strong>News articles</strong> are managed
              separately in the <strong>News</strong> section — publish one there and it appears on the News page and the
              homepage&apos;s News &amp; Stories section.
            </p>
            <a href="/comms/news" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--daust-navy)", borderBottom: "2px solid var(--daust-orange)", paddingBottom: 3, textDecoration: "none", whiteSpace: "nowrap" }}>Manage news →</a>
          </div>
        </Card>
      </div>
      <SiteEditor draft={draft} exclude={AI_SECTIONS} />
    </div>
  );
}
