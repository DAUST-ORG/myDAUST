"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, LockKeyhole } from "lucide-react";
import type {
  AcademicCatalogProgram,
  AcademicCatalogSemester,
} from "@mydaust/shared";
import {
  type AcademicCatalogWorkspace,
  type AcademicYearRow,
  getAcademicCatalog,
  getAcademicYears,
} from "@/lib/api";
import { Badge, EmptyState, Select } from "@/components/ui";
import styles from "./curriculum.module.css";

const SEMESTERS: AcademicCatalogSemester[] = ["Fall", "Spring", "Summer"];

export function CurriculumEditor({
  code,
  name,
}: {
  code: string;
  name: string;
}) {
  const [years, setYears] = useState<AcademicYearRow[] | null>(null);
  const [yearId, setYearId] = useState("");
  const [workspace, setWorkspace] = useState<AcademicCatalogWorkspace | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAcademicYears()
      .then((rows) => {
        if (cancelled) return;
        setYears(rows);
        setYearId(
          rows.find((row) => row.status === "active")?.id ?? rows[0]?.id ?? "",
        );
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!yearId) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    setWorkspace(null);
    setError(null);
    getAcademicCatalog(yearId)
      .then((next) => {
        if (!cancelled) setWorkspace(next);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const program = useMemo(
    () =>
      workspace?.hasApprovedRevision
        ? (workspace.effective.programs.find(
            (candidate) => candidate.programCode === code,
          ) ?? null)
        : null,
    [code, workspace],
  );

  return (
    <section
      className={styles.viewer}
      aria-labelledby="approved-curriculum-title"
    >
      <header className={styles.header}>
        <div>
          <div className="eyebrow">Course plan authority</div>
          <h2 id="approved-curriculum-title">{name} course plan</h2>
          <p>
            {workspace && !workspace.hasApprovedRevision
              ? "No director-approved course plan exists for this academic year. The legacy map is available only as a draft seed."
              : "This view is read-only. Students are recommended courses from the director-approved plan for their catalog year."}
          </p>
        </div>
        <Link
          className={styles.editLink}
          href={
            yearId
              ? `/admin/academic-years?year=${encodeURIComponent(yearId)}`
              : "/admin/academic-years"
          }
        >
          {workspace && !workspace.hasApprovedRevision
            ? "Create approved revision"
            : "Edit in Academic Years"}{" "}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <div className={styles.toolbar}>
        <label>
          <span>Academic year</span>
          <Select
            value={yearId}
            onChange={setYearId}
            disabled={!years?.length}
            ariaLabel="Academic year"
            options={(years ?? []).map((year) => ({
              value: year.id,
              label: `${year.label} · ${year.status}`,
            }))}
          />
        </label>
        {workspace?.hasApprovedRevision && (
          <div className={styles.approvalState}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>
              <strong>
                Revision {workspace.effective.revision || "baseline"}
              </strong>
              <small>
                {workspace.effective.approvedAt
                  ? `Approved ${new Date(workspace.effective.approvedAt).toLocaleDateString()}`
                  : "Approved baseline"}
              </small>
            </span>
            <Badge tone="success">Approved</Badge>
          </div>
        )}
      </div>

      <div className={styles.authorityNote}>
        <LockKeyhole size={16} aria-hidden="true" />
        Only a literal approved snapshot is shown here. Legacy curriculum rows
        can seed a new revision, but are never presented as director-approved.
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {!years && <p className="muted">Loading approved academic years…</p>}
      {years?.length === 0 && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="No academic years"
          note="Create and approve an Academic Catalog before publishing a programme course plan."
        />
      )}
      {yearId && !workspace && !error && (
        <p className="muted">Loading approved course plan…</p>
      )}
      {workspace && !workspace.hasApprovedRevision && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="No director-approved course plan"
          note="The legacy curriculum can seed a new Academic Catalog revision, but it is not an approved recommendation source yet."
        />
      )}
      {workspace && workspace.hasApprovedRevision && !program && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title={`${code} is not in this approved catalog`}
          note="Open Academic Years to include the programme in a new revision."
        />
      )}
      {workspace?.hasApprovedRevision && program && (
        <ApprovedPlan program={program} workspace={workspace} />
      )}
    </section>
  );
}

function ApprovedPlan({
  program,
  workspace,
}: {
  program: AcademicCatalogProgram;
  workspace: AcademicCatalogWorkspace;
}) {
  const courseById = useMemo(
    () => new Map(workspace.courses.map((course) => [course.id, course])),
    [workspace.courses],
  );
  const yearCount = Math.max(
    0,
    ...program.curriculum.map((entry) => entry.yearIndex),
  );
  const plannedCredits = program.curriculum.reduce(
    (sum, entry) => sum + (courseById.get(entry.courseId)?.credits ?? 0),
    0,
  );
  const requirementCredits = program.requirements.reduce(
    (sum, requirement) => sum + requirement.requiredCredits,
    0,
  );

  if (program.curriculum.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={22} />}
        title="No approved course plan"
        note="This programme cannot produce plan-based student recommendations until a course sequence is approved."
      />
    );
  }

  return (
    <div className={styles.plan}>
      <div className={styles.summary}>
        <div>
          <span>Planned courses</span>
          <strong>{program.curriculum.length}</strong>
        </div>
        <div>
          <span>Planned credits</span>
          <strong>{plannedCredits}</strong>
        </div>
        <div>
          <span>Degree requirement</span>
          <strong>{requirementCredits || "—"}</strong>
        </div>
        <div>
          <span>Study years</span>
          <strong>{yearCount}</strong>
        </div>
      </div>

      <div className={styles.years}>
        {Array.from({ length: yearCount }, (_, index) => index + 1).map(
          (yearIndex) => {
            const yearEntries = program.curriculum.filter(
              (entry) => entry.yearIndex === yearIndex,
            );
            const yearCredits = yearEntries.reduce(
              (sum, entry) =>
                sum + (courseById.get(entry.courseId)?.credits ?? 0),
              0,
            );
            return (
              <section className={styles.year} key={yearIndex}>
                <header>
                  <div>
                    <span>Study year</span>
                    <h3>{String(yearIndex).padStart(2, "0")}</h3>
                  </div>
                  <strong>{yearCredits} credits</strong>
                </header>
                <div className={styles.semesters}>
                  {SEMESTERS.map((semester) => {
                    const entries = yearEntries
                      .filter((entry) => entry.semester === semester)
                      .sort((left, right) => left.position - right.position);
                    const semesterCredits = entries.reduce(
                      (sum, entry) =>
                        sum + (courseById.get(entry.courseId)?.credits ?? 0),
                      0,
                    );
                    return (
                      <div className={styles.semester} key={semester}>
                        <div className={styles.semesterHeading}>
                          <Badge
                            tone={
                              semester === "Fall"
                                ? "warning"
                                : semester === "Spring"
                                  ? "teal"
                                  : "neutral"
                            }
                          >
                            {semester}
                          </Badge>
                          <span>{semesterCredits} cr</span>
                        </div>
                        {entries.length === 0 ? (
                          <p>No courses planned</p>
                        ) : (
                          <ol>
                            {entries.map((entry, index) => {
                              const course = courseById.get(entry.courseId);
                              return (
                                <li key={entry.courseId}>
                                  <span>
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <div>
                                    <strong>
                                      {course?.code ?? entry.courseCode}
                                    </strong>
                                    <small>
                                      {course?.title ?? "Course unavailable"}
                                    </small>
                                  </div>
                                  <b>{course?.credits ?? "—"} cr</b>
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          },
        )}
      </div>
    </div>
  );
}
