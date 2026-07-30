"use client";

import { Card } from "@/components/ui";
import { PublishBar, SectionToggles, useDraft } from "./cms";

export default function CommsDashboard() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <Card title="Editing the public website">
          <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)" }}>
            Changes you make in <strong>Content Editor</strong>, <strong>Images</strong> and <strong>AI Assistant</strong> are
            saved as a draft. Nothing goes live until you press <strong>Publish</strong>.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--fg2)" }}>
            <li><strong>Save draft</strong> — keeps your work without changing the live site.</li>
            <li><strong>Preview</strong> — opens the live site showing your unpublished draft.</li>
            <li><strong>Publish</strong> — makes the current draft live for everyone.</li>
          </ul>
        </Card>
        <SectionToggles draft={draft} />
      </div>
    </div>
  );
}
