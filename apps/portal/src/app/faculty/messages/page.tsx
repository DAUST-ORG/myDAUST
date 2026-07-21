"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import {
  type Contact,
  type Roster,
  type TeachingSection,
  broadcastToSection,
  getContacts,
  getRoster,
  getTeaching,
  startThread,
} from "@/lib/api";
import { Button, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { courseCode, courseTitle } from "../CourseTabs";

type Mode = "individual" | "course";

interface Sent {
  kind: Mode;
  recipient: string;
  subject: string;
  body: string;
  at: Date;
}

export default function FacultyMessagesPage() {
  const [sections, setSections] = useState<TeachingSection[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [mode, setMode] = useState<Mode>("individual");
  const [studentName, setStudentName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));
    getContacts().then(setContacts).catch(() => {});
  }, []);

  // Switching course resets the selected student, matching the design.
  useEffect(() => {
    if (!sectionId) return;
    setStudentName("");
    getRoster(sectionId).then(setRoster).catch(() => setRoster(null));
  }, [sectionId]);

  const section = sections.find((s) => s.id === sectionId) ?? null;

  /**
   * The roster identifies students by name and number; threads need a personId,
   * so an individual message is only offered for students who also appear in the
   * messaging directory.
   */
  const students = useMemo(() => {
    const byName = new Map(contacts.map((c) => [c.name, c.id]));
    return (roster?.students ?? [])
      .map((s) => ({ name: s.name, personId: byName.get(s.name) }))
      .filter((s): s is { name: string; personId: string } => Boolean(s.personId));
  }, [roster, contacts]);

  const valid =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (mode === "course" ? Boolean(sectionId) : Boolean(studentName));

  async function send() {
    if (!valid || !section) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "course") {
        const res = await broadcastToSection(sectionId, body.trim(), subject.trim());
        setSent((prev) => [
          { kind: "course", recipient: `${courseCode(section)} · ${res.sent} students`, subject: subject.trim(), body: body.trim(), at: new Date() },
          ...prev,
        ]);
      } else {
        const target = students.find((s) => s.name === studentName);
        if (!target) throw new Error("That student cannot be messaged from here.");
        await startThread(target.personId, body.trim(), subject.trim());
        setSent((prev) => [
          { kind: "individual", recipient: target.name, subject: subject.trim(), body: body.trim(), at: new Date() },
          ...prev,
        ]);
      }
      setSubject("");
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="Messages"
        subtitle="Message an individual student or a whole course"
      />

      {sections.length === 0 && (
        <EmptyState title="No sections assigned" note="You are not listed as the instructor for any section this term." />
      )}

      {sections.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 20, alignItems: "start" }} className="msg-grid">
          <div className="card" style={{ margin: 0 }}>
            <p className="h1" style={{ fontSize: 15, marginBottom: 16 }}>Compose</p>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg3)", marginBottom: 8 }}>
              Send to
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {([
                ["individual", "Individual student"],
                ["course", "All students in course"],
              ] as [Mode, string][]).map(([key, label]) => {
                const on = mode === key;
                return (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    style={{
                      flex: 1,
                      padding: "9px 10px",
                      borderRadius: 9,
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      border: `1px solid ${on ? "var(--daust-navy)" : "var(--border)"}`,
                      background: on ? "var(--daust-navy)" : "var(--surface)",
                      color: on ? "#fff" : "var(--fg2)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <Field label="Course">
              <Select
                value={sectionId}
                onChange={setSectionId}
                options={sections.map((s) => ({ value: s.id, label: `${courseCode(s)} · ${courseTitle(s)}` }))}
              />
            </Field>

            {mode === "individual" && (
              <Field label="Student">
                <Select
                  value={studentName}
                  onChange={setStudentName}
                  options={[
                    { value: "", label: "— Select student —" },
                    ...students.map((s) => ({ value: s.name, label: s.name })),
                  ]}
                />
              </Field>
            )}

            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>

            <Field label="Message">
              <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>

            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

            <Button variant="navy" onClick={send} disabled={!valid || busy} full icon={<Send size={15} />}>
              {busy ? "Sending…" : "Send message"}
            </Button>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <p className="h1" style={{ fontSize: 15, marginBottom: 14 }}>Sent messages</p>
            {sent.length === 0 && (
              <p style={{ textAlign: "center", padding: 30, color: "var(--fg3)", fontSize: 13, margin: 0 }}>
                No messages sent yet.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sent.map((m, i) => (
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: "var(--radius-pill)",
                        background: m.kind === "course" ? "rgba(237,132,37,.14)" : "var(--bg-tint)",
                        color: m.kind === "course" ? "#a85f16" : "var(--daust-navy)",
                      }}
                    >
                      {m.kind === "course" ? "Course" : "Direct"}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{m.recipient}</span>
                    <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                      {m.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.subject}</div>
                  <div style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>{m.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
