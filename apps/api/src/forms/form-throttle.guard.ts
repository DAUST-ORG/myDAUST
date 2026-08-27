import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

// Rate limiter for unauthenticated form endpoints. Keys on the public token
// (hashed) to prevent response-flooding. Per-process Maps suffice — single
// API task in prod, per §4 of AGENTS.md.
const FORM_TOKEN_WINDOW_MS = 60_000;
const FORM_TOKEN_MAX = 20; // submissions per token per minute
const FORM_GLOBAL_WINDOW_MS = 60_000;
const FORM_GLOBAL_MAX = 200; // all form submissions per minute

@Injectable()
export class FormThrottleGuard implements CanActivate {
  private readonly byToken = new Map<string, number[]>();
  private readonly global: number[] = [];

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const rawToken = (req.params?.token as string) ?? "";
    const tokenKey = rawToken.length > 0 ? rawToken : "__none__";

    this.hitList(this.global, now, FORM_GLOBAL_MAX, FORM_GLOBAL_WINDOW_MS);
    this.hitMap(this.byToken, tokenKey, now, FORM_TOKEN_MAX, FORM_TOKEN_WINDOW_MS);
    return true;
  }

  private hitList(list: number[], now: number, max: number, window: number): void {
    const kept = list.filter((t) => now - t < window);
    if (kept.length >= max) this.tooMany();
    kept.push(now);
    list.length = 0;
    list.push(...kept);
  }

  private hitMap(
    map: Map<string, number[]>,
    key: string,
    now: number,
    max: number,
    window: number,
  ): void {
    const recent = (map.get(key) ?? []).filter((t) => now - t < window);
    if (recent.length >= max) this.tooMany();
    recent.push(now);
    map.set(key, recent);
    if (map.size > 10_000) {
      for (const [k, times] of map) {
        const r = times.filter((t) => now - t < window);
        if (r.length === 0) map.delete(k);
        else map.set(k, r);
      }
    }
  }

  private tooMany(): never {
    throw new HttpException(
      "Too many submissions. Please wait a minute and try again.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
