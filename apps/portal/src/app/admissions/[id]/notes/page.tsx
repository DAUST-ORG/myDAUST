"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Pin,
  PinOff,
  Send,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  type ApplicantNote,
  createApplicantNote,
  deleteApplicantNote,
  getApplicant,
  listApplicantNotes,
  updateApplicantNote,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

const KIND_OPTIONS: { value: ApplicantNote["kind"]; label: string }[] = [
  { value: "general", label: "General" },
  { value: "financial", label: "Financial" },
  { value: "academic", label: "Academic" },
  { value: "followup", label: "Follow-up" },
];

function canEditNote(
  note: ApplicantNote,
  me: { personId: string; roles: string[] } | null,
) {
  if (!me) return false;
  if (me.roles.includes("admin")) return true;
  return note.authorId === me.personId;
}

export default function ApplicantNotesPage() {
  const params = useParams<{ id: string }>();
  const applicantId = params.id;
  const { me } = useAuth();

  const [notes, setNotes] = useState<ApplicantNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState<string>("");
  const [draftBody, setDraftBody] = useState("");
  const [draftKind, setDraftKind] = useState<ApplicantNote["kind"]>("general");
  const [draftPinned, setDraftPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [list, applicant] = await Promise.all([
        listApplicantNotes(applicantId),
        getApplicant(applicantId).catch(() => null),
      ]);
      setNotes(list);
      if (applicant) setApplicantName(applicant.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [applicantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function submit() {
    if (!draftBody.trim() || busy) return;
    setBusy(true);
    try {
      await createApplicantNote(applicantId, {
        kind: draftKind,
        body: draftBody.trim(),
      });
      setDraftBody("");
      setDraftKind("general");
      setDraftPinned(false);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: ApplicantNote) {
    if (busy) return;
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteApplicantNote(applicantId, note.id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(note: ApplicantNote) {
    if (busy) return;
    setBusy(true);
    try {
      await updateApplicantNote(applicantId, note.id, { pinned: !note.pinned });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader
          eyebrow="Admissions"
          title="Notes"
          subtitle="Could not load notes for this applicant."
          actions={
            <Link href={`/admissions/${applicantId}`} className="btn-secondary">
              <ArrowLeft size={15} />
              Back to applicant
            </Link>
          }
        />
        <EmptyState title="Could not load notes" note={error} />
      </>
    );
  }

  const isAdmin = me?.roles.includes("admin") ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title="Notes"
        subtitle={
          applicantName
            ? `Free-form notes for ${applicantName}.`
            : "Free-form notes for this applicant."
        }
        actions={
          <Link href={`/admissions/${applicantId}`} className="btn-secondary">
            <ArrowLeft size={15} />
            Back to applicant
          </Link>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Textarea
              placeholder="Write a note about this applicant. Notes are visible to all admissions staff and admins."
              value={draftBody}
              onChange={setDraftBody}
              rows={4}
              disabled={busy}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Select
                ariaLabel="Note kind"
                value={draftKind}
                onChange={(v) => setDraftKind(v as ApplicantNote["kind"])}
                options={KIND_OPTIONS}
                style={{ minWidth: 160 }}
                disabled={busy}
              />
              {isAdmin && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--fg2)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draftPinned}
                    onChange={(e) => setDraftPinned(e.target.checked)}
                    disabled={busy}
                  />
                  Pin to top
                </label>
              )}
              <div style={{ flex: 1 }} />
              <Button
                variant="primary"
                onClick={submit}
                disabled={busy || !draftBody.trim()}
              >
                <Send size={14} />
                Add note
              </Button>
            </div>
          </div>
        </Card>

        {notes === null ? (
          <Card>
            <p className="muted">Loading…</p>
          </Card>
        ) : notes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            note="Add the first one above. Notes are visible to all admissions staff and admins."
            icon={<StickyNote size={28} />}
          />
        ) : (
          notes.map((note) => (
            <Card key={note.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <Avatar
                  name={`${note.author.firstName} ${note.author.lastName}`}
                  size={36}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>
                      {note.author.firstName} {note.author.lastName}
                    </strong>
                    <Badge tone="info">{note.kind}</Badge>
                    {note.pinned && (
                      <Badge tone="warning">
                        <Pin size={10} /> Pinned
                      </Badge>
                    )}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}
                  >
                    {formatDateTime(note.createdAt)}
                    {note.editedAt
                      ? ` · edited ${formatDateTime(note.editedAt)}`
                      : ""}
                  </div>
                </div>
                {canEditNote(note, me) && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => togglePin(note)}
                        title={note.pinned ? "Unpin" : "Pin to top"}
                      >
                        {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(note)}
                      title="Delete note"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  color: "var(--fg1)",
                  lineHeight: 1.55,
                }}
              >
                {note.body}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
