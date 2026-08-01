"use client";

import { DirectorsEditor, PublishBar, useDraft } from "../cms";

export default function DirectorsPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <DirectorsEditor draft={draft} />
    </div>
  );
}
