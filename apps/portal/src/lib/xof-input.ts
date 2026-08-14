const XOF_PER_MILLION = 1_000_000n;

export const MAX_SAFE_XOF_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_SAFE_MILLIONS_INPUT = "9007199254.740991";

/**
 * Convert a staff-entered millions-of-FCFA decimal into an exact whole-XOF
 * number. Scientific notation and fractions below one XOF are rejected so
 * accounting values are never silently rounded.
 */
export function parseMillionsToWholeXof(
  input: string,
  options: { allowNegative?: boolean } = {},
): number | null {
  const value = input.trim();
  if (value.length > 32) return null;
  const match = /^(-?)(?:(\d+)(?:\.(\d{1,6}))?|\.(\d{1,6}))$/.exec(value);
  if (!match) return null;
  if (match[1] === "-" && !options.allowNegative) return null;

  const whole = BigInt(match[2] ?? "0");
  const fraction = BigInt((match[3] ?? match[4] ?? "").padEnd(6, "0") || "0");
  const unsigned = whole * XOF_PER_MILLION + fraction;
  const signed = match[1] === "-" ? -unsigned : unsigned;
  if (signed > MAX_SAFE_XOF_BIGINT || signed < -MAX_SAFE_XOF_BIGINT) {
    return null;
  }
  return Number(signed);
}

/** Format a safe whole-XOF value as an exact, ungrouped millions decimal. */
export function formatWholeXofAsMillions(amountXof: number): string {
  if (!Number.isSafeInteger(amountXof)) return "";
  const signed = BigInt(amountXof);
  const negative = signed < 0n;
  const absolute = negative ? -signed : signed;
  const whole = absolute / XOF_PER_MILLION;
  const fraction = (absolute % XOF_PER_MILLION)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
