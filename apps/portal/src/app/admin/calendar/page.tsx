"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type AcademicYearRow,
  type CalendarEventRow,
  type TermRow,
  createCalendarEvent,
  deleteCalendarEvent,
  getAcademicCalendar,
  getAcademicYears,
  getTerms,
  request,
  updateCalendarEvent,
  updateTerm,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  type BadgeTone,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import styles from "./calendar.module.css";

const EVENT_TYPES = ["event", "registration", "holiday", "exam", "deadline"];
const REGISTRATION_SEMESTERS = ["Fall", "Spring", "Summer"] as const;
const TERM_STATUSES = ["active", "planning", "draft"] as const;
const TERM_STATUS_OPTIONS = [
  { value: "", label: "Not set (legacy)" },
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
  originalStatus: string | null;
  status: string;
  addDeadline: string;
  dropDeadline: string;
}

type RegistrationSemester = (typeof REGISTRATION_SEMESTERS)[number];
type TermStatus = (typeof TERM_STATUSES)[number];

interface RegistrationConfiguration {
  configured: boolean;
  termId: string | null;
  recommendationsEnabled: boolean;
  term: {
    id: string;
    name: string;
    status: string | null;
    semester: string | null;
    academicYearId: string | null;
    academicYearLabel: string | null;
    startDate: string;
    endDate: string;
    addDeadline: string | null;
    dropDeadline: string | null;
  } | null;
}

function getRegistrationConfiguration() {
  return request<RegistrationConfiguration>(
    "/registrar/registration-configuration",
  );
}

