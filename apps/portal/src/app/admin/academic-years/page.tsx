"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  CopyCheck,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type {
  AcademicCatalogDraft,
  AcademicCatalogLevel,
  AcademicCatalogProgram,
  AcademicNotYetGradedStanding,
  AcademicStandingRule,
} from "@mydaust/shared";
import {
  type AcademicCatalogWorkspace,
  type AcademicYearRow,
  createAcademicYear,
  getAcademicCatalog,
  getAcademicYears,
  saveAcademicCatalogDraft,
  submitAcademicCatalog,
} from "@/lib/api";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import {
  type CatalogCourseReference,
  CurriculumPlanEditor,
  curriculumCreditTotal,
  curriculumErrors,
} from "./CurriculumPlanEditor";

function copyLevels(levels: AcademicCatalogLevel[]) {
  return levels.map((level) => ({ ...level }));
}

function copyPrograms(programs: AcademicCatalogProgram[]) {
  return programs.map((program) => ({
    ...program,
    customLevels: copyLevels(program.customLevels),
    requirements: program.requirements.map((requirement) => ({
      ...requirement,
    })),
    curriculum: program.curriculum.map((entry) => ({ ...entry })),
    customStandingRules: copyStandingRules(program.customStandingRules),
  }));
}

function copyStandingRules(rules: AcademicStandingRule[]) {
  return rules.map((rule) => ({ ...rule }));
}

function initialDraft(
  workspace: AcademicCatalogWorkspace,
): AcademicCatalogDraft {
  const source = workspace.editable ?? workspace.effective;
  return {
    yearLabel: source.yearLabel,
    startsOn: source.startsOn,
    endsOn: source.endsOn,
    defaultLevels: copyLevels(source.defaultLevels),
    defaultStandingRules: copyStandingRules(source.defaultStandingRules),
    notYetGradedStanding: { ...source.notYetGradedStanding },
    programs: copyPrograms(
      workspace.editable ? source.programs : workspace.draftSeedPrograms,
    ),
    reason: source.status === "draft" ? (source.reason ?? "") : "",
    activateYear:
      source.status === "draft"
        ? source.activateYear
        : workspace.year.status === "draft",
  };
}

function total(program: AcademicCatalogProgram) {
  return program.requirements.reduce(
    (sum, requirement) => sum + requirement.requiredCredits,
    0,
  );
}

