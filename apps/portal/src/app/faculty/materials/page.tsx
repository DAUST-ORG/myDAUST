"use client";

import { SectionPicker } from "../SectionPicker";

export default function FacultyMaterialsIndex() {
  return (
    <SectionPicker
      eyebrow="Teaching"
      title="Course materials"
      subtitle="Publish syllabi, lecture notes, assignments and resources. Choose a section to manage what its students can see."
      hrefFor={(id) => `/faculty/classes/${id}`}
    />
  );
}
