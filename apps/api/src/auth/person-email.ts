/**
 * Parent contacts may intentionally have no email. Every workflow that handles
 * an authenticated or otherwise email-backed identity must fail closed instead
 * of silently treating that contact-only state as a usable address.
 */
export function requirePersonEmail(
  email: string | null | undefined,
  context = "Person",
): string {
  if (!email) {
    throw new Error(`${context} is missing its required identity email`);
  }
  return email;
}