function updateRegistrationConfiguration(input: {
  termId: string | null;
  recommendationsEnabled: boolean;
  reason: string;
}) {
  return request<RegistrationConfiguration>(
    "/registrar/registration-configuration",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

/** Date inputs need yyyy-mm-dd; API values may arrive as full ISO timestamps. */
function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/** Group events under month banners (e.g. November 2026) for a scannable calendar. */
function monthGroups(rows: CalendarEventRow[]): {
  key: string;
  label: string;
  events: CalendarEventRow[];
}[] {
  const groups = new Map<string, { label: string; events: CalendarEventRow[] }>();
  const sorted = [...rows].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  for (const e of sorted) {
    const key = e.startsOn.slice(0, 7);
    const label = new Date(`${key}-02T00:00:00Z`).toLocaleString("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const group = groups.get(key) ?? { label, events: [] };
    group.events.push(e);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, ...g }));
}

function termBadge(status: string | null): { tone: BadgeTone; label: string } {
  if (status === "active") return { tone: "success", label: "Active" };
  if (status === "planning") return { tone: "warning", label: "Planning" };
  if (status === "draft") return { tone: "neutral", label: "Draft" };
  return { tone: "neutral", label: "Status not set" };
}

function isRegistrationSemester(
  value: string | null | undefined,
): value is RegistrationSemester {
  return REGISTRATION_SEMESTERS.some((semester) => semester === value);
}

function isTermStatus(value: string): value is TermStatus {
  return TERM_STATUSES.some((status) => status === value);
}

export default function AcademicCalendarPage() {
  const [rows, setRows] = useState<CalendarEventRow[] | null>(null);
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [registration, setRegistration] =
    useState<RegistrationConfiguration | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationLoadError, setRegistrationLoadError] = useState(false);
  const [registrationTermId, setRegistrationTermId] = useState("");
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(false);
  const [registrationReason, setRegistrationReason] = useState("");
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(
    null,
  );
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [termDraft, setTermDraft] = useState<TermDraft | null>(null);
  const [removing, setRemoving] = useState<CalendarEventRow | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRegistration = useCallback(async () => {
    setRegistrationLoading(true);
    setRegistrationLoadError(false);
    setRegistrationError(null);
    try {
      const configuration = await getRegistrationConfiguration();
      setRegistration(configuration);
      setRecommendationsEnabled(configuration.recommendationsEnabled);
      setRegistrationTermId((current) => configuration.termId ?? current);
    } catch (cause) {
      setRegistrationLoadError(true);
      setRecommendationsEnabled(false);
      setRegistrationError(
        cause instanceof Error
          ? cause.message
          : "Could not load registration controls.",
      );
    } finally {
      setRegistrationLoading(false);
    }
  }, []);

  const load = useCallback(() => {
    getAcademicCalendar()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
    getTerms()
      .then((nextTerms) => {
        setTerms(nextTerms);
        setRegistrationTermId((current) =>
          current
            ? current
            : (nextTerms.find((term) => term.status === "active")?.id ??
              nextTerms[0]?.id ??
              ""),
        );
      })
      .catch(() => setTerms([]));
    void loadRegistration();
  }, [loadRegistration]);
  useEffect(() => {
    load();
    getAcademicYears()
      .then(setYears)
      .catch(() => setYears([]));
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
      originalStatus: t.status,
      status: t.status ?? "",
      addDeadline: toDateInput(t.addDeadline),
      dropDeadline: toDateInput(t.dropDeadline),
    });
  }

  async function saveTerm() {
    if (!termDraft) return;
    setBusy(true);
    setError(null);
    try {
      const statusChanged =
        termDraft.status !== (termDraft.originalStatus ?? "");
      await updateTerm(termDraft.id, {
        ...(statusChanged && isTermStatus(termDraft.status)
          ? {
              status: termDraft.status,
            }
          : {}),
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

  async function saveRegistration() {
    const reason = registrationReason.trim();
    if (!registrationTermId || reason.length < 5 || reason.length > 500) return;
    setRegistrationBusy(true);
    setRegistrationError(null);
    setRegistrationNotice(null);
    try {
      const next = await updateRegistrationConfiguration({
        termId: registrationTermId,
        recommendationsEnabled:
          recommendationsEnabled && selectedTermSupportsRecommendations,
        reason,
      });
      setRegistration(next);
      setRegistrationLoadError(false);
      setRecommendationsEnabled(next.recommendationsEnabled);
      setRegistrationReason("");
      setRegistrationNotice(
        `Registration now uses ${next.term?.name ?? "the selected term"}${
          next.recommendationsEnabled
            ? " with course recommendations enabled."
            : ". Course recommendations remain off."
        }`,
      );
    } catch (cause) {
      setRegistrationError(
        cause instanceof Error
          ? cause.message
          : "Could not update registration settings.",
      );
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function closeRegistration() {
    const reason = registrationReason.trim();
    if (reason.length < 5 || reason.length > 500) return;
    setRegistrationBusy(true);
    setRegistrationError(null);
    setRegistrationNotice(null);
    try {
      const next = await updateRegistrationConfiguration({
        termId: null,
        recommendationsEnabled: false,
        reason,
      });
      setRegistration(next);
      setRegistrationLoadError(false);
      setRecommendationsEnabled(false);
      setRegistrationReason("");
      setRegistrationNotice(
        "Registration is explicitly closed. No term will be selected automatically.",
      );
      setConfirmClose(false);
    } catch (cause) {
      setRegistrationError(
        cause instanceof Error
          ? cause.message
          : "Could not close registration.",
      );
    } finally {
      setRegistrationBusy(false);
    }
  }

  const valid =
    draft !== null &&
    draft.title.trim() !== "" &&
    draft.startsOn !== "" &&
    (!!draft.id || !!draft.academicYearId);
  const selectedRegistrationTerm = terms.find(
    (term) => term.id === registrationTermId,
  );
  const selectedTermSupportsRecommendations = Boolean(
    isRegistrationSemester(selectedRegistrationTerm?.semester) &&
    selectedRegistrationTerm.academicYearId,
  );

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic Calendar & Terms"
        subtitle="Configure academic terms and key dates."
        actions={
          <Button
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={openComposer}
            disabled={years.length === 0}
          >
            Add event
          </Button>
        }
      />

      {error && (
        <p className="card" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {registrationNotice && (
        <div className={styles.notice} role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          {registrationNotice}
        </div>
      )}
      {registrationError && (
        <div className={styles.registrationError} role="alert">
          {registrationError}
        </div>
      )}

      <section
        className={styles.registrationPanel}
        aria-labelledby="registration-control-title"
      >
        <div className={styles.registrationStatus}>
          <div className={styles.registrationHeading}>
            <span className={styles.registrationIcon} aria-hidden="true">
              {registration?.configured && !registration.term ? (
                <LockKeyhole size={20} />
              ) : (
                <CalendarDays size={20} />
              )}
            </span>
            <div>
              <div className="eyebrow">Student registration</div>
              <h2 id="registration-control-title">
                {registrationLoading
                  ? "Loading registration state…"
                  : registrationLoadError
                    ? "Registration state unavailable"
                    : registration?.configured && registration.term
                      ? `Open for ${registration.term.name}`
                      : registration?.configured
                        ? "Registration explicitly closed"
                        : "Automatic term selection"}
              </h2>
            </div>
          </div>
          {!registrationLoading && !registrationLoadError && (
            <Badge
              tone={
                registration?.configured && !registration.term
                  ? "error"
                  : registration?.configured
                    ? "success"
                    : "warning"
              }
            >
              {registration?.configured && !registration.term
                ? "Closed"
                : registration?.configured
                  ? "Designated term"
                  : "Legacy fallback"}
            </Badge>
          )}
          <p>
            {registrationLoadError
              ? "The saved registration target is invalid or unavailable. Choose a valid term below or explicitly close registration to repair it; recommendations default to off."
              : registration?.configured && registration.term
                ? `${registration.term.academicYearLabel ?? "Academic year not mapped"} · ${registration.term.semester ?? "Semester not mapped"}. Students register only against this term.`
                : registration?.configured
                  ? "This is a deliberate closure. The system will not fall back to an active or upcoming term."
                  : "No registrar setting exists yet. The system may choose an active or upcoming term automatically; recommendations are off."}
          </p>
          {registration?.term && (
            <dl className={styles.registrationDates}>
              <div>
                <dt>Term dates</dt>
                <dd>
                  {formatDate(registration.term.startDate)} –{" "}
                  {formatDate(registration.term.endDate)}
                </dd>
              </div>
              <div>
                <dt>Add deadline</dt>
                <dd>
                  {registration.term.addDeadline
                    ? formatDate(registration.term.addDeadline)
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt>Drop deadline</dt>
                <dd>
                  {registration.term.dropDeadline
                    ? formatDate(registration.term.dropDeadline)
                    : "Not set"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className={styles.registrationForm}>
          <Field
            label="Registration term"
            hint="Choose the one term students can register against."
          >
            <Select
              value={registrationTermId}
              onChange={(termId) => {
                setRegistrationTermId(termId);
                setRecommendationsEnabled(false);
              }}
              disabled={
                registrationBusy || registrationLoading || terms.length === 0
              }
              ariaLabel="Registration term"
              options={[
                { value: "", label: "Select a term…" },
                ...terms.map((term) => ({
                  value: term.id,
                  label: `${term.name}${term.academicYear ? ` · ${term.academicYear}` : ""}${term.semester ? ` · ${term.semester}` : ""}`,
                })),
              ]}
            />
          </Field>
          {selectedRegistrationTerm && !selectedTermSupportsRecommendations && (
            <div className={styles.mappingWarning} role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              Map this term to an academic year and Fall, Spring or Summer
              before enabling course recommendations. Registration can still use
              the term.
            </div>
          )}
          <label className={styles.recommendationToggle}>
            <input
              type="checkbox"
              checked={
                selectedTermSupportsRecommendations && recommendationsEnabled
              }
              disabled={
                registrationBusy ||
                registrationLoading ||
                !registrationTermId ||
                !selectedTermSupportsRecommendations
              }
              onChange={(event) =>
                setRecommendationsEnabled(event.target.checked)
              }
            />
            <span aria-hidden="true" className={styles.switchTrack} />
            <span>
              <strong>
                <Sparkles size={15} aria-hidden="true" /> Course recommendations
              </strong>
              <small>
                Prioritize the approved programme plan, completed courses and
                prerequisites for this term.
              </small>
            </span>
          </label>
          <Field
            label="Reason for change"
            hint={`${registrationReason.trim().length}/500 characters · minimum 5`}
          >
            <textarea
              rows={3}
              value={registrationReason}
              maxLength={500}
              disabled={registrationBusy || registrationLoading}
              placeholder="Explain why this registration state is changing."
              onChange={(event) => setRegistrationReason(event.target.value)}
            />
          </Field>
          <div className={styles.registrationActions}>
            <Button
              variant="danger"
              onClick={() => setConfirmClose(true)}
              disabled={
                registrationBusy ||
                registrationLoading ||
                registrationReason.trim().length < 5 ||
                registrationReason.trim().length > 500 ||
                Boolean(registration?.configured && !registration.term)
              }
            >
              {registration?.configured && !registration.term
                ? "Registration is closed"
                : "Close registration"}
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveRegistration()}
              disabled={
                registrationBusy ||
                registrationLoading ||
                !registrationTermId ||
                registrationReason.trim().length < 5 ||
                registrationReason.trim().length > 500
              }
            >
              {registrationBusy
                ? "Saving…"
                : registration?.term
                  ? "Save registration settings"
                  : "Open selected term"}
            </Button>
          </div>
        </div>
      </section>

      {terms.length > 0 && (
        <section aria-labelledby="term-heading">
          <div className={styles.sectionHeading}>
            <div>
              <div className="eyebrow">Term records</div>
              <h2 id="term-heading">Dates and deadlines</h2>
            </div>
            <p>
              Term status organizes the calendar. The registration term above is
              the student-facing authority.
            </p>
          </div>
          <div className={styles.termGrid}>
            {terms.map((t) => {
              const badge = termBadge(t.status);
              const isRegistrationTerm = registration?.termId === t.id;
              return (
                <div
                  key={t.id}
                  className={
                    isRegistrationTerm ? styles.currentTerm : undefined
                  }
                >
                  <Card>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 16,
                            fontWeight: 700,
                          }}
                        >
                          {t.name}
                        </div>
                        {(t.academicYear || t.semester) && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {[t.academicYear, t.semester]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className={styles.termBadges}>
                        {isRegistrationTerm && (
                          <Badge tone="navy">Registration term</Badge>
                        )}
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                    </div>
                    <dl className={styles.termDates}>
                      <div>
                        <dt>Runs</dt>
                        <dd>
                          {formatDate(t.startDate)} – {formatDate(t.endDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Add by</dt>
                        <dd>
                          {t.addDeadline
                            ? formatDate(t.addDeadline)
                            : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt>Drop by</dt>
                        <dd>
                          {t.dropDeadline
                            ? formatDate(t.dropDeadline)
                            : "Not set"}
                        </dd>
                      </div>
                    </dl>
                    <div style={{ marginTop: 12 }}>
                      <Button
                        size="sm"
                        icon={<Pencil size={13} />}
                        onClick={() => openEditTerm(t)}
                      >
                        Edit term
                      </Button>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No calendar entries for the active year"
          note="Registration windows, holidays, exam periods and deadlines appear here once added."
        />
      )}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthGroups(rows).map((group) => (
                  <Fragment key={group.key}>
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          background: "var(--bg-subtle)",
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: "var(--daust-navy)",
                          letterSpacing: ".04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.events.map((e) => (
                      <tr key={e.id} className="sis-row">
                        <td style={{ whiteSpace: "nowrap" }}>
                          {formatDate(e.startsOn)}
                          {e.endsOn && (
                            <span className="muted"> – {formatDate(e.endsOn)}</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{e.title}</td>
                        <td>
                          <Badge tone="neutral">{e.type}</Badge>
                        </td>
                        <td className="muted">{e.note ?? "—"}</td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              justifyContent: "flex-end",
                              width: "100%",
                            }}
                          >
                            <IconButton
                              label="Edit event"
                              onClick={() => openEditEvent(e)}
                            >
                              <Pencil size={15} />
                            </IconButton>
                            <IconButton
                              label="Delete event"
                              tone="danger"
                              onClick={() => setRemoving(e)}
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
              <Button onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
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
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, academicYearId: v } : d))
                  }
                  options={years.map((y) => ({
                    value: y.id,
                    label:
                      y.status === "active" ? `${y.label} (active)` : y.label,
                  }))}
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
            <div className={styles.dateFields}>
              <Field label="Starts on">
                <Input
                  type="date"
                  value={draft.startsOn}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, startsOn: v } : d))
                  }
                />
              </Field>
              <Field label="Ends on" hint="Optional.">
                <Input
                  type="date"
                  value={draft.endsOn}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, endsOn: v } : d))
                  }
                />
              </Field>
            </div>
            <Field label="Note" hint="Optional.">
              <Input
                value={draft.note}
                onChange={(v) => setDraft((d) => (d ? { ...d, note: v } : d))}
              />
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
              <Button onClick={() => setTermDraft(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="navy" onClick={saveTerm} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field
              label="Status"
              hint="Setting a term Active demotes the others."
            >
              <Select
                value={termDraft.status}
                onChange={(v) =>
                  setTermDraft((t) => (t ? { ...t, status: v } : t))
                }
                options={
                  termDraft.originalStatus === null
                    ? TERM_STATUS_OPTIONS
                    : [
                        ...(termDraft.originalStatus &&
                        !isTermStatus(termDraft.originalStatus)
                          ? [
                              {
                                value: termDraft.originalStatus,
                                label: `Legacy: ${termDraft.originalStatus}`,
                              },
                            ]
                          : []),
                        ...TERM_STATUS_OPTIONS.filter((option) => option.value),
                      ]
                }
              />
            </Field>
            <div className={styles.dateFields}>
              <Field label="Add deadline" hint="Optional.">
                <Input
                  type="date"
                  value={termDraft.addDeadline}
                  onChange={(v) =>
                    setTermDraft((t) => (t ? { ...t, addDeadline: v } : t))
                  }
                />
              </Field>
              <Field label="Drop deadline" hint="Optional.">
                <Input
                  type="date"
                  value={termDraft.dropDeadline}
                  onChange={(v) =>
                    setTermDraft((t) => (t ? { ...t, dropDeadline: v } : t))
                  }
                />
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
              <Button onClick={() => setRemoving(null)} disabled={busy}>
                Cancel
              </Button>
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

      {confirmClose && (
        <Modal
          open
          onClose={() => setConfirmClose(false)}
          title="Explicitly close student registration?"
          footer={
            <>
              <Button
                onClick={() => setConfirmClose(false)}
                disabled={registrationBusy}
              >
                Keep registration state
              </Button>
              <Button
                variant="danger"
                onClick={() => void closeRegistration()}
                disabled={registrationBusy}
              >
                {registrationBusy ? "Closing…" : "Close registration"}
              </Button>
            </>
          }
        >
          <div className={styles.closeWarning}>
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>No term will be available for registration.</strong>
              <p>
                Students will not be able to add courses, and course
                recommendations will be turned off. The system will not choose
                another term automatically.
              </p>
              <small>Audit reason: {registrationReason.trim()}</small>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
