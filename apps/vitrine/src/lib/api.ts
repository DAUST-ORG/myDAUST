import type {
  ApplicationInput,
  ContactInput,
  PaymentSubmissionSummary,
  ProofPaymentMethod,
  PublicFacultyMember,
  PublicNewsArticle,
  PublicNewsArticleFull,
  PublicProofMethodConfig,
  SiteOverrides,
} from "@mydaust/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Uploaded assets (/uploads/*) are served by the API, not the static site — resolve them. */
export const assetUrl = (u?: string): string | undefined =>
  u && u.startsWith("/uploads") ? `${API_URL}${u}` : u;

/**
 * Module-scope cache for the published CMS doc. The page component has been
 * observed mounting twice in the exported build; without this, the second mount
 * re-renders the baked-in default hero for a beat before its own fetch resolves.
 * Caching the resolved doc (and reusing the in-flight promise) makes a remount
 * paint the correct image on its very first frame.
 */
let publishedContentPromise: Promise<SiteOverrides | null> | null = null;
let publishedContentCache: SiteOverrides | null = null;

/** Last successfully fetched published doc, if any — for initial state on remount. */
export function getCachedPublishedContent(): SiteOverrides | null {
  return publishedContentCache;
}

/** The CMS override doc the live site serves. Returns null on any failure (site falls back to defaults). */
export function getPublishedContent(): Promise<SiteOverrides | null> {
  publishedContentPromise ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/content/published`);
      if (!res.ok) return null;
      publishedContentCache = (await res.json()) as SiteOverrides;
      return publishedContentCache;
    } catch {
      return null;
    }
  })().then((result) => {
    // A failed fetch is not cached: a later mount retries instead of pinning defaults.
    if (result === null) publishedContentPromise = null;
    return result;
  });
  return publishedContentPromise;
}

/** Preview mode: the pending draft, fetched by capability token (works cross-domain, no cookie). */
export async function getPreviewContent(
  token: string,
): Promise<SiteOverrides | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/content/preview/${encodeURIComponent(token)}`,
    );
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

export async function submitApplication(
  input: ApplicationInput,
): Promise<ApplyResult> {
  const res = await fetch(`${API_URL}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<ApplyResult>;
}

/** The real SIS programs for the apply form (so a choice always resolves). Null on failure → static fallback. */
export async function getPrograms(): Promise<
  { code: string; name: string }[] | null
> {
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
export async function getNewsArticle(
  slug: string,
): Promise<PublicNewsArticleFull | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/news/article/${encodeURIComponent(slug)}`,
    );
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

/** Professors toggled public on the site (empty on failure → the vitrine falls back to defaults). */
export async function getPublicFaculty(): Promise<PublicFacultyMember[]> {
  try {
    const res = await fetch(`${API_URL}/api/faculty/public`);
    if (!res.ok) return [];
    return (await res.json()) as PublicFacultyMember[];
  } catch {
    return [];
  }
}

/** Start or resume a proof-based application-fee payment. */
export async function feeCheckout(
  applicantId: string,
  method: ProofPaymentMethod,
): Promise<PaymentSubmissionSummary> {
  const res = await fetch(
    `${API_URL}/api/applications/${applicantId}/fee-checkout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaymentSubmissionSummary>;
}

export async function proofPaymentMethods(): Promise<
  PublicProofMethodConfig[]
> {
  const res = await fetch(`${API_URL}/api/finance/payment-methods`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PublicProofMethodConfig[]>;
}

export async function resumePaymentAttempt(
  token: string,
): Promise<PaymentSubmissionSummary> {
  const res = await fetch(
    `${API_URL}/api/finance/payment-attempts/resume/${encodeURIComponent(token)}`,
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaymentSubmissionSummary>;
}

export async function listApplicationPaymentAttempts(
  applicantId: string,
): Promise<PaymentSubmissionSummary[]> {
  const res = await fetch(
    `${API_URL}/api/finance/applications/${encodeURIComponent(applicantId)}/payment-attempts`,
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaymentSubmissionSummary[]>;
}

export async function changePaymentMethod(
  token: string,
  id: string,
  method: ProofPaymentMethod,
): Promise<PaymentSubmissionSummary> {
  const res = await fetch(
    `${API_URL}/api/finance/payment-attempts/resume/${encodeURIComponent(token)}/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaymentSubmissionSummary>;
}

export async function uploadPaymentProof(
  token: string,
  id: string,
  proof: File,
): Promise<PaymentSubmissionSummary> {
  const form = new FormData();
  form.append("proof", proof);
  const res = await fetch(
    `${API_URL}/api/finance/payment-attempts/resume/${encodeURIComponent(token)}/${id}/proof`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<PaymentSubmissionSummary>;
}

export const paymentQrUrl = (path?: string) =>
  path ? `${API_URL}${path}` : undefined;

// --- PI-SPI (BCEAO instant payment) for the application fee ---
export interface PiSpiAliasLookup {
  alias: string;
  name: string;
  country: string | null;
}
export interface PiSpiRequest {
  txId: string;
  status:
    "initiated" | "sent" | "settled" | "cancelled" | "rejected" | "expired";
  statusReason: string | null;
  payerName: string | null;
  amountXof: number;
  settledAmountXof: number | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Whether the instant-payment rail is live; false hides the option entirely. */
export async function piSpiEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/finance/pi-spi/config`);
    if (!res.ok) return false;
    return ((await res.json()) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

/** Resolve an alias to its owner so the applicant confirms who is being billed. */
export async function verifyPiSpiAlias(
  alias: string,
): Promise<PiSpiAliasLookup> {
  const res = await fetch(`${API_URL}/api/finance/pi-spi/verify-alias`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<PiSpiAliasLookup>;
}

export async function feePiSpi(
  applicantId: string,
  alias: string,
): Promise<PiSpiRequest> {
  const res = await fetch(
    `${API_URL}/api/applications/${applicantId}/fee-pi-spi`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<PiSpiRequest>;
}

export async function feePiSpiStatus(
  applicantId: string,
  txId: string,
): Promise<PiSpiRequest> {
  const res = await fetch(
    `${API_URL}/api/applications/${applicantId}/fee-pi-spi/${encodeURIComponent(txId)}`,
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<PiSpiRequest>;
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
