"use client";

import { SectionPicker } from "../SectionPicker";

export default function FacultyGradebookIndex() {
  return (
    <SectionPicker
      eyebrow="Teaching"
      title="Gradebook"
      subtitle="Continuous assessment across your sections. Choose a section to manage its assessment columns and scores."
      hrefFor={(id) => `/faculty/gradebook/${id}`}
    />
  );
}
