import type { ApplicationInput, ContactInput, PublicNewsArticle, PublicNewsArticleFull, SiteOverrides } from "@mydaust/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Uploaded assets (/uploads/*) are served by the API, not the static site — resolve them. */
export const assetUrl = (u?: string): string | undefined =>
  u && u.startsWith("/uploads") ? `${API_URL}${u}` : u;

/** The CMS override doc the live site serves. Returns null on any failure (site falls back to defaults). */
export async function getPublishedContent(): Promise<SiteOverrides | null> {
  try {
    const res = await fetch(`${API_URL}/api/content/published`);
    if (!res.ok) return null;
    return (await res.json()) as SiteOverrides;
  } catch {
    return null;
  }
}

/** Preview mode: the pending draft, fetched by capability token (works cross-domain, no cookie). */
export async function getPreviewContent(token: string): Promise<SiteOverrides | null> {
  try {
    const res = await fetch(`${API_URL}/api/content/preview/${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    return (await res.json()) as SiteOverrides;
  } catch {
    return null;
  }
}

export interface ApplyResult {
  id: string;
  scholarship: { pct: number; band: string };
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

/** The real SIS programs for the apply form (so a choice always resolves). Null on failure → static fallback. */
export async function getPrograms(): Promise<{ code: string; name: string }[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/config/programs`);
    if (!res.ok) return null;
    const list = (await res.json()) as { code: string; name: string }[];
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/** Published news articles for the News section (empty on failure → default cards). */
export async function getNews(): Promise<PublicNewsArticle[]> {
  try {
    const res = await fetch(`${API_URL}/api/news`);
    if (!res.ok) return [];
    return (await res.json()) as PublicNewsArticle[];
  } catch {
    return [];
  }
}

/** One published article (with body) for the article view. */
export async function getNewsArticle(slug: string): Promise<PublicNewsArticleFull | null> {
  try {
    const res = await fetch(`${API_URL}/api/news/article/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return (await res.json()) as PublicNewsArticleFull;
  } catch {
    return null;
  }
}

/** "Contact us" submission → stored in the CMS inbox. */
export async function submitContact(input: ContactInput): Promise<void> {
  const res = await fetch(`${API_URL}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

/** PayTech checkout for the 30k FCFA application fee. */
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
