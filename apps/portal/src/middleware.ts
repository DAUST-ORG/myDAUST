import { type NextRequest, NextResponse } from "next/server";

// payment.daust.net is served by this same portal image (the Cloudflare tunnel forwards
// it to the prod ALB with the Host header intact). Rewrite its root to the standalone
// public bill page; every other host (my.daust.net, etc.) is left untouched.
const PAYMENT_HOSTS = new Set(["payment.daust.net", "payment.daust.azt.dev"]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (PAYMENT_HOSTS.has(host)) {
    if (req.nextUrl.pathname === "/") return NextResponse.rewrite(new URL("/pay-bill", req.url));
    // Staff bill-tracking console lives at payment.daust.net/admin.
    if (req.nextUrl.pathname === "/admin") return NextResponse.rewrite(new URL("/billing-admin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Only page routes need host handling; skip Next internals, the API, uploads and files.
  matcher: ["/((?!_next/|api/|uploads/|.*\\..*).*)"],
};
