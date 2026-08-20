"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type EvaluationWindow,
  type EvaluationWindowResults,
  type Term,
  getCurrentTerm,
  getEvaluationWindowResults,
  getEvaluationWindows,
  releaseEvaluationWindow,
  upsertEvaluationWindow,
} from "@/lib/api";
import { Card, EmptyState, Field, PageHeader, Stat } from "@/components/ui";

const KINDS = [
  { key: "midterm" as const, label: "Mid-semester", note: "Results are not held for grading — the point is that you can act on them this term." },
  { key: "final" as const, label: "End of semester", note: "Results stay sealed until the registrar approves that section's grades." },
];

/** yyyy-mm-dd for a date input, from an ISO instant. */
const toDateInput = (iso: string) => iso.slice(0, 10);
/** A date input back to an instant, at the start of the day. */
const toIso = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();

export default function DirectorEvaluationsPage() {
  const [windows, setWindows] = useState<EvaluationWindow[] | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getEvaluationWindows().then(setWindows).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    getCurrentTerm().then(setTerm).catch(() => {});
  }, []);

  return (
    <>
      <PageHeader
        title="Course evaluations"
        subtitle="Two rounds a term. You set the dates each round may run in and the response floor; instructors may narrow their own section inside those dates."
      />
      {err && <Card><div role="alert" style={{ color: "var(--error-500)" }}>{err}</div></Card>}
      {windows === null && !err && <Card><div role="status" className="muted">Loading…</div></Card>}

      {windows !== null &&
        KINDS.map((k) => (
          <RoundEditor
            key={k.key}
            kind={k.key}
            label={k.label}
            note={k.note}
            term={term}
            existing={windows.find((w) => w.kind === k.key && w.termId === term?.id) ?? null}
            onSaved={load}
          />
        ))}
    </>
  );
}

function RoundEditor({
  kind,
  label,
  note,
  term,
  existing,
  onSaved,
}: {
  kind: "midterm" | "final";
  label: string;
  note: string;
  term: Term | null;
  existing: EvaluationWindow | null;
  onSaved: () => void;
}) {
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [floor, setFloor] = useState(5);
  const [status, setStatus] = useState<"draft" | "open" | "closed">("draft");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [results, setResults] = useState<EvaluationWindowResults | null>(null);

  useEffect(() => {
    if (!existing) return;
    setOpensAt(toDateInput(existing.boundsOpenAt));
    setClosesAt(toDateInput(existing.boundsCloseAt));
    setFloor(existing.minResponsesToRelease);
    setStatus(existing.status);
  }, [existing]);

  const loadResults = useCallback(() => {
    if (!existing) return;
    getEvaluationWindowResults(existing.id).then(setResults).catch(() => {});
  }, [existing]);
  useEffect(loadResults, [loadResults]);

  async function save() {
    if (!term) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await upsertEvaluationWindow({
        termId: term.id,
        kind,
        status,
        boundsOpenAt: toIso(opensAt),
        boundsCloseAt: toIso(closesAt),
        minResponsesToRelease: floor,
      });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function release(released: boolean) {
    if (!existing) return;
    setBusy(true);
    setErr(null);
    try {
      await releaseEvaluationWindow(existing.id, released);
      setMsg(released ? "Results released to instructors." : "Results hidden again.");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const released = existing?.status === "closed";

  return (
    <Card title={`${label} round${term ? ` · ${term.name}` : ""}`}>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>{note}</p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", margin: "14px 0" }}>
        <Field label="Opens">
          <input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label="Closes">
          <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
        <Field label="Minimum responses">
          <input
            type="number"
            min={1}
            max={100}
            value={floor}
            onChange={(e) => setFloor(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </Field>
        <Field label="State">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="draft">Draft — students cannot see it</option>
            <option value="open">Open — students can respond</option>
            <option value="closed">Closed — released to instructors</option>
          </select>
        </Field>
        <button className="primary" onClick={save} disabled={busy || !term || !opensAt || !closesAt}>
          {busy ? "Saving…" : existing ? "Update round" : "Create round"}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        Below the minimum, a section&rsquo;s results stay hidden from its instructor so a small
        class cannot be de-anonymised. You always see everything here regardless.
      </p>

      {msg && <p style={{ fontSize: 13, color: "var(--success-500)" }}>{msg}</p>}
      {err && <p role="alert" style={{ fontSize: 13, color: "var(--error-500)" }}>{err}</p>}

      {existing && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0 12px" }}>
            <Stat label="Responses" value={results?.totalResponses ?? "—"} />
            <Stat label="Sections with data" value={results?.sections.length ?? "—"} />
            <Stat
              label="Released to instructors"
              value={released ? "Yes" : "No"}
              tone={released ? "var(--success-500)" : "var(--fg3)"}
            />
          </div>
          <button onClick={() => release(!released)} disabled={busy}>
            {released ? "Hide results from instructors" : "Release results to instructors"}
          </button>

          {results && results.sections.length === 0 && (
            <div style={{ marginTop: 14 }}>
              <EmptyState title="No responses yet" note="Results appear here as students submit." />
            </div>
          )}

          {results?.sections.map((s) => (
            <div key={s.sectionId} style={{ borderTop: "1px solid var(--divider)", padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13.5 }}>{s.course}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  §{s.sectionCode}{s.instructor ? ` · ${s.instructor}` : ""}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12.5 }}>
                  {s.responseCount} response{s.responseCount === 1 ? "" : "s"}
                </span>
                {!s.meetsFloor && (
                  <span className="badge pending" title="Hidden from the instructor until the floor is met">
                    below floor
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 13 }}>
                <span>Overall <strong>{s.overall ?? "—"}</strong></span>
                <span>Clarity <strong>{s.clarity ?? "—"}</strong></span>
                <span>Workload <strong>{s.workload ?? "—"}</strong></span>
              </div>
              {s.comments.map((c, i) => (
                <p
                  key={i}
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    background: "var(--bg-subtle)",
                    borderRadius: 8,
                    padding: "8px 11px",
                  }}
                >
                  {c}
                </p>
              ))}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
