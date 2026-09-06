"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Pin, PinOff, Send, StickyNote, Trash2 } from "lucide-react";
import {
  type ApplicantNote,
  createApplicantNote,
  deleteApplicantNote,
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
  Select,
  Textarea,
} from "@/components/ui";
import { admissionsWorkspacePath } from "../workspace-path";

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

/**
 * The applicant notes thread, embedded next to the overview on the detail page.
 * Same endpoints and ownership rules as the standalone /notes route, which stays
 * as a deep link — this panel is the working surface, that page the permalink.
 */
export function NotesPanel({ applicantId }: { applicantId: string }) {
  const basePath = admissionsWorkspacePath(usePathname());
  const { me } = useAuth();
  const [notes, setNotes] = useState<ApplicantNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftKind, setDraftKind] = useState<ApplicantNote["kind"]>("general");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setNotes(await listApplicantNotes(applicantId));
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

  const isAdmin = me?.roles.includes("admin") ?? false;

  return (
    <Card title="Notes">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Textarea
          placeholder="Write a note — visible to admissions staff and admins."
          value={draftBody}
          onChange={setDraftBody}
          rows={3}
          disabled={busy}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Select
            ariaLabel="Note kind"
            value={draftKind}
            onChange={(v) => setDraftKind(v as ApplicantNote["kind"])}
            options={KIND_OPTIONS}
            style={{ minWidth: 130 }}
            disabled={busy}
          />
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
        {error && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--danger)" }}>{error}</p>
        )}
        {notes === null ? (
          <p className="muted">Loading…</p>
        ) : notes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            note="Notes sit next to the file so context never needs a second tab."
            icon={<StickyNote size={24} />}
          />
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              style={{
                borderTop: "1px solid var(--divider)",
                paddingTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Avatar
                  name={`${note.author.firstName} ${note.author.lastName}`}
                  size={30}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                      fontSize: 13,
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
                  <div style={{ fontSize: 11.5, color: "var(--fg3)", marginTop: 1 }}>
                    {formatDateTime(note.createdAt)}
                    {note.editedAt ? ` · edited ${formatDateTime(note.editedAt)}` : ""}
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
                  fontSize: 13.5,
                  color: "var(--fg1)",
                  lineHeight: 1.55,
                }}
              >
                {note.body}
              </div>
            </div>
          ))
        )}
        <Link
          href={`${basePath}/${applicantId}/notes`}
          style={{ fontSize: 12.5, color: "var(--fg3)", fontWeight: 600 }}
        >
          Open full notes view →
        </Link>
      </div>
    </Card>
  );
}
