"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type TeachingSection, getTeaching } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * Shared landing page for the faculty tools that operate on one section
 * (grade entry, gradebook, attendance, materials). Each links through to the
 * per-section screen rather than duplicating a section switcher on each.
 */
export function SectionPicker({
  eyebrow,
  title,
  subtitle,
  hrefFor,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  hrefFor: (sectionId: string) => string;
}) {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeaching().then(setSections).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {!sections && <p className="muted">Loading your sections…</p>}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {sections.map((s) => (
            <Link key={s.id} href={hrefFor(s.id)} style={{ color: "inherit" }}>
              <Card lift>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{s.course}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      §{s.sectionCode} · {s.term} · {s.schedule} · {s.room ?? "room TBA"}
                    </div>
                    <div style={{ marginTop: 9 }}>
                      <Badge tone={s.enrolled >= s.capacity ? "warning" : "neutral"}>
                        {s.enrolled}/{s.capacity} enrolled
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight size={17} color="var(--fg3)" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
