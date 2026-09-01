import { type NextRequest, NextResponse } from "next/server";

// payment.daust.net is served by this same portal image (the Cloudflare tunnel forwards
// it to the prod ALB with the Host header intact). Rewrite its root to the standalone
// public bill page; every other host (my.daust.net, etc.) is left untouched.
const PAYMENT_HOSTS = new Set([
  "payment.daust.net",
  "payment.daust.org",
  "payment.daust.azt.dev",
]);

export function middleware(req: NextRequest) {
  const host =
    (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (PAYMENT_HOSTS.has(host)) {
    if (req.nextUrl.pathname === "/")
      return NextResponse.rewrite(new URL("/pay-bill", req.url));
    // Staff bill-tracking console lives at payment.daust.net/admin.
    if (req.nextUrl.pathname === "/admin")
      return NextResponse.rewrite(new URL("/billing-admin", req.url));
  }

  // Application-status and password-setup URLs are bearer capabilities. Keep the token
  // out of browser/intermediary caches, search indexes and outbound Referer headers.
  if (
    req.nextUrl.pathname.startsWith("/application-status/") ||
    req.nextUrl.pathname === "/set-password" ||
    req.nextUrl.pathname === "/activate-student"
  ) {
    const legacyQueryToken =
      req.nextUrl.pathname === "/set-password"
        ? req.nextUrl.searchParams.get("token")
        : null;
    let response: NextResponse;
    if (legacyQueryToken) {
      // Next serializes search parameters into its server-rendered RSC payload. Move old
      // query-token links to a fragment before rendering so the capability cannot enter HTML.
      const target = req.nextUrl.clone();
      target.search = "";
      target.hash = `token=${encodeURIComponent(legacyQueryToken)}`;
      response = new NextResponse(null, {
        status: 307,
        headers: { Location: target.toString() },
      });
    } else {
      response = NextResponse.next();
    }
    response.headers.set("Cache-Control", "no-store, private, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("X-Frame-Options", "DENY");
    if (
      req.nextUrl.pathname === "/set-password" ||
      req.nextUrl.pathname === "/activate-student"
    ) {
      const connectSources = ["'self'"];
      const configuredApi = process.env.NEXT_PUBLIC_API_URL?.trim();
      if (configuredApi) {
        try {
          connectSources.push(new URL(configuredApi).origin);
        } catch {
          // Build-time environment validation owns malformed API URLs. Keep this
          // sensitive page fail-closed rather than widening its policy.
        }
      }
      response.headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "img-src 'self' data:",
          "font-src 'self' data:",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          `connect-src ${connectSources.join(" ")}`,
        ].join("; "),
      );
    }
    return response;
  }
  return NextResponse.next();
}

export const config = {
  // Only page routes need host handling; skip Next internals, the API, uploads and files.
  matcher: ["/((?!_next/|api/|uploads/|.*\\..*).*)"],
};
