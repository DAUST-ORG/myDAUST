// Space-grouped digits, then a plain "FCFA" suffix — the label the DAUST design
// uses everywhere. The Intl currency style renders "F CFA" (with a space), which
// disagreed with the compact formatter below; this keeps the two consistent.
const grouped = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Format integer XOF as e.g. "3 500 000 FCFA". */
export function formatXof(amount: number): string {
  return `${grouped.format(amount).replace(/ | /g, " ")} FCFA`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-SN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Compact XOF for KPI tiles where 8-digit amounts overflow the box:
 * ≥1M → "40.65M FCFA", ≥10k → "482k FCFA", below that the full figure.
 * Pair with a title attribute carrying formatXof() for the exact value on hover.
 */
export function formatXofCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}${m >= 100 ? Math.round(m) : m.toFixed(2).replace(/\.?0+$/, "")}M FCFA`;
  }
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)}k FCFA`;
  return formatXof(amount);
}
