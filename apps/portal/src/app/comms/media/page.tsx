"use client";

import { MediaEditor, PublishBar, useDraft } from "../cms";

export default function MediaPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <MediaEditor draft={draft} />
    </div>
  );
}
