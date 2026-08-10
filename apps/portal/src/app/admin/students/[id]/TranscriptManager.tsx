"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  BookMarked,
  CheckCircle2,
  FileClock,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  type AdminPrograms,
  type TermRow,
  type TranscriptEntryInput,
  type TranscriptEntryRow,
  createTranscriptEntry,
  getAdminCourseDetail,
  getAdminPrograms,
  getRegistrarTranscript,
  getTerms,
  restoreTranscriptEntry,
  updateTranscriptEntry,
  voidTranscriptEntry,
} from "@/lib/api";
import { Badge, EmptyState, Field, Modal, Select } from "@/components/ui";

const SOURCE_LABEL: Record<TranscriptEntryRow["source"], string> = {
  approved_enrollment: "Approved grade",
  legacy_import: "Legacy import",
  manual: "Manual entry",
};

const SOURCE_TONE: Record<
  TranscriptEntryRow["source"],
  "success" | "warning" | "info"
> = {
  approved_enrollment: "success",
  legacy_import: "warning",
  manual: "info",
};

interface TranscriptSummary {
  gpa: number;
  attemptedCredits: number;
  earnedCredits: number;
}

function summarize(rows: TranscriptEntryRow[]): TranscriptSummary {
  let attemptedCredits = 0;
  let qualityPoints = 0;
  const earnedByCourse = new Map<string, number>();

  for (const row of rows) {
    if (row.countsTowardGpa && row.points !== null) {
      attemptedCredits += row.credits;
      qualityPoints += row.points * row.credits;
    }
    if (row.countsTowardCredits && row.earnedCredits > 0) {
      const identity =
        row.courseId ??
        row.courseCode.trim().toUpperCase().replace(/\s+/g, " ");
      earnedByCourse.set(
        identity,
        Math.max(earnedByCourse.get(identity) ?? 0, row.earnedCredits),
      );
    }
  }

  return {
    gpa:
      attemptedCredits === 0
        ? 0
        : Math.round((qualityPoints / attemptedCredits) * 100) / 100,
    attemptedCredits,
    earnedCredits: [...earnedByCourse.values()].reduce(
      (total, credits) => total + credits,
      0,
    ),
  };
}

function gradeTone(grade: string): string {
  const normalized = grade.trim().toUpperCase();
  if (normalized.startsWith("A")) return "var(--success)";
  if (["F", "I", "W"].includes(normalized)) return "var(--danger)";
  return "var(--daust-navy)";
}

