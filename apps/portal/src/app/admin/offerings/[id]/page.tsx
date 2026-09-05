"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  type AdminStudentDirectoryRow,
  type SectionRoster,
  type SectionRosterEntry,
  addSectionEnrollment,
  getAdminStudentDirectory,
  getSectionRoster,
  adminDropEnrollment,
} from "@/lib/api";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import styles from "./roster.module.css";

export default function SectionRosterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sectionId = params.id;

  const [roster, setRoster] = useState<SectionRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SectionRosterEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setRoster(await getSectionRoster(sectionId));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load the roster.",
      );
    }
  }, [sectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const enrolled = useMemo(
    () => (roster?.enrollments ?? []).filter((e) => e.status === "enrolled"),
    [roster],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster?.enrollments ?? [];
    return (roster?.enrollments ?? []).filter((entry) =>
      [entry.name, entry.studentNo, entry.email, entry.program ?? ""].some(
        (field) => field.toLowerCase().includes(q),
      ),
    );
  }, [roster, query]);

  if (error && !roster) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} />}
        title="Roster unavailable"
        note={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (!roster) return <p className="muted">Loading roster…</p>;

  const { section } = roster;
  const seatsLeft = section.capacity - enrolled.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        eyebrow="Academic structure"
        title={`${section.courseCode} · ${section.sectionCode}`}
        subtitle={`${section.courseTitle} · ${section.termName}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="ghost"
              icon={<ArrowLeft size={15} />}
              onClick={() => router.push("/admin/offerings")}
            >
              All sections
            </Button>
            <Button
              variant="primary"
              icon={<UserPlus size={15} />}
              onClick={() => setAdding(true)}
            >
              Add student
            </Button>
          </div>
        }
      />

      <div className={styles.summary}>
        {[
          {
            label: "Enrolled",
            value: `${enrolled.length} / ${section.capacity}`,
          },
          {
            label: "Seats left",
            value: seatsLeft > 0 ? `${seatsLeft}` : "Full",
          },
          { label: "Schedule", value: section.schedule },
          { label: "Room", value: section.room ?? "—" },
          { label: "Instructor", value: section.instructor ?? "Staff" },
          { label: "Status", value: section.status },
        ].map((cell) => (
          <div className={styles.summaryCell} key={cell.label}>
            <span className={styles.summaryLabel}>{cell.label}</span>
            <span className={styles.summaryValue}>{cell.value}</span>
          </div>
        ))}
      </div>

      {section.addDeadlinePassed && (
        <div className={styles.deadlineBanner} role="status">
          <AlertTriangle size={17} aria-hidden style={{ flex: "0 0 auto" }} />
          <span>
            The add period for {section.termName} closed on{" "}
            {formatDay(section.addDeadline)}. You can still change this roster —
            students cannot — and every change is recorded against your account.
          </span>
        </div>
      )}

      {note && (
        <p className="muted" role="status" style={{ fontSize: 14 }}>
          {note}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 14 }}>
          {error}
        </p>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchControl}>
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this roster by name, ID or email"
            aria-label="Search roster"
          />
        </div>
        <span className="muted" style={{ fontSize: 13 }} aria-live="polite">
          {visible.length} of {roster.enrollments.length} shown
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {visible.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title={
                roster.enrollments.length === 0
                  ? "Nobody is enrolled yet"
                  : "No one matches that search"
              }
              note={
                roster.enrollments.length === 0
                  ? "Add a student to build this roster."
                  : undefined
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Grade</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr
                    key={entry.enrollmentId}
                    className={
                      entry.status !== "enrolled" ? styles.dropped : undefined
                    }
                  >
                    <td>
                      <strong>{entry.name}</strong>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {entry.email}
                      </div>
                    </td>
                    <td className="mono">{entry.studentNo}</td>
                    <td>{entry.program ?? "—"}</td>
                    <td>
                      <Badge
                        tone={
                          entry.status === "enrolled"
                            ? "success"
                            : entry.status === "completed"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </td>
                    <td>{entry.grade ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {entry.status === "enrolled" && (
                        <IconButton
                          // The disabled reason doubles as the accessible
                          // name, matching DeleteSectionButton on the sections
                          // list, so the block is explained rather than silent.
                          label={
                            entry.removalBlockedReason ?? "Remove from section"
                          }
                          tone="danger"
                          disabled={Boolean(entry.removalBlockedReason)}
                          onClick={() => setRemoving(entry)}
                        >
                          <UserMinus size={15} />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && (
        <AddStudentModal
          sectionId={sectionId}
          alreadyEnrolled={new Set(enrolled.map((e) => e.studentId))}
          onClose={() => setAdding(false)}
          onAdded={(message) => {
            setAdding(false);
            setNote(message);
            setError(null);
            void load();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Remove from section"
          confirmLabel="Remove"
          message={
            <>
              Remove <strong>{removing.name}</strong> from {section.courseCode}{" "}
              · {section.sectionCode}? Their enrollment is marked dropped, so
              attendance and any work stay on record.
            </>
          }
          onConfirm={async () => {
            await adminDropEnrollment(removing.enrollmentId);
            setRemoving(null);
            setNote(`${removing.name} was removed from the section.`);
            setError(null);
            await load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function AddStudentModal({
  sectionId,
  alreadyEnrolled,
  onClose,
  onAdded,
}: {
  sectionId: string;
  alreadyEnrolled: Set<string>;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [directory, setDirectory] = useState<AdminStudentDirectoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<AdminStudentDirectoryRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminStudentDirectory()
      .then(setDirectory)
      .catch(() => setError("Could not load the student directory."));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return directory
      .filter((row) => !alreadyEnrolled.has(row.id))
      .filter((row) =>
        [row.name, row.studentNo, row.program].some((field) =>
          field.toLowerCase().includes(q),
        ),
      )
      .slice(0, 25);
  }, [directory, query, alreadyEnrolled]);

  async function submit() {
    if (!picked || !reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addSectionEnrollment(
        sectionId,
        picked.id,
        reason.trim(),
      );
      const waived =
        result.waivedGates.length > 0
          ? ` ${result.waivedGates.length} rule(s) waived and recorded.`
          : "";
      onAdded(`${picked.name} was added to the section.${waived}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add the student to this section.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a student to this section"
      width={520}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked || !reason.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? "Adding…" : "Add student"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field
          label="Student"
          hint="Search by name, student ID or programme. Students already on the roster are hidden."
        >
          <div className={styles.searchControl}>
            <Search size={16} aria-hidden />
            <input
              value={picked ? `${picked.name} · ${picked.studentNo}` : query}
              onChange={(event) => {
                setPicked(null);
                setQuery(event.target.value);
              }}
              placeholder="Start typing a name or ID"
              aria-label="Search students"
            />
          </div>
        </Field>

        {!picked && matches.length > 0 && (
          <div className={styles.pickerList} role="listbox">
            {matches.map((row) => (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={false}
                className={styles.pickerRow}
                onClick={() => setPicked(row)}
              >
                <strong>{row.name}</strong>
                <span className={styles.pickerMeta}>
                  {row.studentNo} · {row.program}
                  {row.recordStatus !== "active" && ` · ${row.recordStatus}`}
                </span>
              </button>
            ))}
          </div>
        )}
        {!picked && query.trim() && matches.length === 0 && (
          <p className="muted" style={{ fontSize: 13.5 }}>
            No student matches that search.
          </p>
        )}

        <Field
          label="Reason"
          hint="Recorded on the audit entry. Prerequisites, corequisites, credit limits, standing and major restrictions are waived by this action; a full section, an active hold or an inactive record still blocks it."
        >
          <Textarea
            value={reason}
            onChange={setReason}
            rows={3}
            placeholder="e.g. Dean approved substitution for MATH 1111"
          />
        </Field>

        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13.5 }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
