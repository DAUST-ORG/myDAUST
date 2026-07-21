"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import {
  type AcademicYearRow,
  type CalendarEventRow,
  createCalendarEvent,
  getAcademicCalendar,
  getAcademicYears,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select } from "@/components/ui";

const EVENT_TYPES = ["event", "registration", "holiday", "exam", "deadline"];

interface EventDraft {
  academicYearId: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn: string;
  note: string;
}

export default function AcademicCalendarPage() {
  const [rows, setRows] = useState<CalendarEventRow[] | null>(null);
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getAcademicCalendar().then(setRows).catch((e: Error) => setError(e.message));
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

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await createCalendarEvent({
        academicYearId: draft.academicYearId,
        title: draft.title.trim(),
        type: draft.type,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn || undefined,
        note: draft.note.trim() || undefined,
      });
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the event.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const valid = draft !== null && !!draft.academicYearId && draft.title.trim() !== "" && draft.startsOn !== "";

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic calendar"
        subtitle="Key dates for the active catalogue year."
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={openComposer} disabled={years.length === 0}>
            Add event
          </Button>
        }
      />

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
            <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Note</th></tr></thead>
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
          title="Add calendar event"
          width={480}
          footer={
            <>
              <Button onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={save} disabled={busy || !valid}>
                {busy ? "Adding…" : "Add event"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Academic year">
              <Select
                value={draft.academicYearId}
                onChange={(v) => setDraft((d) => (d ? { ...d, academicYearId: v } : d))}
                options={years.map((y) => ({ value: y.id, label: y.status === "active" ? `${y.label} (active)` : y.label }))}
              />
            </Field>
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
    </>
  );
}
