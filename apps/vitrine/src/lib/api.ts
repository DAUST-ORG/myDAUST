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

/** PayTech checkout for the application fee (amount from director config). */
export async function feeCheckout(applicantId: string): Promise<{ redirectUrl: string }> {
  const res = await fetch(`${API_URL}/api/applications/${applicantId}/fee-checkout`, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ redirectUrl: string }>;
}

// --- Public director-configured money settings (fallbacks live in @mydaust/shared) ---
export interface PublicFee {
  key: string;
  label: string;
  minXof: number;
  maxXof: number | null;
  period: string;
  note: string | null;
}
export async function getFees(): Promise<PublicFee[]> {
  const res = await fetch(`${API_URL}/api/config/fees`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<PublicFee[]>;
}

export interface PublicTier {
  id: string;
  minScore: number;
  pct: number;
  band: string;
  note: string | null;
}
export async function getScholarships(): Promise<PublicTier[]> {
  const res = await fetch(`${API_URL}/api/config/scholarships`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<PublicTier[]>;
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(`${API_URL}/api/campus/announcements`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<Announcement[]>;
}
