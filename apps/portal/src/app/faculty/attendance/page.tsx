"use client";

import { SectionPicker } from "../SectionPicker";

export default function FacultyAttendanceIndex() {
  return (
    <SectionPicker
      eyebrow="Teaching"
      title="Take attendance"
      subtitle="Choose a section to record attendance for a session. A late arrival counts as half a present in a student's rate."
      hrefFor={(id) => `/faculty/attendance/${id}`}
    />
  );
}
