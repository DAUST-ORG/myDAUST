"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type AcademicYearRow,
  type CalendarEventRow,
  type TermRow,
  createCalendarEvent,
  deleteCalendarEvent,
  getAcademicCalendar,
  getAcademicYears,
  getTerms,
  updateCalendarEvent,
  updateTerm,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { type BadgeTone, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select } from "@/components/ui";

const EVENT_TYPES = ["event", "registration", "holiday", "exam", "deadline"];
const TERM_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "planning", label: "Planning" },
  { value: "draft", label: "Draft" },
];

interface EventDraft {
  id?: string;
  academicYearId: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn: string;
  note: string;
}

interface TermDraft {
  id: string;
  name: string;
  status: string;
  addDeadline: string;
  dropDeadline: string;
}

/** Date inputs need yyyy-mm-dd; API values may arrive as full ISO timestamps. */
function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function termBadge(status: string | null): { tone: BadgeTone; label: string } {
  if (status === "active") return { tone: "success", label: "Active" };
  if (status === "planning") return { tone: "warning", label: "Planning" };
  if (status === "draft") return { tone: "neutral", label: "Draft" };
  return { tone: "neutral", label: "—" };
}

export default function AcademicCalendarPage() {
  const [rows, setRows] = useState<CalendarEventRow[] | null>(null);
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [termDraft, setTermDraft] = useState<TermDraft | null>(null);
  const [removing, setRemoving] = useState<CalendarEventRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getAcademicCalendar().then(setRows).catch((e: Error) => setError(e.message));
    getTerms().then(setTerms).catch(() => setTerms([]));
  }, []);
  useEffect(() => {
    load();
    getAcademicYears().then(setYears).catch(() => setYears([]));
  }, [load]);

  function openComposer() {
    const active = years.find((y) => y.status === "active") ?? years[0];
    setDraft({
      academicYearId: active?.id ?? "",
      title: "",
      type: "event",
      startsOn: "",
      endsOn: "",
      note: "",
    });
  }

  function openEditEvent(e: CalendarEventRow) {
    setDraft({
      id: e.id,
      academicYearId: "",
      title: e.title,
      type: e.type,
      startsOn: toDateInput(e.startsOn),
      endsOn: toDateInput(e.endsOn),
      note: e.note ?? "",
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.id) {
        await updateCalendarEvent(draft.id, {
          title: draft.title.trim(),
          type: draft.type,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || null,
          note: draft.note.trim() || null,
        });
      } else {
        await createCalendarEvent({
          academicYearId: draft.academicYearId,
          title: draft.title.trim(),
          type: draft.type,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || undefined,
          note: draft.note.trim() || undefined,
        });
      }
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the event.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCalendarEvent(removing.id);
      setRemoving(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the event.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  function openEditTerm(t: TermRow) {
    setTermDraft({
      id: t.id,
      name: t.name,
      status: t.status ?? "draft",
      addDeadline: toDateInput(t.addDeadline),
      dropDeadline: toDateInput(t.dropDeadline),
    });
  }

  async function saveTerm() {
    if (!termDraft) return;
    setBusy(true);
    setError(null);
    try {
      await updateTerm(termDraft.id, {
        status: termDraft.status as "active" | "planning" | "draft",
        addDeadline: termDraft.addDeadline || null,
        dropDeadline: termDraft.dropDeadline || null,
      });
      setTermDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the term.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const valid = draft !== null && draft.title.trim() !== "" && draft.startsOn !== "" && (!!draft.id || !!draft.academicYearId);

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic calendar & terms"
        subtitle="Configure academic terms and key dates."
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={openComposer} disabled={years.length === 0}>
            Add event
          </Button>
        }
      />

      {error && rows && <p className="card" style={{ color: "var(--danger)" }}>{error}</p>}

      {terms.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 18 }}>
          {terms.map((t) => {
            const badge = termBadge(t.status);
            return (
              <Card key={t.id}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>{t.name}</div>
                    {t.academicYear && <div className="muted" style={{ fontSize: 12 }}>{t.academicYear}</div>}
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" icon={<Pencil size={13} />} onClick={() => openEditTerm(t)}>Edit term</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No calendar entries for the active year"
          note="Registration windows, holidays, exam periods and deadlines appear here once added."
        />
      )}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Note</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="sis-row">
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDate(e.startsOn)}
                    {e.endsOn && <span className="muted"> – {formatDate(e.endsOn)}</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{e.title}</td>
                  <td><Badge tone="neutral">{e.type}</Badge></td>
                  <td className="muted">{e.note ?? "—"}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", width: "100%" }}>
                      <IconButton label="Edit event" onClick={() => openEditEvent(e)}><Pencil size={15} /></IconButton>
                      <IconButton label="Delete event" tone="danger" onClick={() => setRemoving(e)}><Trash2 size={15} /></IconButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {draft && (
        <Modal
          open
          onClose={() => setDraft(null)}
          title={draft.id ? "Edit calendar event" : "Add calendar event"}
          width={480}
          footer={
            <>
              <Button onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={save} disabled={busy || !valid}>
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add event"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!draft.id && (
              <Field label="Academic year">
                <Select
                  value={draft.academicYearId}
                  onChange={(v) => setDraft((d) => (d ? { ...d, academicYearId: v } : d))}
                  options={years.map((y) => ({ value: y.id, label: y.status === "active" ? `${y.label} (active)` : y.label }))}
                />
              </Field>
            )}
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(v) => setDraft((d) => (d ? { ...d, title: v } : d))}
                placeholder="e.g. Registration opens"
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(v) => setDraft((d) => (d ? { ...d, type: v } : d))}
                options={EVENT_TYPES}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Starts on">
                <Input type="date" value={draft.startsOn} onChange={(v) => setDraft((d) => (d ? { ...d, startsOn: v } : d))} />
              </Field>
              <Field label="Ends on" hint="Optional.">
                <Input type="date" value={draft.endsOn} onChange={(v) => setDraft((d) => (d ? { ...d, endsOn: v } : d))} />
              </Field>
            </div>
            <Field label="Note" hint="Optional.">
              <Input value={draft.note} onChange={(v) => setDraft((d) => (d ? { ...d, note: v } : d))} />
            </Field>
          </div>
        </Modal>
      )}

      {termDraft && (
        <Modal
          open
          onClose={() => setTermDraft(null)}
          title={`Edit term · ${termDraft.name}`}
          width={440}
          footer={
            <>
              <Button onClick={() => setTermDraft(null)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={saveTerm} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Status" hint="Setting a term Active demotes the others.">
              <Select
                value={termDraft.status}
                onChange={(v) => setTermDraft((t) => (t ? { ...t, status: v } : t))}
                options={TERM_STATUS_OPTIONS}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Add deadline" hint="Optional.">
                <Input type="date" value={termDraft.addDeadline} onChange={(v) => setTermDraft((t) => (t ? { ...t, addDeadline: v } : t))} />
              </Field>
              <Field label="Drop deadline" hint="Optional.">
                <Input type="date" value={termDraft.dropDeadline} onChange={(v) => setTermDraft((t) => (t ? { ...t, dropDeadline: v } : t))} />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          open
          onClose={() => setRemoving(null)}
          title="Delete calendar event"
          footer={
            <>
              <Button onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={removeEvent} disabled={busy}>
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Delete <strong>{removing.title}</strong>? This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
