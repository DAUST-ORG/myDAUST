"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { type CourseRuleRow, getCourseRules, setCourseRequisites, setCourseRule } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Toggle } from "@/components/ui";

const MIN_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D"] as const;

interface PrereqDraft {
  code: string;
  minGrade: string;
}

interface RuleDraft {
  standingRequired: string;
  majorRestriction: string;
  capacity: string;
  waitlistEnabled: boolean;
  prerequisites: PrereqDraft[];
  corequisites: string[];
}

export default function RuleEnginePage() {
  const [rows, setRows] = useState<CourseRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CourseRuleRow | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getCourseRules().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  function openEditor(r: CourseRuleRow) {
    setEditing(r);
    setDraft({
      standingRequired: r.standingRequired ?? "",
      majorRestriction: r.majorRestriction ?? "",
      capacity: r.capacity === null ? "" : String(r.capacity),
      waitlistEnabled: r.waitlistEnabled,
      prerequisites: r.prerequisites.map((p) => ({ code: p.code, minGrade: p.minGrade ?? "" })),
      corequisites: [...r.corequisites],
    });
  }

  function closeEditor() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!editing || !draft) return;
    setBusy(true);
    setError(null);
    // Two writes; report which step failed so a partial save is never silent.
    try {
      await setCourseRule(editing.courseId, {
        standingRequired: draft.standingRequired.trim() || null,
        majorRestriction: draft.majorRestriction.trim() || null,
        capacity: draft.capacity.trim() === "" ? null : Number(draft.capacity),
        waitlistEnabled: draft.waitlistEnabled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the rule settings.");
      setBusy(false);
      return;
    }
    try {
      await setCourseRequisites(editing.courseId, {
        prerequisites: draft.prerequisites.map((p) => ({ code: p.code, minGrade: p.minGrade || null })),
        corequisites: draft.corequisites,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? `Rule settings saved, but prerequisites/corequisites did not: ${e.message}. Reopen and retry.`
          : "Rule settings saved, but prerequisites/corequisites did not — reopen and retry.",
      );
      setBusy(false);
      load();
      return;
    }
    closeEditor();
    load();
    setBusy(false);
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const needle = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter(
    (r) => !needle || r.code.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle),
  );

  const capacityInvalid =
    draft !== null &&
    draft.capacity.trim() !== "" &&
    (!/^\d{1,4}$/.test(draft.capacity.trim()) || Number(draft.capacity.trim()) > 1000);

  // Selectable codes are the other courses in the catalogue, minus this course and ones already picked.
  const allCodes = (rows ?? []).map((r) => r.code);
  const prereqOptions =
    editing && draft
      ? allCodes.filter((c) => c !== editing.code && !draft.prerequisites.some((p) => p.code === c))
      : [];
  const coreqOptions =
    editing && draft
      ? allCodes.filter((c) => c !== editing.code && !draft.corequisites.includes(c))
      : [];

  function addPrereq(code: string) {
    if (!code) return;
    setDraft((d) => (d ? { ...d, prerequisites: [...d.prerequisites, { code, minGrade: "" }] } : d));
  }
  function removePrereq(code: string) {
    setDraft((d) => (d ? { ...d, prerequisites: d.prerequisites.filter((p) => p.code !== code) } : d));
  }
  function setPrereqGrade(code: string, minGrade: string) {
    setDraft((d) =>
      d ? { ...d, prerequisites: d.prerequisites.map((p) => (p.code === code ? { ...p, minGrade } : p)) } : d,
    );
  }
  function addCoreq(code: string) {
    if (!code) return;
    setDraft((d) => (d ? { ...d, corequisites: [...d.corequisites, code] } : d));
  }
  function removeCoreq(code: string) {
    setDraft((d) => (d ? { ...d, corequisites: d.corequisites.filter((c) => c !== code) } : d));
  }

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Rule engine"
        subtitle="Registration rules per course. These are enforced server-side at enrolment, not merely displayed."
        actions={<SearchInput value={q} onChange={setQ} placeholder="Search course…" width={260} />}
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && filtered.length === 0 && <EmptyState title="No courses match" />}

      {filtered.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr>
                <th>Course</th><th>Prerequisites</th><th>Corequisites</th><th>Standing</th><th>Restricted to</th>
                <th style={{ textAlign: "right" }}>Enrollment cap</th><th>Waitlist</th><th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.courseId} className="sis-row">
                  <td><div style={{ fontWeight: 700 }}>{r.code}</div><div className="muted" style={{ fontSize: 12 }}>{r.title}</div></td>
                  <td>
                    {r.prerequisites.length === 0 ? <span className="muted">none</span> : r.prerequisites.map((p) => (
                      <div key={p.code} style={{ fontSize: 12.5 }}>
                        {p.code}{p.minGrade && <span className="muted"> (min {p.minGrade})</span>}
                      </div>
                    ))}
                  </td>
                  <td>{r.corequisites.length === 0 ? <span className="muted">none</span> : r.corequisites.join(", ")}</td>
                  <td>{r.standingRequired ?? <span className="muted">any</span>}</td>
                  <td>{r.majorRestriction ?? <span className="muted">open</span>}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.capacity === null ? <span className="muted">—</span> : `${r.capacity} seats`}
                  </td>
                  <td><Badge tone={r.waitlistEnabled ? "info" : "neutral"}>{r.waitlistEnabled ? "Enabled" : "Disabled"}</Badge></td>
                  <td><Button size="sm" onClick={() => openEditor(r)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && draft && (
        <Modal
          open
          onClose={closeEditor}
          title={`Rules — ${editing.code}`}
          width={520}
          footer={
            <>
              <Button onClick={closeEditor} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={save} disabled={busy || capacityInvalid}>
                {busy ? "Saving…" : "Save rules"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Field label="Prerequisites" hint="Each prerequisite may require a minimum grade.">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {draft.prerequisites.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None required.</span>}
                {draft.prerequisites.map((p) => (
                  <div key={p.code} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone="navy">{p.code}</Badge>
                    <Select
                      value={p.minGrade}
                      onChange={(v) => setPrereqGrade(p.code, v)}
                      options={[{ value: "", label: "No min grade" }, ...MIN_GRADES.map((g) => ({ value: g, label: `min ${g}` }))]}
                      style={{ flex: 1 }}
                    />
                    <RemoveChip label={`Remove prerequisite ${p.code}`} onClick={() => removePrereq(p.code)} />
                  </div>
                ))}
                {prereqOptions.length > 0 && (
                  <AddSelect placeholder="Add prerequisite…" options={prereqOptions} onPick={addPrereq} />
                )}
              </div>
            </Field>

            <Field label="Corequisites" hint="Courses that must be taken in the same term.">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {draft.corequisites.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None required.</span>}
                {draft.corequisites.map((c) => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone="navy">{c}</Badge>
                    <RemoveChip label={`Remove corequisite ${c}`} onClick={() => removeCoreq(c)} />
                  </div>
                ))}
                {coreqOptions.length > 0 && (
                  <AddSelect placeholder="Add corequisite…" options={coreqOptions} onPick={addCoreq} />
                )}
              </div>
            </Field>

            <Field label="Class standing" hint="Leave blank for any standing.">
              <Input
                value={draft.standingRequired}
                onChange={(v) => setDraft((d) => (d ? { ...d, standingRequired: v } : d))}
                placeholder="e.g. Sophomore or higher"
              />
            </Field>
            <Field label="Major restriction" hint="Leave blank to leave the course open.">
              <Input
                value={draft.majorRestriction}
                onChange={(v) => setDraft((d) => (d ? { ...d, majorRestriction: v } : d))}
                placeholder="e.g. Computer Engineering"
              />
            </Field>
            <Field label="Enrollment cap" hint="Seats across all sections. Blank means uncapped.">
              <Input
                value={draft.capacity}
                onChange={(v) => setDraft((d) => (d ? { ...d, capacity: v } : d))}
                inputMode="numeric"
                invalid={capacityInvalid}
                placeholder="e.g. 30"
              />
            </Field>
            <Toggle
              checked={draft.waitlistEnabled}
              onChange={(v) => setDraft((d) => (d ? { ...d, waitlistEnabled: v } : d))}
              label="Waitlist enabled"
            />
          </div>
        </Modal>
      )}
    </>
  );
}

/** Small round remove control for a requisite chip row. */
function RemoveChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="sis-btn"
      style={{
        width: 30,
        height: 30,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--fg2)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <X size={14} />
    </button>
  );
}

/** A select acting as an "add" affordance: resets to placeholder after each pick. */
function AddSelect({
  placeholder,
  options,
  onPick,
}: {
  placeholder: string;
  options: string[];
  onPick: (code: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg3)" }}>
      <Plus size={14} />
      <Select
        value=""
        onChange={onPick}
        options={[{ value: "", label: placeholder }, ...options.map((c) => ({ value: c, label: c }))]}
        style={{ flex: 1 }}
      />
    </div>
  );
}
