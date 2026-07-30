"use client";

import { PublishBar, useDraft, VenturesEditor } from "../cms";

export default function StartupsPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <VenturesEditor draft={draft} />
    </div>
  );
}
