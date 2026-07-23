"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  type GradingSchemeRow,
  addGradeRow,
  deleteGradeRow,
  getGradingSchemes,
  updateGradeRow,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Segmented,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type SchemeRowData = GradingSchemeRow["rows"][number];

/** Spec title form: "{scheme name} · {max GPA points}", the points suffix dropped for unscored scales. */
function schemeTitle(scheme: GradingSchemeRow): string {
  const points = scheme.rows.map((r) => r.points).filter((p): p is number => p !== null);
  if (points.length === 0) return scheme.name;
  return `${scheme.name} · ${Math.max(...points).toFixed(2)}`;
}

interface RowDraft {
  grade: string;
  points: string;
  minScore: string;
  maxScore: string;
}

const EMPTY_DRAFT: RowDraft = { grade: "", points: "", minScore: "", maxScore: "" };

function toDraft(r: SchemeRowData): RowDraft {
  return {
    grade: r.grade,
    points: r.points === null ? "" : String(r.points),
    minScore: r.minScore === null ? "" : String(r.minScore),
    maxScore: r.maxScore === null ? "" : String(r.maxScore),
  };
}

/** Blank stays null; anything else becomes a number (invalid input is guarded before save). */
function numOrNull(v: string): number | null {
  const t = v.trim();
  return t === "" ? null : Number(t);
}

export default function GradingSchemesPage() {
  const [schemes, setSchemes] = useState<GradingSchemeRow[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // null editor closed; { rowId: null } is an add; { rowId } is an edit of an existing row.
  const [editor, setEditor] = useState<{ rowId: string | null } | null>(null);
  const [draft, setDraft] = useState<RowDraft>(EMPTY_DRAFT);
  const [removing, setRemoving] = useState<SchemeRowData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getGradingSchemes();
      setSchemes(s);
      setActive((prev) => (s.some((x) => x.key === prev) ? prev : s.find((x) => x.isDefault)?.key ?? s[0]?.key ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load grading schemes.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!schemes) return <p className="muted">Loading…</p>;
  if (schemes.length === 0) return <EmptyState title="No grading schemes configured" />;

  const scheme = schemes.find((s) => s.key === active) ?? schemes[0]!;

  const gradeInvalid = editor !== null && draft.grade.trim() === "";
  const numberInvalid = (v: string) => v.trim() !== "" && !Number.isFinite(Number(v.trim()));
  const anyNumberInvalid =
    editor !== null && [draft.points, draft.minScore, draft.maxScore].some(numberInvalid);
  const saveDisabled = busy || gradeInvalid || anyNumberInvalid;

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setEditor({ rowId: null });
  }
  function openEdit(r: SchemeRowData) {
    setDraft(toDraft(r));
    setEditor({ rowId: r.id });
  }
  function closeEditor() {
    setEditor(null);
    setDraft(EMPTY_DRAFT);
  }

  async function saveRow() {
    if (!editor || saveDisabled) return;
    setBusy(true);
    setError(null);
    const payload = {
      grade: draft.grade.trim(),
      points: numOrNull(draft.points),
      minScore: numOrNull(draft.minScore),
      maxScore: numOrNull(draft.maxScore),
    };
    try {
      if (editor.rowId === null) await addGradeRow(scheme.id, payload);
      else await updateGradeRow(editor.rowId, payload);
      closeEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the row.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(rowId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteGradeRow(rowId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the row.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Grading Scales & Schemes"
        subtitle="Define grade values, GPA points and score ranges. GPA is always derived from these points, never stored."
        actions={scheme.isDefault ? <Badge tone="success">Institution default</Badge> : undefined}
      />

      <div style={{ marginBottom: 18 }}>
        <Segmented
          options={schemes.map((s) => ({ value: s.key, label: s.name }))}
          value={active}
          onChange={setActive}
        />
      </div>

      <Card
        pad={false}
        title={
          <h3 style={{ margin: 0, padding: "16px 18px 0", fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>
            {schemeTitle(scheme)}
          </h3>
        }
        action={
          <div style={{ padding: "16px 18px 0" }}>
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={openAdd}>Add row</Button>
          </div>
        }
      >
        <table>
          <thead>
            <tr>
              <th>Grade</th>
              <th style={{ textAlign: "center" }}>GPA points</th>
              <th style={{ textAlign: "center" }}>Score range</th>
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {scheme.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.grade}</td>
                <td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                  {r.points === null ? <span className="muted">not counted</span> : r.points.toFixed(2)}
                </td>
                <td style={{ textAlign: "center" }}>
                  {r.minScore === null || r.maxScore === null ? <span className="muted">—</span> : `${r.minScore}–${r.maxScore}`}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <IconButton label={`Edit ${r.grade}`} disabled={busy} onClick={() => openEdit(r)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label={`Delete ${r.grade}`} tone="danger" disabled={busy} onClick={() => setRemoving(r)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Scales without grade points (pass/fail, IEP levels) are excluded from GPA rather than counted as zero.
      </p>

      {removing && (
        <ConfirmDialog
          title="Delete grade row?"
          confirmLabel="Delete row"
          message={<>Delete the <strong>{removing.grade}</strong> row from {scheme.name}? Existing grades of {removing.grade} will lose their GPA-point mapping until a replacement row is added.</>}
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await removeRow(removing.id); setRemoving(null); }}
        />
      )}

      {editor && (
        <Modal
          open
          onClose={closeEditor}
          title={editor.rowId === null ? `Add row — ${scheme.name}` : `Edit row — ${scheme.name}`}
          width={440}
          footer={
            <>
              <Button onClick={closeEditor} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={saveRow} disabled={saveDisabled}>
                {busy ? "Saving…" : editor.rowId === null ? "Add row" : "Save row"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Grade">
              <Input
                value={draft.grade}
                onChange={(v) => setDraft((d) => ({ ...d, grade: v }))}
                invalid={gradeInvalid}
                placeholder="e.g. A-"
              />
            </Field>
            <Field label="GPA points" hint="Leave blank for a scale excluded from GPA.">
              <Input
                value={draft.points}
                onChange={(v) => setDraft((d) => ({ ...d, points: v }))}
                inputMode="decimal"
                invalid={numberInvalid(draft.points)}
                placeholder="e.g. 3.70"
              />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Min score">
                <Input
                  value={draft.minScore}
                  onChange={(v) => setDraft((d) => ({ ...d, minScore: v }))}
                  inputMode="numeric"
                  invalid={numberInvalid(draft.minScore)}
                  placeholder="e.g. 90"
                />
              </Field>
              <Field label="Max score">
                <Input
                  value={draft.maxScore}
                  onChange={(v) => setDraft((d) => ({ ...d, maxScore: v }))}
                  inputMode="numeric"
                  invalid={numberInvalid(draft.maxScore)}
                  placeholder="e.g. 92"
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
