"use client";

import { PublishBar, SiteEditor, useDraft } from "../cms";

// Everything except the AI knowledge base (that has its own screen).
const AI_SECTIONS = ["chatKb", "chatFallback", "suggestions"];

export default function SiteContentPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <SiteEditor draft={draft} exclude={AI_SECTIONS} />
    </div>
  );
}