export function TranscriptManager({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<TranscriptEntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(true);
  const [editing, setEditing] = useState<TranscriptEntryRow | "new" | null>(
    null,
  );
  const [action, setAction] = useState<{
    type: "void" | "restore";
    entry: TranscriptEntryRow;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await getRegistrarTranscript(studentId, true));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the transcript.",
      );
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRows = useMemo(
    () => (rows ?? []).filter((entry) => !entry.voidedAt),
    [rows],
  );
  const visibleRows = useMemo(
    () => (showVoided ? (rows ?? []) : activeRows),
    [activeRows, rows, showVoided],
  );
  const summary = useMemo(() => summarize(activeRows), [activeRows]);
  const groups = useMemo(() => {
    const grouped = new Map<string, TranscriptEntryRow[]>();
    for (const entry of visibleRows) {
      const group = grouped.get(entry.term);
      if (group) group.push(entry);
      else grouped.set(entry.term, [entry]);
    }
    return [...grouped.entries()];
  }, [visibleRows]);
  const voidedCount = (rows ?? []).length - activeRows.length;

  async function mutationFinished(message: string) {
    setEditing(null);
    setAction(null);
    setNotice(message);
    await load();
  }

  return (
    <section className="transcript-manager" aria-labelledby="transcript-title">
      <div className="transcript-toolbar">
        <div className="transcript-heading">
          <span className="transcript-mark" aria-hidden="true">
            <BookMarked size={18} />
          </span>
          <div>
            <h2 id="transcript-title">Canonical transcript</h2>
            <p>
              Official academic history. Corrections are retained in the audit
              trail.
            </p>
          </div>
        </div>
        <div className="transcript-toolbar-actions">
          <label className="transcript-toggle">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(event) => setShowVoided(event.target.checked)}
            />
            Show voided{voidedCount ? ` (${voidedCount})` : ""}
          </label>
          <button
            className="primary transcript-add"
            onClick={() => setEditing("new")}
          >
            <Plus size={15} aria-hidden="true" /> Add entry
          </button>
        </div>
      </div>

      <div className="transcript-summary" aria-label="Transcript summary">
        <SummaryMetric
          label="Cumulative GPA"
          value={summary.attemptedCredits ? summary.gpa.toFixed(2) : "—"}
          detail="4.00 scale"
        />
        <SummaryMetric
          label="Attempted credits"
          value={String(summary.attemptedCredits)}
          detail="GPA-bearing"
        />
        <SummaryMetric
          label="Earned credits"
          value={String(summary.earnedCredits)}
          detail="Retakes counted once"
        />
      </div>

      {notice && (
        <div className="transcript-notice" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          {notice}
        </div>
      )}
      {error && (
        <div className="transcript-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}

      {!rows && !error && <p className="muted">Loading transcript…</p>}
      {rows && visibleRows.length === 0 && (
        <EmptyState
          title={
            rows.length ? "No active entries" : "No transcript entries yet"
          }
          note={
            rows.length
              ? "Turn on “Show voided” to review corrected records."
              : "Add verified historical work here. Future approved grades are added automatically."
          }
        />
      )}

      {groups.length > 0 && (
        <div className="transcript-terms">
          {groups.map(([term, entries]) => (
            <TermGroup
              key={term}
              term={term}
              entries={entries}
              onEdit={setEditing}
              onAction={(type, entry) => setAction({ type, entry })}
            />
          ))}
        </div>
      )}

      {editing && (
        <TranscriptEntryModal
          entry={editing === "new" ? null : editing}
          studentId={studentId}
          onClose={() => setEditing(null)}
          onSaved={(mode) =>
            mutationFinished(
              mode === "create"
                ? "Transcript entry added."
                : "Transcript entry updated.",
            )
          }
        />
      )}
      {action && (
        <TranscriptReasonModal
          action={action.type}
          entry={action.entry}
          onClose={() => setAction(null)}
          onSaved={() =>
            mutationFinished(
              action.type === "void"
                ? "Transcript entry voided."
                : "Transcript entry restored.",
            )
          }
        />
      )}

      <style jsx global>{`
        .transcript-manager {
          --transcript-navy: var(--daust-navy);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          background: var(--surface);
          overflow: hidden;
          box-shadow: var(--shadow-xs);
        }
        .transcript-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 20px;
          border-bottom: 1px solid var(--divider);
        }
        .transcript-heading,
        .transcript-toolbar-actions,
        .transcript-actions,
        .transcript-notice {
          display: flex;
          align-items: center;
        }
        .transcript-heading {
          gap: 12px;
          min-width: 0;
        }
        .transcript-heading h2 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 750;
          color: var(--fg1);
        }
        .transcript-heading p {
          margin: 2px 0 0;
          color: var(--fg3);
          font-size: 12.5px;
        }
        .transcript-mark {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          background: var(--bg-tint);
          color: var(--transcript-navy);
        }
        .transcript-toolbar-actions {
          gap: 12px;
          flex-wrap: wrap;
        }
        .transcript-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--fg2);
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .transcript-toggle input {
          margin: 0;
          accent-color: var(--daust-orange);
        }
        .transcript-add {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .transcript-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          background: var(--transcript-navy);
          color: #f7f9fc;
        }
        .transcript-summary-item {
          padding: 15px 20px;
        }
        .transcript-summary-item + .transcript-summary-item {
          border-left: 1px solid rgba(255, 255, 255, 0.16);
        }
        .transcript-summary-label {
          color: rgba(247, 249, 252, 0.7);
          font-size: 10.5px;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .transcript-summary-value {
          display: inline-block;
          margin-top: 4px;
          font-family: var(--font-display);
          font-size: 23px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .transcript-summary-detail {
          margin-left: 7px;
          color: rgba(247, 249, 252, 0.58);
          font-size: 11px;
        }
        .transcript-notice,
        .transcript-error {
          gap: 7px;
          margin: 14px 18px 0;
          padding: 9px 11px;
          border-radius: 9px;
          font-size: 12.5px;
        }
        .transcript-notice {
          background: color-mix(in srgb, var(--success) 10%, var(--surface));
          color: var(--success);
        }
        .transcript-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: color-mix(in srgb, var(--danger) 9%, var(--surface));
          color: var(--danger);
        }
        .transcript-error button {
          padding: 5px 9px;
          font-size: 11.5px;
        }
        .transcript-terms {
          padding: 16px 18px 20px;
        }
        .transcript-term {
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .transcript-term + .transcript-term {
          margin-top: 14px;
        }
        .transcript-term-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: var(--bg-subtle);
          border-bottom: 1px solid var(--divider);
        }
        .transcript-term-header h3 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 750;
        }
        .transcript-term-header span {
          color: var(--fg3);
          font-size: 11.5px;
        }
        .transcript-table {
          width: 100%;
          margin: 0;
        }
        .transcript-table th {
          white-space: nowrap;
        }
        .transcript-table td {
          vertical-align: middle;
        }
        .transcript-row-voided td {
          background: color-mix(in srgb, var(--danger) 4%, var(--surface));
          color: var(--fg3);
        }
        .transcript-course-code {
          color: var(--transcript-navy);
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.015em;
        }
        .transcript-course-title {
          margin-top: 2px;
          font-size: 13px;
          font-weight: 600;
        }
        .transcript-meta {
          margin-top: 4px;
          color: var(--fg3);
          font-size: 10.8px;
        }
        .transcript-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .transcript-grade {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 800;
        }
        .transcript-policy {
          color: var(--fg2);
          font-size: 11.5px;
          line-height: 1.45;
        }
        .transcript-actions {
          justify-content: flex-end;
          gap: 5px;
        }
        .transcript-icon-button {
          width: 36px;
          height: 36px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          color: var(--fg2);
        }
        .transcript-icon-button.danger {
          color: var(--danger);
        }
        .transcript-mobile-list {
          display: none;
        }
        .transcript-mobile-entry {
          padding: 14px;
        }
        .transcript-mobile-entry + .transcript-mobile-entry {
          border-top: 1px solid var(--divider);
        }
        .transcript-mobile-entry.transcript-row-voided {
          background: color-mix(in srgb, var(--danger) 4%, var(--surface));
          color: var(--fg3);
        }
        .transcript-mobile-top,
        .transcript-mobile-footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .transcript-mobile-footer {
          align-items: center;
          margin-top: 12px;
        }
        .transcript-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 15px;
        }
        .transcript-form-grid input,
        .transcript-form-grid select,
        .transcript-form-grid textarea {
          width: 100%;
          min-width: 0;
        }
        .transcript-form-wide {
          grid-column: 1 / -1;
        }
        .transcript-policy-panel {
          grid-column: 1 / -1;
          padding: 13px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg-subtle);
        }
        .transcript-policy-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .transcript-policy-toggle input {
          width: auto;
          accent-color: var(--daust-orange);
        }
        .transcript-policy-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 13px;
        }
        .transcript-check-field {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .transcript-check-field input {
          width: auto;
          accent-color: var(--daust-orange);
        }
        .transcript-dialog-note {
          margin: 0 0 14px;
          color: var(--fg2);
          font-size: 13px;
          line-height: 1.5;
        }
        .transcript-dialog-error {
          margin-bottom: 13px;
          padding: 8px 10px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--danger) 9%, var(--surface));
          color: var(--danger);
          font-size: 12.5px;
        }
        @media (max-width: 760px) {
          .transcript-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }
          .transcript-toolbar-actions {
            width: 100%;
            justify-content: space-between;
          }
          .transcript-add {
            min-height: 44px;
          }
          .transcript-desktop {
            display: none;
          }
          .transcript-mobile-list {
            display: block;
          }
          .transcript-icon-button {
            width: 44px;
            height: 44px;
          }
          .transcript-terms {
            padding: 12px;
          }
          .transcript-form-grid,
          .transcript-policy-fields {
            grid-template-columns: 1fr;
          }
          .transcript-form-wide {
            grid-column: auto;
          }
        }
        @media (max-width: 520px) {
          .transcript-summary {
            grid-template-columns: 1fr;
          }
          .transcript-summary-item + .transcript-summary-item {
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.16);
          }
          .transcript-heading p {
            max-width: 34ch;
          }
        }
      `}</style>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="transcript-summary-item">
      <div className="transcript-summary-label">{label}</div>
      <span className="transcript-summary-value">{value}</span>
      <span className="transcript-summary-detail">{detail}</span>
    </div>
  );
}

function TermGroup({
  term,
  entries,
  onEdit,
  onAction,
}: {
  term: string;
  entries: TranscriptEntryRow[];
  onEdit: (entry: TranscriptEntryRow) => void;
  onAction: (type: "void" | "restore", entry: TranscriptEntryRow) => void;
}) {
  const active = entries.filter((entry) => !entry.voidedAt);
  const attempted = active.reduce(
    (total, entry) =>
      total +
      (entry.countsTowardGpa && entry.points !== null ? entry.credits : 0),
    0,
  );
  return (
    <section
      className="transcript-term"
      aria-labelledby={`term-${term.replace(/\W+/g, "-")}`}
    >
      <div className="transcript-term-header">
        <h3 id={`term-${term.replace(/\W+/g, "-")}`}>{term}</h3>
        <span>
          {active.length} active {active.length === 1 ? "entry" : "entries"}
          {attempted ? ` · ${attempted} attempted cr.` : ""}
        </span>
      </div>
      <div className="transcript-desktop">
        <table
          className="transcript-table"
          aria-label={`${term} transcript entries`}
        >
          <thead>
            <tr>
              <th>Course</th>
              <th>Credits</th>
              <th>Grade</th>
              <th>Policy</th>
              <th>Provenance</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className={entry.voidedAt ? "transcript-row-voided" : undefined}
              >
                <td>
                  <div className="transcript-course-code">
                    {entry.courseCode}
                  </div>
                  <div className="transcript-course-title">{entry.title}</div>
                  {entry.requirementCategory && (
                    <div className="transcript-meta">
                      {entry.requirementCategory}
                    </div>
                  )}
                </td>
                <td>
                  <strong>{entry.credits}</strong>
                  <div className="transcript-meta">
                    {entry.earnedCredits} earned
                  </div>
                </td>
                <td>
                  <span
                    className="transcript-grade"
                    style={{ color: gradeTone(entry.grade) }}
                  >
                    {entry.grade}
                  </span>
                  <div className="transcript-meta">
                    {entry.points === null
                      ? "No GPA points"
                      : `${entry.points.toFixed(1)} pts`}
                  </div>
                </td>
                <td>
                  <div className="transcript-policy">
                    {entry.countsTowardGpa
                      ? "Counts in GPA"
                      : "Excluded from GPA"}
                  </div>
                  <div className="transcript-policy">
                    {entry.countsTowardCredits
                      ? "Credit eligible"
                      : "No earned credit"}
                  </div>
                </td>
                <td>
                  <EntryBadges entry={entry} />
                </td>
                <td>
                  <EntryActions
                    entry={entry}
                    onEdit={onEdit}
                    onAction={onAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="transcript-mobile-list">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className={`transcript-mobile-entry${entry.voidedAt ? " transcript-row-voided" : ""}`}
          >
            <div className="transcript-mobile-top">
              <div>
                <div className="transcript-course-code">{entry.courseCode}</div>
                <div className="transcript-course-title">{entry.title}</div>
              </div>
              <span
                className="transcript-grade"
                style={{ color: gradeTone(entry.grade) }}
              >
                {entry.grade}
              </span>
            </div>
            <div className="transcript-meta" style={{ marginTop: 7 }}>
              {entry.credits} attempted · {entry.earnedCredits} earned ·{" "}
              {entry.points === null
                ? "No GPA points"
                : `${entry.points.toFixed(1)} points`}
            </div>
            <div className="transcript-mobile-footer">
              <EntryBadges entry={entry} />
              <EntryActions entry={entry} onEdit={onEdit} onAction={onAction} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EntryBadges({ entry }: { entry: TranscriptEntryRow }) {
  return (
    <div className="transcript-badges">
      <Badge tone={SOURCE_TONE[entry.source]}>
        {SOURCE_LABEL[entry.source]}
      </Badge>
      <Badge tone={entry.matched ? "navy" : "neutral"}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {entry.matched ? (
            <Link2 size={11} aria-hidden="true" />
          ) : (
            <Link2Off size={11} aria-hidden="true" />
          )}
          {entry.matched ? "Catalog matched" : "Snapshot only"}
        </span>
      </Badge>
      {entry.voidedAt && <Badge tone="error">Voided</Badge>}
      {entry.sourceRow && <Badge tone="neutral">Row {entry.sourceRow}</Badge>}
      {entry.voidReason && (
        <span className="transcript-meta">Reason: {entry.voidReason}</span>
      )}
    </div>
  );
}

function EntryActions({
  entry,
  onEdit,
  onAction,
}: {
  entry: TranscriptEntryRow;
  onEdit: (entry: TranscriptEntryRow) => void;
  onAction: (type: "void" | "restore", entry: TranscriptEntryRow) => void;
}) {
  return (
    <div className="transcript-actions">
      {!entry.voidedAt && (
        <button
          className="transcript-icon-button"
          onClick={() => onEdit(entry)}
          aria-label={`Edit ${entry.courseCode}`}
          title="Edit entry"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      )}
      <button
        className={`transcript-icon-button${entry.voidedAt ? "" : " danger"}`}
        onClick={() => onAction(entry.voidedAt ? "restore" : "void", entry)}
        aria-label={`${entry.voidedAt ? "Restore" : "Void"} ${entry.courseCode}`}
        title={entry.voidedAt ? "Restore entry" : "Void entry"}
      >
        {entry.voidedAt ? (
          <ArchiveRestore size={15} aria-hidden="true" />
        ) : (
          <FileClock size={15} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function TranscriptEntryModal({
  entry,
  studentId,
  onClose,
  onSaved,
}: {
  entry: TranscriptEntryRow | null;
  studentId: string;
  onClose: () => void;
  onSaved: (mode: "create" | "edit") => void;
}) {
  const [catalog, setCatalog] = useState<AdminPrograms["courses"]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [catalogCode, setCatalogCode] = useState(
    entry?.matched ? "__existing__" : "",
  );
  const [termId, setTermId] = useState(entry?.termId ? "__existing__" : "");
  const [courseCode, setCourseCode] = useState(entry?.courseCode ?? "");
  const [courseTitle, setCourseTitle] = useState(entry?.title ?? "");
  const [termLabel, setTermLabel] = useState(entry?.term ?? "");
  const [sortDate, setSortDate] = useState(
    entry?.termSortKey?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "",
  );
  const [grade, setGrade] = useState(entry?.grade ?? "");
  const [credits, setCredits] = useState(String(entry?.credits ?? ""));
  const [requirementCategory, setRequirementCategory] = useState(
    entry?.requirementCategory ?? "",
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [reason, setReason] = useState("");
  const [customPolicy, setCustomPolicy] = useState(false);
  const [gradePoints, setGradePoints] = useState(
    entry?.points == null ? "" : String(entry.points),
  );
  const [earnedCredits, setEarnedCredits] = useState(
    String(entry?.earnedCredits ?? ""),
  );
  const [countsTowardGpa, setCountsTowardGpa] = useState(
    entry?.countsTowardGpa ?? true,
  );
  const [countsTowardCredits, setCountsTowardCredits] = useState(
    entry?.countsTowardCredits ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminPrograms(), getTerms()])
      .then(([programs, termRows]) => {
        setCatalog(programs.courses);
        setTerms(termRows);
      })
      .catch(() => {
        setCatalog([]);
        setTerms([]);
      });
  }, []);

  function chooseCatalog(code: string) {
    setCatalogCode(code);
    if (code === "__existing__") return;
    const selected = catalog.find((course) => course.code === code);
    if (selected) {
      setCourseCode(selected.code);
      setCourseTitle(selected.title);
      setCredits(String(selected.credits));
    }
  }

  function chooseTerm(id: string) {
    setTermId(id);
    if (id === "__existing__") return;
    const selected = terms.find((term) => term.id === id);
    if (selected) {
      setTermLabel(selected.name);
      setSortDate(selected.startDate.slice(0, 10));
    }
  }

  async function save() {
    setError(null);
    const attempted = Number(credits);
    const earned = Number(earnedCredits);
    const points = gradePoints.trim() === "" ? null : Number(gradePoints);
    if (
      !courseCode.trim() ||
      !courseTitle.trim() ||
      !termLabel.trim() ||
      !grade.trim()
    ) {
      setError("Course code, title, term, and grade are required.");
      return;
    }
    if (!Number.isInteger(attempted) || attempted < 0 || attempted > 40) {
      setError("Attempted credits must be a whole number from 0 to 40.");
      return;
    }
    if (entry && reason.trim().length < 3) {
      setError("Enter a short reason for this correction.");
      return;
    }
    if (customPolicy) {
      if (!Number.isInteger(earned) || earned < 0 || earned > attempted) {
        setError(
          "Earned credits must be a whole number no greater than attempted credits.",
        );
        return;
      }
      if (
        points !== null &&
        (!Number.isFinite(points) || points < 0 || points > 5)
      ) {
        setError("Grade points must be between 0 and 5, or left blank.");
        return;
      }
    }

    setBusy(true);
    try {
      const selectedCourse =
        catalogCode && catalogCode !== "__existing__"
          ? await getAdminCourseDetail(catalogCode)
          : null;
      const input: TranscriptEntryInput = {
        courseId:
          catalogCode === "__existing__"
            ? (entry?.courseId ?? null)
            : (selectedCourse?.id ?? null),
        termId:
          termId === "__existing__" ? (entry?.termId ?? null) : termId || null,
        courseCode: courseCode.trim(),
        courseTitle: courseTitle.trim(),
        termLabel: termLabel.trim(),
        ...(sortDate ? { termSortKey: `${sortDate}:${termLabel.trim()}` } : {}),
        grade: grade.trim(),
        credits: attempted,
        requirementCategory: requirementCategory.trim() || null,
        note: note.trim() || null,
        ...(customPolicy
          ? {
              earnedCredits: earned,
              gradePoints: points,
              countsTowardGpa,
              countsTowardCredits,
            }
          : {}),
      };
      if (entry) {
        const patch: Partial<TranscriptEntryInput> & { reason: string } = {
          ...input,
          reason: reason.trim(),
        };
        // Leaving an unchanged grade out avoids needlessly re-resolving legacy
        // marks against today's institutional grading scheme.
        if (grade.trim().toUpperCase() === entry.grade.trim().toUpperCase()) {
          delete patch.grade;
        }
        await updateTranscriptEntry(entry.id, patch);
        onSaved("edit");
      } else {
        await createTranscriptEntry(studentId, input);
        onSaved("create");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the entry.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={entry ? `Edit ${entry.courseCode}` : "Add transcript entry"}
      width={720}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? "Saving…" : entry ? "Save correction" : "Add entry"}
          </button>
        </>
      }
    >
      {error && (
        <div className="transcript-dialog-error" role="alert">
          {error}
        </div>
      )}
      <p className="transcript-dialog-note">
        Link a catalog course when there is a verified match. Snapshot fields
        remain unchanged if the catalog is edited later.
      </p>
      <div className="transcript-form-grid">
        <Field
          label="Catalog course"
          hint="Leave unmatched for historical courses absent from the catalog."
        >
          <Select
            value={catalogCode}
            onChange={chooseCatalog}
            options={[
              { value: "", label: "Unmatched snapshot" },
              ...(entry?.courseId
                ? [
                    {
                      value: "__existing__",
                      label: `Keep current catalog link (${entry.courseCode})`,
                    },
                  ]
                : []),
              ...catalog.map((course) => ({
                value: course.code,
                label: `${course.code} — ${course.title}`,
              })),
            ]}
          />
        </Field>
        <Field
          label="Known term"
          hint="Optional; the displayed term is stored as a snapshot."
        >
          <Select
            value={termId}
            onChange={chooseTerm}
            options={[
              { value: "", label: "Historical / unmatched term" },
              ...(entry?.termId
                ? [
                    {
                      value: "__existing__",
                      label: `Keep current term link (${entry.term})`,
                    },
                  ]
                : []),
              ...terms.map((term) => ({ value: term.id, label: term.name })),
            ]}
          />
        </Field>
        <Field label="Course code">
          <input
            value={courseCode}
            onChange={(event) => setCourseCode(event.target.value)}
            maxLength={30}
          />
        </Field>
        <Field label="Course title">
          <input
            value={courseTitle}
            onChange={(event) => setCourseTitle(event.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label="Term label">
          <input
            value={termLabel}
            onChange={(event) => setTermLabel(event.target.value)}
            maxLength={100}
            placeholder="Fall 2024"
          />
        </Field>
        <Field
          label="Term start date"
          hint="Used only to order transcript terms."
        >
          <input
            type="date"
            value={sortDate}
            onChange={(event) => setSortDate(event.target.value)}
          />
        </Field>
        <Field label="Final grade">
          <input
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            maxLength={20}
            placeholder="A-"
          />
        </Field>
        <Field label="Attempted credits">
          <input
            type="number"
            min={0}
            max={40}
            step={1}
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />
        </Field>
        <Field label="Requirement category">
          <input
            value={requirementCategory}
            onChange={(event) => setRequirementCategory(event.target.value)}
            maxLength={100}
            placeholder="Mathematics"
          />
        </Field>
        <Field label="Internal note">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
          />
        </Field>

        <div className="transcript-policy-panel">
          <label className="transcript-policy-toggle">
            <input
              type="checkbox"
              checked={customPolicy}
              onChange={(event) => setCustomPolicy(event.target.checked)}
            />
            Override institutional grade policy
          </label>
          {customPolicy && (
            <div className="transcript-policy-fields">
              <Field
                label="Grade points"
                hint="Leave blank for non-GPA marks such as P or I."
              >
                <input
                  type="number"
                  min={0}
                  max={5}
                  step="0.1"
                  value={gradePoints}
                  onChange={(event) => setGradePoints(event.target.value)}
                />
              </Field>
              <Field label="Earned credits">
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={1}
                  value={earnedCredits}
                  onChange={(event) => setEarnedCredits(event.target.value)}
                />
              </Field>
              <label className="transcript-check-field">
                <input
                  type="checkbox"
                  checked={countsTowardGpa}
                  onChange={(event) => setCountsTowardGpa(event.target.checked)}
                />{" "}
                Counts toward GPA
              </label>
              <label className="transcript-check-field">
                <input
                  type="checkbox"
                  checked={countsTowardCredits}
                  onChange={(event) =>
                    setCountsTowardCredits(event.target.checked)
                  }
                />{" "}
                Eligible for earned credit
              </label>
            </div>
          )}
        </div>

        {entry && (
          <div className="transcript-form-wide">
            <Field
              label="Reason for correction"
              hint="Required and retained in the audit trail."
            >
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Corrected against the signed grade sheet…"
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TranscriptReasonModal({
  action,
  entry,
  onClose,
  onSaved,
}: {
  action: "void" | "restore";
  entry: TranscriptEntryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoring = action === "restore";

  async function save() {
    setError(null);
    if (reason.trim().length < 3) {
      setError("Enter a short reason for this action.");
      return;
    }
    setBusy(true);
    try {
      if (restoring) await restoreTranscriptEntry(entry.id, reason.trim());
      else await voidTranscriptEntry(entry.id, reason.trim());
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the entry.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`${restoring ? "Restore" : "Void"} ${entry.courseCode}`}
      width={470}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            style={
              restoring
                ? { display: "inline-flex", alignItems: "center", gap: 6 }
                : {
                    background: "var(--danger)",
                    borderColor: "var(--danger)",
                    color: "#fff",
                  }
            }
          >
            {restoring && <RotateCcw size={14} aria-hidden="true" />}
            {busy ? "Saving…" : restoring ? "Restore entry" : "Void entry"}
          </button>
        </>
      }
    >
      {error && (
        <div className="transcript-dialog-error" role="alert">
          {error}
        </div>
      )}
      <p className="transcript-dialog-note">
        {restoring
          ? "This record will return to GPA and earned-credit calculations."
          : "This record will be excluded from the active transcript. It remains available here with its audit history."}
      </p>
      <Field
        label={`${restoring ? "Restoration" : "Void"} reason`}
        hint="Required; at least 3 characters."
      >
        <textarea
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder={
            restoring
              ? "Restored after registrar verification…"
              : "Duplicate historical entry…"
          }
          style={{ width: "100%" }}
        />
      </Field>
    </Modal>
  );
}
