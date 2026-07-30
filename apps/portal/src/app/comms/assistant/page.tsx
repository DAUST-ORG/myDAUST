"use client";

import { Card } from "@/components/ui";
import { PublishBar, SiteEditor, useDraft } from "../cms";

// Only the chatbot knowledge base: trigger words (patterns), answers, and the fallback.
const AI_SECTIONS = ["chatKb", "chatFallback", "suggestions"];

export default function AssistantPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <Card>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--fg2)" }}>
          Each knowledge-base entry has <strong>patterns</strong> (the trigger words that route a question to it)
          and a bilingual <strong>answer</strong>. Edit the words a visitor might type, and the answer the assistant gives.
        </p>
      </Card>
      <div style={{ height: 16 }} />
      <SiteEditor draft={draft} only={AI_SECTIONS} />
    </div>
  );
}
