import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Campus pass token: `studentId.hmac(studentId)`. Signed server-side, rendered as the
 * student's QR, verified constant-time at the dining scanner (and any future gate).
 */
export function signPass(studentId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(studentId).digest("hex");
  return `${studentId}.${sig}`;
}

/** Returns the studentId when the signature checks out; null for anything forged/malformed. */
export function verifyPass(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const studentId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(studentId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return studentId;
}
