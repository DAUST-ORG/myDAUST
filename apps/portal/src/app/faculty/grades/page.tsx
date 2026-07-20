"use client";

import { SectionPicker } from "../SectionPicker";

export default function FacultyGradeEntry() {
  return (
    <SectionPicker
      eyebrow="Teaching"
      title="Grade entry"
      subtitle="Choose a section to enter or revise final grades. Submitted grades go to the registrar for approval before they count toward a student's GPA."
      hrefFor={(id) => `/faculty/gradebook/${id}`}
    />
  );
}
