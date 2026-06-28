import type { Request } from "express";

export const SESSION_COOKIE = "mydaust_session";

/** Extract the session JWT from the cookie header (no cookie-parser dependency). */
export function cookieExtractor(req: Request): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (part.slice(0, i).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}
