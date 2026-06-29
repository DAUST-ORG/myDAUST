import type { ApplicationInput } from "@mydaust/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApplyResult {
  id: string;
  scholarship: { pct: number; band: string };
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  author: string | null;
  createdAt: string;
}

export async function submitApplication(input: ApplicationInput): Promise<ApplyResult> {
  const res = await fetch(`${API_URL}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<ApplyResult>;
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(`${API_URL}/api/campus/announcements`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<Announcement[]>;
}