export default function AcademicCatalogPage() {
  const requestedYearId = useSearchParams().get("year");
  const [years, setYears] = useState<AcademicYearRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<AcademicCatalogWorkspace | null>(
    null,
  );
  const [draft, setDraft] = useState<AcademicCatalogDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadYears = useCallback(async () => {
    const rows = await getAcademicYears();
    setYears(rows);
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current)
        ? current
        : (rows.find((row) => row.id === requestedYearId)?.id ??
          rows.find((row) => row.status === "active")?.id ??
          rows.at(-1)?.id ??
          null),
    );
  }, [requestedYearId]);

  useEffect(() => {
    loadYears().catch((cause: Error) => setError(cause.message));
  }, [loadYears]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedId) return;
    setWorkspace(null);
    setDraft(null);
    setError(null);
    const next = await getAcademicCatalog(selectedId);
    setWorkspace(next);
    setDraft(initialDraft(next));
  }, [selectedId]);

  useEffect(() => {
    loadWorkspace().catch((cause: Error) => setError(cause.message));
  }, [loadWorkspace]);

  const isPending = workspace?.editable?.status === "pending";
  const isDraft = workspace?.editable?.status === "draft";
  const customCount =
    draft?.programs.filter((program) => program.progressionMode === "custom")
      .length ?? 0;
  const configuredCount =
    draft?.programs.filter((program) => program.requirements.length > 0)
      .length ?? 0;
  const curriculumProblemCount =
    draft && workspace
      ? draft.programs.reduce(
          (count, program) =>
            count +
            curriculumErrors(
              program,
              workspace.courses,
              program.progressionMode === "custom"
                ? program.customLevels
                : draft.defaultLevels,
            ).length,
          0,
        )
      : 0;

  async function addYear() {
    if (!years) return;
    setBusy(true);
    setError(null);
    try {
      const last = years.at(-1)?.label ?? "";
      const match = /(\d{4}).*?(\d{4})/.exec(last);
      const label = match
        ? `${Number(match[1]) + 1}–${Number(match[2]) + 1}`
        : "New catalog year";
      const created = await createAcademicYear(label);
      await loadYears();
      setSelectedId(created.id);
      setNotice("Draft academic year created. Configure it before submission.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the catalog year.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(submit = false) {
    if (!selectedId || !draft) return;
    if (curriculumProblemCount > 0) {
      setError(
        "Resolve the highlighted programme course-plan errors before saving this catalog.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveAcademicCatalogDraft(selectedId, draft);
      if (submit) {
        const result = await submitAcademicCatalog(selectedId);
        setNotice(
          `Revision ${result.revision} was sent to the director for approval.`,
        );
      } else {
        setNotice(
          "Catalog draft saved. Students still use the approved revision.",
        );
      }
      await Promise.all([loadYears(), loadWorkspace()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the catalog.",
      );
    } finally {
      setBusy(false);
    }
  }

  function setLevel(
    scope: "default" | number,
    index: number,
    patch: Partial<AcademicCatalogLevel>,
  ) {
    setDraft((current) => {
      if (!current) return current;
      if (scope === "default") {
        const next = copyLevels(current.defaultLevels);
        next[index] = { ...next[index]!, ...patch };
        return { ...current, defaultLevels: next };
      }
      const programs = copyPrograms(current.programs);
      const program = programs[scope]!;
      program.customLevels[index] = {
        ...program.customLevels[index]!,
        ...patch,
      };
      return { ...current, programs };
    });
  }

  function addLevel(scope: "default" | number) {
    setDraft((current) => {
      if (!current) return current;
      const programs = copyPrograms(current.programs);
      const target =
        scope === "default"
          ? copyLevels(current.defaultLevels)
          : programs[scope]!.customLevels;
      const previous = target.at(-1);
      target.push({
        code: `S${target.length + 1}`,
        name: `Semester ${target.length + 1}`,
        creditCeiling: (previous?.creditCeiling ?? 0) + 30,
      });
      return scope === "default"
        ? { ...current, defaultLevels: target }
        : { ...current, programs };
    });
  }

  function removeLevel(scope: "default" | number, index: number) {
    setDraft((current) => {
      if (!current) return current;
      const programs = copyPrograms(current.programs);
      if (scope === "default") {
        return {
          ...current,
          defaultLevels: current.defaultLevels.filter(
            (_, position) => position !== index,
          ),
        };
      }
      programs[scope]!.customLevels = programs[scope]!.customLevels.filter(
        (_, position) => position !== index,
      );
      return { ...current, programs };
    });
  }

  const selectedYear = years?.find((year) => year.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic Catalog"
        subtitle="Catalog years, programme course plans, degree requirements and earned-credit progression—published only after director approval."
        actions={
          <Button variant="primary" onClick={addYear} disabled={busy || !years}>
            Add catalog year
          </Button>
        }
      />

      {error && (
        <div className="catalog-alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="catalog-alert success" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}

      {!years && <p className="muted">Loading academic catalogs…</p>}
      {years?.length === 0 && (
        <EmptyState title="No academic years configured" />
      )}

      {years && years.length > 0 && (
        <div className="catalog-layout">
          <aside className="catalog-years" aria-label="Catalog years">
            {years.map((year) => (
              <button
                key={year.id}
                className={year.id === selectedId ? "selected" : ""}
                onClick={() => setSelectedId(year.id)}
              >
                <span className="catalog-year-icon">
                  <CalendarClock size={16} />
                </span>
                <span className="catalog-year-copy">
                  <strong>{year.label}</strong>
                  <small>{year._count.terms} terms</small>
                </span>
                <Badge
                  tone={
                    year.status === "active"
                      ? "success"
                      : year.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {year.status}
                </Badge>
                <ChevronRight size={15} />
              </button>
            ))}
          </aside>

          <main className="catalog-editor">
            {!workspace || !draft ? (
              <p className="muted">
                Loading {selectedYear?.label ?? "catalog"}…
              </p>
            ) : (
              <>
                <header className="catalog-editor-head">
                  <div>
                    <div className="catalog-kicker">
                      {workspace.editable
                        ? `${isPending ? "Pending" : "Draft"} revision ${workspace.editable.revision}`
                        : workspace.hasApprovedRevision
                          ? `Approved revision ${workspace.effective.revision}`
                          : "Legacy baseline"}
                    </div>
                    <h2>{workspace.year.label}</h2>
                    <p>
                      {configuredCount} programmes configured · {customCount}{" "}
                      custom progression{" "}
                      {customCount === 1 ? "scheme" : "schemes"} ·{" "}
                      {draft.programs.reduce(
                        (count, program) => count + program.curriculum.length,
                        0,
                      )}{" "}
                      planned courses
                    </p>
                  </div>
                  <div className="catalog-status-stack">
                    <Badge
                      tone={
                        isPending || isDraft
                          ? "warning"
                          : workspace.hasApprovedRevision
                            ? "success"
                            : "neutral"
                      }
                    >
                      {isPending
                        ? "Director review pending"
                        : isDraft
                          ? "Draft revision in progress"
                          : workspace.hasApprovedRevision
                            ? "Approved catalog active"
                            : "Legacy baseline · not approved"}
                    </Badge>
                    {workspace.effective.approvedAt && (
                      <small>
                        Approved{" "}
                        {new Date(
                          workspace.effective.approvedAt,
                        ).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                </header>

                <fieldset
                  disabled={busy || isPending}
                  className="catalog-fieldset"
                >
                  <section className="catalog-section catalog-metadata">
                    <div className="section-heading">
                      <div>
                        <span>01</span>
                        <h3>Catalog identity</h3>
                      </div>
                      <p>
                        The public label and operating dates for this academic
                        catalog.
                      </p>
                    </div>
                    <div className="metadata-grid">
                      <Field label="Catalog label">
                        <input
                          value={draft.yearLabel}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              yearLabel: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Starts on">
                        <input
                          type="date"
                          value={draft.startsOn ?? ""}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              startsOn: event.target.value || null,
                            })
                          }
                        />
                      </Field>
                      <Field label="Ends on">
                        <input
                          type="date"
                          value={draft.endsOn ?? ""}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              endsOn: event.target.value || null,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </section>

                  <section className="catalog-section">
                    <div className="section-heading">
                      <div>
                        <span>02</span>
                        <h3>Institutional progression</h3>
                      </div>
                      <p>
                        Programmes inherit these earned-credit bands unless they
                        retain a custom scheme.
                      </p>
                    </div>
                    <LevelEditor
                      levels={draft.defaultLevels}
                      onChange={(index, patch) =>
                        setLevel("default", index, patch)
                      }
                      onAdd={() => addLevel("default")}
                      onRemove={(index) => removeLevel("default", index)}
                    />
                  </section>

                  <section className="catalog-section">
                    <div className="section-heading">
                      <div>
                        <span>03</span>
                        <h3>Academic standing</h3>
                      </div>
                      <p>
                        The highest cumulative-GPA threshold determines the
                        student&apos;s standing. Programmes may retain a custom
                        policy.
                      </p>
                    </div>
                    <StandingEditor
                      rules={draft.defaultStandingRules}
                      notYet={draft.notYetGradedStanding}
                      onNotYetChange={(notYetGradedStanding) =>
                        setDraft({
                          ...draft,
                          notYetGradedStanding,
                        })
                      }
                      onChange={(rules) =>
                        setDraft({ ...draft, defaultStandingRules: rules })
                      }
                    />
                  </section>

                  <section className="catalog-section">
                    <div className="section-heading">
                      <div>
                        <span>04</span>
                        <h3>Programme plans &amp; requirements</h3>
                      </div>
                      <p>
                        Ordered course plans power student recommendations;
                        category credits define each degree total. Custom
                        programmes stay custom unless explicitly conformed.
                      </p>
                    </div>
                    <div className="programme-list">
                      {draft.programs.map((program, programIndex) => (
                        <ProgrammeEditor
                          key={program.programId}
                          program={program}
                          courses={workspace.courses}
                          defaultLevels={draft.defaultLevels}
                          defaultStandingRules={draft.defaultStandingRules}
                          onChange={(next) => {
                            const programs = copyPrograms(draft.programs);
                            programs[programIndex] = next;
                            setDraft({ ...draft, programs });
                          }}
                          onLevelChange={(index, patch) =>
                            setLevel(programIndex, index, patch)
                          }
                          onAddLevel={() => addLevel(programIndex)}
                          onRemoveLevel={(index) =>
                            removeLevel(programIndex, index)
                          }
                        />
                      ))}
                    </div>
                  </section>

                  <section className="catalog-section catalog-submit">
                    <div>
                      <Field label="Reason for this revision">
                        <textarea
                          rows={3}
                          value={draft.reason}
                          onChange={(event) =>
                            setDraft({ ...draft, reason: event.target.value })
                          }
                          placeholder="Explain what changed and why the director should approve it."
                        />
                      </Field>
                      <label className="activate-check">
                        <input
                          type="checkbox"
                          checked={draft.activateYear}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              activateYear: event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>
                            Make this the active academic year after approval
                          </strong>
                          <small>
                            The currently active year will be archived
                            atomically.
                          </small>
                        </span>
                      </label>
                    </div>
                    <div className="catalog-submit-actions">
                      <Button
                        variant="secondary"
                        icon={<CopyCheck size={15} />}
                        onClick={() => void save(false)}
                        disabled={
                          !draft.reason.trim() || curriculumProblemCount > 0
                        }
                        title={
                          curriculumProblemCount > 0
                            ? "Resolve course-plan errors before saving"
                            : undefined
                        }
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="primary"
                        icon={<Send size={15} />}
                        onClick={() => void save(true)}
                        disabled={
                          !draft.reason.trim() || curriculumProblemCount > 0
                        }
                        title={
                          curriculumProblemCount > 0
                            ? "Resolve course-plan errors before submitting"
                            : undefined
                        }
                      >
                        Submit to director
                      </Button>
                    </div>
                  </section>
                </fieldset>

                {workspace.history.length > 0 && (
                  <section className="catalog-history">
                    <div className="section-heading">
                      <div>
                        <span>05</span>
                        <h3>Revision history</h3>
                      </div>
                      <p>
                        Requester and director identities remain attached to
                        every catalog decision.
                      </p>
                    </div>
                    <div className="catalog-history-list">
                      {workspace.history.map((revision) => (
                        <article key={revision.id}>
                          <div>
                            <strong>Revision {revision.revision}</strong>
                            <Badge
                              tone={
                                revision.status === "approved"
                                  ? "success"
                                  : revision.status === "pending"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {revision.status}
                            </Badge>
                          </div>
                          <p>{revision.reason ?? "No reason recorded"}</p>
                          <small>
                            Requested by {revision.requester?.name ?? "Legacy"}
                            {revision.reviewer
                              ? ` · Reviewed by ${revision.reviewer.name}`
                              : " · Not reviewed"}
                            {` · ${new Date(revision.createdAt).toLocaleDateString()}`}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      )}

      <style jsx global>{`
        .catalog-layout {
          display: grid;
          grid-template-columns: 270px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .catalog-years {
          display: grid;
          gap: 7px;
          position: sticky;
          top: 16px;
        }
        .catalog-years > button {
          width: 100%;
          border: 1px solid transparent;
          background: transparent;
          color: var(--fg2);
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto 15px;
          align-items: center;
          gap: 9px;
          padding: 10px;
          border-radius: var(--radius-md);
          text-align: left;
          cursor: pointer;
        }
        .catalog-years > button:hover {
          background: var(--bg-subtle);
        }
        .catalog-years > button.selected {
          background: var(--surface);
          border-color: var(--border);
          box-shadow: var(--shadow-xs);
          color: var(--fg1);
        }
        .catalog-year-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: var(--bg-tint);
          color: var(--daust-navy);
          display: grid;
          place-items: center;
        }
        .catalog-year-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .catalog-year-copy strong {
          font-size: 13.5px;
        }
        .catalog-year-copy small,
        .catalog-status-stack small {
          color: var(--fg3);
          font-size: 11px;
        }
        .catalog-editor {
          min-width: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          overflow: hidden;
          box-shadow: var(--shadow-xs);
        }
        .catalog-editor-head {
          padding: 22px 24px;
          background: var(--daust-navy);
          color: #f7f9fc;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }
        .catalog-editor-head h2 {
          font: 800 25px/1.1 var(--font-display);
          margin: 3px 0 6px;
        }
        .catalog-editor-head p {
          margin: 0;
          color: rgba(247, 249, 252, 0.7);
          font-size: 12.5px;
        }
        .catalog-kicker {
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #f0a05b;
        }
        .catalog-status-stack {
          display: grid;
          gap: 7px;
          justify-items: end;
        }
        .catalog-fieldset {
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        .catalog-fieldset:disabled {
          opacity: 0.72;
        }
        .catalog-section {
          padding: 23px 24px;
          border-bottom: 1px solid var(--divider);
        }
        .section-heading {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 17px;
        }
        .section-heading > div {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-heading span {
          font: 750 10px var(--font-display);
          letter-spacing: 0.08em;
          color: var(--daust-orange);
        }
        .section-heading h3 {
          font: 750 16px var(--font-display);
          margin: 0;
        }
        .section-heading p {
          margin: 0;
          max-width: 520px;
          color: var(--fg3);
          font-size: 12.5px;
          text-align: right;
          line-height: 1.5;
        }
        .metadata-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr;
          gap: 14px;
        }
        .level-table {
          display: grid;
          gap: 7px;
        }
        .level-row {
          display: grid;
          grid-template-columns: 28px 110px minmax(160px, 1fr) 150px 34px;
          gap: 8px;
          align-items: center;
        }
        .level-number {
          color: var(--fg3);
          font: 700 11px var(--font-display);
        }
        .level-row input {
          width: 100%;
        }
        .standing-row {
          grid-template-columns:
            28px 110px minmax(150px, 1fr)
            105px 72px 120px 34px;
        }
        .standing-row select {
          width: 100%;
        }
        .icon-button {
          width: 32px;
          height: 32px;
          border: 0;
          background: transparent;
          color: var(--fg3);
          border-radius: 8px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .icon-button:hover {
          background: color-mix(in srgb, var(--danger) 8%, var(--surface));
          color: var(--error-500);
        }
        .level-add {
          justify-self: start;
          margin-top: 5px;
          border: 0;
          background: transparent;
          color: var(--daust-navy);
          font-weight: 700;
          font-size: 12.5px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .programme-list {
          display: grid;
          gap: 9px;
        }
        .programme-editor {
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          content-visibility: auto;
          contain-intrinsic-size: 58px 420px;
        }
        .programme-editor summary {
          list-style: none;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 12px;
          align-items: center;
          padding: 13px 15px;
          cursor: pointer;
          background: var(--bg-subtle);
        }
        .programme-editor summary::-webkit-details-marker {
          display: none;
        }
        .programme-title {
          display: grid;
          gap: 2px;
        }
        .programme-title strong {
          font-size: 13.5px;
        }
        .programme-title small {
          font-size: 11.5px;
          color: var(--fg3);
        }
        .programme-body {
          padding: 17px;
        }
        .programme-mode {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding-bottom: 14px;
          margin-bottom: 14px;
          border-bottom: 1px solid var(--divider);
        }
        .programme-mode p {
          margin: 2px 0 0;
          color: var(--fg3);
          font-size: 12px;
        }
        .requirement-grid {
          display: grid;
          gap: 7px;
          margin-top: 12px;
        }
        .requirement-row {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) 130px 34px;
          gap: 8px;
          align-items: center;
        }
        .programme-total {
          font-size: 12px;
          color: var(--fg3);
          font-weight: 650;
        }
        .custom-levels {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--divider);
        }
        .custom-levels h4 {
          margin: 0 0 10px;
          font: 700 13px var(--font-display);
        }
        .catalog-submit {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 24px;
          align-items: end;
          border-bottom: 0;
          background: var(--bg-subtle);
        }
        .activate-check {
          display: flex;
          gap: 9px;
          align-items: flex-start;
          margin-top: 12px;
          font-size: 12.5px;
        }
        .activate-check input {
          margin-top: 3px;
          accent-color: var(--daust-orange);
        }
        .activate-check span {
          display: grid;
          gap: 2px;
        }
        .activate-check small {
          color: var(--fg3);
        }
        .catalog-submit-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .catalog-history {
          padding: 23px 24px;
          border-top: 1px solid var(--divider);
        }
        .catalog-history-list {
          display: grid;
          gap: 8px;
        }
        .catalog-history-list article {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 11px 13px;
          background: var(--bg-subtle);
        }
        .catalog-history-list article > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .catalog-history-list strong {
          font: 700 12.5px var(--font-display);
        }
        .catalog-history-list p {
          margin: 5px 0 3px;
          font-size: 12px;
          color: var(--fg2);
        }
        .catalog-history-list small {
          color: var(--fg3);
          font-size: 11px;
        }
        .catalog-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 13px;
          border-radius: var(--radius-md);
          font-size: 13px;
          margin-bottom: 12px;
        }
        .catalog-alert.error {
          background: color-mix(in srgb, var(--danger) 8%, var(--surface));
          color: var(--error-500);
        }
        .catalog-alert.success {
          background: color-mix(in srgb, var(--success) 9%, var(--surface));
          color: var(--success);
        }
        @media (max-width: 980px) {
          .catalog-layout {
            grid-template-columns: 1fr;
          }
          .catalog-years {
            position: static;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .section-heading {
            display: grid;
          }
          .section-heading p {
            text-align: left;
          }
          .metadata-grid {
            grid-template-columns: 1fr 1fr;
          }
          .catalog-submit {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .catalog-editor-head,
          .catalog-section,
          .catalog-history {
            padding: 18px 15px;
          }
          .catalog-editor-head {
            display: grid;
          }
          .catalog-status-stack {
            justify-items: start;
          }
          .metadata-grid {
            grid-template-columns: 1fr;
          }
          .level-row {
            grid-template-columns: 24px 74px minmax(110px, 1fr) 92px 30px;
          }
          .standing-row {
            grid-template-columns: 24px minmax(95px, 1fr) minmax(110px, 1fr);
          }
          .standing-row > :nth-child(4),
          .standing-row > :nth-child(5),
          .standing-row > :nth-child(6) {
            grid-column: auto;
          }
          .programme-editor summary {
            grid-template-columns: minmax(0, 1fr) auto;
          }
          .programme-editor summary > .programme-total {
            display: none;
          }
          .requirement-row {
            grid-template-columns: minmax(120px, 1fr) 90px 30px;
          }
          .catalog-submit-actions {
            justify-content: stretch;
          }
          .catalog-submit-actions > * {
            flex: 1;
          }
        }
      `}</style>
    </>
  );
}

function LevelEditor({
  levels,
  onChange,
  onAdd,
  onRemove,
}: {
  levels: AcademicCatalogLevel[];
  onChange: (index: number, patch: Partial<AcademicCatalogLevel>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="level-table">
      {levels.map((level, index) => (
        <div className="level-row" key={index}>
          <span className="level-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <input
            aria-label={`Level ${index + 1} code`}
            value={level.code}
            onChange={(event) => onChange(index, { code: event.target.value })}
          />
          <input
            aria-label={`Level ${index + 1} name`}
            value={level.name}
            onChange={(event) => onChange(index, { name: event.target.value })}
          />
          <input
            aria-label={`Level ${index + 1} credit ceiling`}
            type="number"
            min={0}
            value={level.creditCeiling}
            onChange={(event) =>
              onChange(index, { creditCeiling: Number(event.target.value) })
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${level.code}`}
            onClick={() => onRemove(index)}
            disabled={levels.length === 1}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="level-add" onClick={onAdd}>
        <Plus size={14} /> Add progression level
      </button>
    </div>
  );
}

function ProgrammeEditor({
  program,
  courses,
  defaultLevels,
  defaultStandingRules,
  onChange,
  onLevelChange,
  onAddLevel,
  onRemoveLevel,
}: {
  program: AcademicCatalogProgram;
  courses: CatalogCourseReference[];
  defaultLevels: AcademicCatalogLevel[];
  defaultStandingRules: AcademicStandingRule[];
  onChange: (program: AcademicCatalogProgram) => void;
  onLevelChange: (index: number, patch: Partial<AcademicCatalogLevel>) => void;
  onAddLevel: () => void;
  onRemoveLevel: (index: number) => void;
}) {
  const custom = program.progressionMode === "custom";
  const customStanding = program.standingMode === "custom";
  const coursePlanCredits = curriculumCreditTotal(program, courses);
  const coursePlanProblems = curriculumErrors(
    program,
    courses,
    custom ? program.customLevels : defaultLevels,
  ).length;
  return (
    <details className="programme-editor">
      <summary>
        <span className="programme-title">
          <strong>
            {program.programCode} — {program.programName}
          </strong>
          <small>
            {program.requirements.length
              ? `${program.requirements.length} requirement categories`
              : "Requirements not configured"}
            {` · ${program.curriculum.length} planned courses · ${coursePlanCredits} course credits`}
            {coursePlanProblems > 0
              ? ` · ${coursePlanProblems} ${coursePlanProblems === 1 ? "plan error" : "plan errors"}`
              : ""}
          </small>
        </span>
        <span className="programme-total">{total(program) || "—"} credits</span>
        <Badge tone={custom ? "info" : "neutral"}>
          {custom ? "Custom progression" : "Institutional default"}
        </Badge>
      </summary>
      <div className="programme-body">
        <div className="programme-mode">
          <div>
            <strong>
              {custom
                ? "Custom progression retained"
                : "Uses institutional default"}
            </strong>
            <p>
              {custom
                ? "Default changes will not alter this programme unless you conform it."
                : "This programme follows the approved institutional level labels and ceilings."}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={
              custom ? <CopyCheck size={14} /> : <SlidersHorizontal size={14} />
            }
            onClick={() =>
              onChange({
                ...program,
                progressionMode: custom ? "default" : "custom",
                customLevels: custom ? [] : copyLevels(defaultLevels),
              })
            }
          >
            {custom ? "Conform to default" : "Create custom scheme"}
          </Button>
        </div>

        <strong style={{ fontSize: 13 }}>Degree requirements</strong>
        <div className="requirement-grid">
          {program.requirements.map((requirement, index) => (
            <div className="requirement-row" key={index}>
              <input
                aria-label={`${program.programCode} requirement category`}
                value={requirement.category}
                onChange={(event) => {
                  const requirements = program.requirements.map(
                    (row, position) =>
                      position === index
                        ? { ...row, category: event.target.value }
                        : row,
                  );
                  onChange({ ...program, requirements });
                }}
              />
              <input
                aria-label={`${requirement.category} required credits`}
                type="number"
                min={1}
                value={requirement.requiredCredits}
                onChange={(event) => {
                  const requirements = program.requirements.map(
                    (row, position) =>
                      position === index
                        ? {
                            ...row,
                            requiredCredits: Number(event.target.value),
                          }
                        : row,
                  );
                  onChange({ ...program, requirements });
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${requirement.category}`}
                onClick={() =>
                  onChange({
                    ...program,
                    requirements: program.requirements.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="level-add"
            onClick={() =>
              onChange({
                ...program,
                requirements: [
                  ...program.requirements,
                  { category: "New requirement", requiredCredits: 3 },
                ],
              })
            }
          >
            <Plus size={14} /> Add requirement category
          </button>
        </div>

        <CurriculumPlanEditor
          program={program}
          courses={courses}
          progressionLevels={custom ? program.customLevels : defaultLevels}
          onChange={onChange}
        />

        {custom && (
          <div className="custom-levels">
            <h4>Custom progression levels</h4>
            <LevelEditor
              levels={program.customLevels}
              onChange={onLevelChange}
              onAdd={onAddLevel}
              onRemove={onRemoveLevel}
            />
          </div>
        )}

        <div className="programme-mode">
          <div>
            <strong>
              {customStanding
                ? "Custom standing policy retained"
                : "Uses institutional standing policy"}
            </strong>
            <p>
              {customStanding
                ? "Institutional threshold changes will not alter this programme unless you conform it."
                : "This programme follows the approved institutional cumulative-GPA thresholds."}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={
              customStanding ? (
                <CopyCheck size={14} />
              ) : (
                <SlidersHorizontal size={14} />
              )
            }
            onClick={() =>
              onChange({
                ...program,
                standingMode: customStanding ? "default" : "custom",
                customStandingRules: customStanding
                  ? []
                  : copyStandingRules(defaultStandingRules),
              })
            }
          >
            {customStanding ? "Conform to default" : "Create custom policy"}
          </Button>
        </div>

        {customStanding && (
          <StandingEditor
            rules={program.customStandingRules}
            onChange={(customStandingRules) =>
              onChange({ ...program, customStandingRules })
            }
          />
        )}
      </div>
    </details>
  );
}

function StandingEditor({
  rules,
  notYet,
  onNotYetChange,
  onChange,
}: {
  rules: AcademicStandingRule[];
  notYet?: AcademicNotYetGradedStanding;
  onNotYetChange?: (value: AcademicNotYetGradedStanding) => void;
  onChange: (rules: AcademicStandingRule[]) => void;
}) {
  const update = (index: number, patch: Partial<AcademicStandingRule>) =>
    onChange(
      rules.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule,
      ),
    );
  return (
    <div className="level-table">
      {notYet && onNotYetChange && (
        <div className="level-row">
          <span className="level-number">—</span>
          <input
            value="not_yet_graded"
            disabled
            aria-label="Not yet graded code"
          />
          <input
            value={notYet.label}
            aria-label="Not yet graded label"
            onChange={(event) =>
              onNotYetChange({ ...notYet, label: event.target.value })
            }
          />
          <input
            value="No GPA credits"
            disabled
            aria-label="Not yet graded condition"
          />
          <select
            value={notYet.tone}
            aria-label="Not yet graded tone"
            onChange={(event) =>
              onNotYetChange({
                ...notYet,
                tone: event.target.value as AcademicStandingRule["tone"],
              })
            }
          >
            <option value="neutral">Neutral</option>
            <option value="success">Success</option>
            <option value="honor">Honor</option>
            <option value="warning">Warning</option>
          </select>
        </div>
      )}
      {rules.map((rule, index) => (
        <div className="level-row standing-row" key={`${rule.code}-${index}`}>
          <span className="level-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <input
            aria-label={`Standing ${index + 1} code`}
            value={rule.code}
            onChange={(event) => update(index, { code: event.target.value })}
          />
          <input
            aria-label={`Standing ${index + 1} label`}
            value={rule.label}
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <input
            aria-label={`${rule.label} minimum GPA`}
            type="number"
            min={0}
            max={4}
            step={0.01}
            value={rule.minimumGpa}
            onChange={(event) =>
              update(index, { minimumGpa: Number(event.target.value) })
            }
          />
          <select
            aria-label={`${rule.label} order`}
            value={rule.order}
            onChange={(event) =>
              update(index, { order: Number(event.target.value) })
            }
          >
            {Array.from(
              { length: Math.max(10, rules.length + 2) },
              (_, order) => (
                <option key={order} value={order}>
                  Order {order}
                </option>
              ),
            )}
          </select>
          <select
            aria-label={`${rule.label} tone`}
            value={rule.tone}
            onChange={(event) =>
              update(index, {
                tone: event.target.value as AcademicStandingRule["tone"],
              })
            }
          >
            <option value="neutral">Neutral</option>
            <option value="success">Success</option>
            <option value="honor">Honor</option>
            <option value="warning">Warning</option>
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${rule.label}`}
            disabled={rules.length === 1}
            onClick={() =>
              onChange(rules.filter((_, position) => position !== index))
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="level-add"
        onClick={() =>
          onChange([
            ...rules,
            {
              code: `standing_${rules.length + 1}`,
              label: "New standing",
              minimumGpa:
                Array.from({ length: 401 }, (_, value) => value / 100).find(
                  (value) => !rules.some((rule) => rule.minimumGpa === value),
                ) ?? 4,
              order: Math.max(-1, ...rules.map((rule) => rule.order)) + 1,
              tone: "neutral",
            },
          ])
        }
      >
        <Plus size={14} /> Add standing threshold
      </button>
    </div>
  );
}
