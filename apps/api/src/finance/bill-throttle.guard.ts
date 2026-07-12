import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";

// Minimal in-memory sliding-window limiter for the unauthenticated bill endpoints.
// Keyed by the real client IP (cf-connecting-ip behind the Cloudflare tunnel — the
// tunnel/ALB would otherwise collapse every caller to one address). One api task runs
// in prod, so a per-process Map suffices; Cloudflare edge rate-limiting is the stronger
// complementary control. Registered as a provider so the Map is a shared singleton.
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

@Injectable()
export class BillThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = this.clientIp(req);
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
      throw new HttpException(
        "Too many attempts. Please wait a minute and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > 5000) this.prune(now);
    return true;
  }

  private clientIp(req: Request): string {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf) return cf;
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff) return xff.split(",")[0]?.trim() ?? "unknown";
    return req.ip ?? "unknown";
  }

  private prune(now: number): void {
    for (const [ip, times] of this.hits) {
      const recent = times.filter((t) => now - t < WINDOW_MS);
      if (recent.length === 0) this.hits.delete(ip);
      else this.hits.set(ip, recent);
    }
  }
}
