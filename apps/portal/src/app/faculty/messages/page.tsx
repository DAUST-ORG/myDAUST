"use client";

import { useEffect, useState } from "react";
import { Inbox } from "@/components/Inbox";
import { type TeachingSection, getTeaching } from "@/lib/api";

/**
 * The same threaded inbox the student portal mounts. It replaces a compose-only screen
 * whose "Sent messages" panel was local React state: students could already start threads
 * with their instructors, and the replies had nowhere to be read.
 *
 * Passing the teaching sections adds a "Whole course" compose mode, which fans out into
 * per-student threads — so a broadcast also becomes real sent history in this same list.
 */
export default function FacultyMessagesPage() {
  const [sections, setSections] = useState<TeachingSection[]>([]);

  useEffect(() => {
    getTeaching().then(setSections).catch(() => {});
  }, []);

  return <Inbox eyebrow="Teaching" sections={sections} />;
}
