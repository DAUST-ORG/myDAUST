"use client";

import { FacultyEditor, PublishBar, useDraft } from "../cms";

export default function FacultyPage() {
  const draft = useDraft();
  return (
    <div>
      <PublishBar draft={draft} />
      <FacultyEditor draft={draft} />
    </div>
  );
}
