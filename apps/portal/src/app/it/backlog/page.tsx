"use client";

import Link from "next/link";
import {
  Bug,
  ClipboardList,
  ExternalLink,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

const REPO = process.env.NEXT_PUBLIC_IT_REPO ?? "DAUST-ORG/myDAUST";
const BACKLOG_URL =
  process.env.NEXT_PUBLIC_IT_BACKLOG_URL ??
  `https://github.com/${REPO}/issues?q=is%3Aopen+label%3Ait-backlog`;

const FILE_LINKS = [
  {
    href: `https://github.com/${REPO}/issues/new?template=it-bug-report.yml`,
    icon: Bug,
    label: "File a bug",
    note: "Something is broken or behaving wrong.",
  },
  {
    href: `https://github.com/${REPO}/issues/new?template=it-feature-request.yml`,
    icon: Lightbulb,
    label: "Request a feature",
    note: "An idea for a new IT capability or improvement.",
  },
  {
    href: `https://github.com/${REPO}/issues/new?template=it-task.yml`,
    icon: ListChecks,
    label: "Log a task",
    note: "Operational work — maintenance, monitoring, infrastructure.",
  },
];

export default function ItBacklogPage() {
  return (
    <>
      <PageHeader
        eyebrow="IT"
        title="IT backlog"
        subtitle="All IT work is tracked in GitHub Issues. Pick a template, fill it in, and an it_admin will triage it."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Card title="Open the IT backlog">
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
            Browse open backlog items, claim work, follow along.
          </p>
          <Link
            href={BACKLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
            }}
          >
            <ClipboardList size={16} />
            Open the IT backlog
            <ExternalLink size={13} />
          </Link>
        </Card>

        {FILE_LINKS.map(({ href, icon: Icon, label, note }) => (
          <Card key={label} title={label}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
              {note}
            </p>
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
              }}
            >
              <Icon size={15} />
              {label}
              <ExternalLink size={12} />
            </Link>
          </Card>
        ))}
      </div>

      <Card title="A few notes">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
          <li>
            Anyone with a portal session can file. Filing opens GitHub and
            requires a GitHub login — most students will need to sign up
            first.
          </li>
          <li>
            The backlog is org-public. Avoid putting student names, student
            numbers, or other PII in issue bodies. If a report needs that
            detail, file it via your staff account and mark it private at
            filing time.
          </li>
          <li>
            An <code>it_admin</code> triages new issues daily. Watch the
            <code> it-bug</code>, <code>it-task</code>, and
            <code> it-backlog</code> labels.
          </li>
        </ul>
      </Card>
    </>
  );
}
