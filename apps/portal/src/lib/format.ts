const xof = new Intl.NumberFormat("fr-SN", {
  style: "currency",
  currency: "XOF",
  maximumFractionDigits: 0,
});

/** Format integer XOF as e.g. "3 500 000 FCFA". */
export function formatXof(amount: number): string {
  return xof.format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-SN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
