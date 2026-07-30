"use client";

import { useEffect, useState } from "react";
import { Check, Mail } from "lucide-react";
import { getContactMessages, markContactRead, type ContactMessage } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<ContactMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getContactMessages()
      .then(setMsgs)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load messages."));
  }, []);

  async function toggle(m: ContactMessage) {
    const updated = await markContactRead(m.id, !m.read).catch(() => null);
    if (updated) setMsgs((prev) => prev?.map((x) => (x.id === m.id ? { ...x, read: updated.read } : x)) ?? null);
  }

  if (err) return <Card><div style={{ color: "var(--error-500)" }}>{err}</div></Card>;
  if (!msgs) return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;
  if (msgs.length === 0) {
    return (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--fg3)" }}>
          <Mail size={28} />
          <div>No contact-form messages yet.</div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {msgs.map((m) => (
        <Card key={m.id}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14.5 }}>{m.name}</strong>
                <a href={`mailto:${m.email}`} style={{ fontSize: 13, color: "var(--daust-navy)" }}>{m.email}</a>
                {!m.read && <Badge tone="warning">New</Badge>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg3)" }}>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{m.message}</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Check size={14} />} onClick={() => toggle(m)}>
              {m.read ? "Mark unread" : "Mark read"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
