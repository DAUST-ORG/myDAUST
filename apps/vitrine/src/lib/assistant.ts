// Client-side FAQ assistant — keyword/phrase retrieval over a curated knowledge
// base (see content.ts → chatKb). No LLM, no backend, no API key: answers are
// vetted strings drawn from the site's own content, so nothing is hallucinated
// and there's no cost or abuse surface on this public page.

export interface KbEntry {
  /** Lowercase EN+FR keywords/phrases that should route to this answer. */
  patterns: string[];
  /** The vetted, already-localized answer. */
  answer: string;
}

/** Lowercase, strip accents and punctuation — so "coût"/"cout"/"Cost?" all match. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return the best-matching answer, or `fallback` when nothing scores.
 * Multi-word patterns are matched as a phrase and weighted by length, so a
 * specific match ("financial aid") outranks a generic one ("aid"). Short
 * (<=3 char) single-word patterns require an exact token to avoid matching
 * inside unrelated words.
 */
export function answerQuestion(query: string, kb: KbEntry[], fallback: string): string {
  const q = normalize(query);
  if (!q) return fallback;
  const tokens = new Set(q.split(" "));

  let best: KbEntry | null = null;
  let bestScore = 0;
  for (const entry of kb) {
    let score = 0;
    for (const raw of entry.patterns) {
      const p = normalize(raw);
      if (!p) continue;
      const words = p.split(" ");
      if (words.length === 1) {
        const w = words[0]!;
        if (w.length <= 3 ? tokens.has(w) : q.includes(w)) score += 1;
      } else if (q.includes(p)) {
        score += words.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best ? best.answer : fallback;
}
