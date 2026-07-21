"use client";

import { useCallback, useEffect, useState } from "react";
import { type CourseRuleRow, getCourseRules, setCourseRule } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Toggle } from "@/components/ui";

interface RuleDraft {
  standingRequired: string;
  majorRestriction: string;
  capacity: string;
  waitlistEnabled: boolean;
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
    });
  }

  async function save() {
    if (!editing || !draft) return;
    setBusy(true);
    setError(null);
    try {
      await setCourseRule(editing.courseId, {
        standingRequired: draft.standingRequired.trim() || null,
        majorRestriction: draft.majorRestriction.trim() || null,
        capacity: draft.capacity.trim() === "" ? null : Number(draft.capacity),
        waitlistEnabled: draft.waitlistEnabled,
      });
      setEditing(null);
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the rules.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const needle = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter(
    (r) => !needle || r.code.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle),
  );

  const capacityInvalid =
    draft !== null && draft.capacity.trim() !== "" && !/^\d{1,4}$/.test(draft.capacity.trim());

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
          onClose={() => { setEditing(null); setDraft(null); }}
          title={`Rules — ${editing.code}`}
          width={480}
          footer={
            <>
              <Button onClick={() => { setEditing(null); setDraft(null); }} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={save} disabled={busy || capacityInvalid}>
                {busy ? "Saving…" : "Save rules"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Prerequisites and corequisites are managed in the course catalogue and are read-only here.
            </p>
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
