"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Segmented,
  Select,
  type BadgeTone,
} from "@/components/ui";
import {
  getAdminPrograms,
  getAdminStudents,
  getBroadcasts,
  sendBroadcast,
  type AdminStudent,
  type BroadcastRow,
  type ProgramRow,
} from "@/lib/api";

type AudienceType = "individual" | "year" | "program" | "all";

const AUDIENCE_OPTIONS = [
  { value: "individual", label: "Individual student" },
  { value: "year", label: "By academic year" },
  { value: "program", label: "By program (major)" },
  { value: "all", label: "All students" },
];

const AUDIENCE_BADGE: Record<AudienceType, { label: string; tone: BadgeTone }> = {
  individual: { label: "Individual", tone: "info" },
  year: { label: "Year", tone: "teal" },
  program: { label: "Program", tone: "navy" },
  all: { label: "All", tone: "success" },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function RegistrarMessagesPage() {
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);

  const [audienceType, setAudienceType] = useState<AudienceType>("individual");
  const [studentNo, setStudentNo] = useState("");
  const [year, setYear] = useState("1");
  const [programCode, setProgramCode] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  useEffect(() => {
    getAdminStudents().then(setStudents).catch(() => setStudents([]));
    getAdminPrograms().then((p) => setPrograms(p.programs)).catch(() => setPrograms([]));
    getBroadcasts().then(setBroadcasts).catch(() => setBroadcasts([]));
  }, []);

  const audienceValue = useMemo(() => {
    if (audienceType === "individual") return studentNo || undefined;
    if (audienceType === "year") return year;
    if (audienceType === "program") return programCode || undefined;
    return undefined;
  }, [audienceType, studentNo, year, programCode]);

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (audienceType !== "individual" || studentNo.length > 0) &&
    (audienceType !== "program" || programCode.length > 0);

  async function handleSend() {
    if (!canSend || sending) return;
    setSending(true);
    setSentNote(null);
    try {
      const res = await sendBroadcast({
        audienceType,
        audienceValue,
        subject: subject.trim(),
        body: body.trim(),
      });
      setSubject("");
      setBody("");
      setStudentNo("");
      const rows = await getBroadcasts();
      setBroadcasts(rows);
      setSentNote(`Sent to ${res.sent} recipient${res.sent === 1 ? "" : "s"}.`);
    } finally {
      setSending(false);
    }
  }

  const studentOptions = useMemo(
    () => [
      { value: "", label: "— Select student —" },
      ...students.map((s) => ({ value: s.studentNo, label: `${s.name} · ${s.studentNo}` })),
    ],
    [students],
  );

  const programOptions = useMemo(
    () => [
      { value: "", label: "— Select program —" },
      ...programs.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` })),
    ],
    [programs],
  );

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--fg1)",
    fontSize: 13.5,
    fontFamily: "var(--font-body)",
  };
  const textareaStyle: React.CSSProperties = {
    ...selectStyle,
    minHeight: 130,
    resize: "vertical",
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Send an individual message or broadcast to a year, a program, or all students"
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <Card title="Compose">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Audience">
              <Segmented
                options={AUDIENCE_OPTIONS}
                value={audienceType}
                onChange={(v) => setAudienceType(v as AudienceType)}
              />
            </Field>

            {audienceType === "individual" && (
              <Field label="Student">
                <Select value={studentNo} onChange={setStudentNo} options={studentOptions} style={selectStyle} />
              </Field>
            )}

            {audienceType === "year" && (
              <Field label="Academic year">
                <Select
                  value={year}
                  onChange={setYear}
                  options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Year ${n}` }))}
                  style={selectStyle}
                />
              </Field>
            )}

            {audienceType === "program" && (
              <Field label="Program">
                <Select value={programCode} onChange={setProgramCode} options={programOptions} style={selectStyle} />
              </Field>
            )}

            <Field label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line"
                style={selectStyle}
              />
            </Field>

            <Field label="Message">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                style={textareaStyle}
              />
            </Field>

            <Button variant="navy" full icon={<Send size={15} />} disabled={!canSend || sending} onClick={handleSend}>
              {sending ? "Sending…" : "Send message"}
            </Button>

            {sentNote && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--success)", fontWeight: 600 }}>{sentNote}</p>
            )}
          </div>
        </Card>

        <Card title="Sent messages">
          {broadcasts.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title="No messages sent yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {broadcasts.map((m, i) => {
                const badge = AUDIENCE_BADGE[(m.audienceType as AudienceType) ?? "all"] ?? AUDIENCE_BADGE.all;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "14px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--fg1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.subject}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--fg3)", whiteSpace: "nowrap" }}>{relativeTime(m.createdAt)}</span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "var(--fg2)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {m.body}
                    </p>
                    <span style={{ fontSize: 12, color: "var(--fg3)" }}>
                      {m.recipientCount} recipient{m.recipientCount === 1 ? "" : "s"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
