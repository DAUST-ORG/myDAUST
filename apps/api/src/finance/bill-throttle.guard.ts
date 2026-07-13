import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";

// Rate limiter for the unauthenticated bill endpoints. The security-critical key is
// the studentNo being looked up (the attack is DOB brute-force against a known ID) —
// it is the real request target and, unlike an IP, cannot be spoofed via headers.
// The prod ALB is directly reachable, so cf-connecting-ip/x-forwarded-for are NOT
// trustworthy and are deliberately not used. A coarse global window bounds volumetric
// abuse. The hard per-studentNo failed-DOB cap lives in FinanceService.
// (Single api task in prod, so per-process Maps suffice; move to Redis when scaled.)
const STUDENT_WINDOW_MS = 5 * 60_000;
const STUDENT_MAX = 6; // lookups + checkout for one ID in 5 min (a real payer needs ~2)
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX = 300;

@Injectable()
export class BillThrottleGuard implements CanActivate {
  private readonly byStudent = new Map<string, number[]>();
  private readonly global: number[] = [];

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const body = req.body as { studentNo?: unknown } | undefined;
    const studentNo = typeof body?.studentNo === "string" ? body.studentNo.trim().toLowerCase() : "__none__";

    this.hitList(this.global, now, GLOBAL_MAX, GLOBAL_WINDOW_MS);
    this.hitMap(this.byStudent, studentNo, now, STUDENT_MAX, STUDENT_WINDOW_MS);
    return true;
  }

  private hitList(list: number[], now: number, max: number, window: number): void {
    const kept = list.filter((t) => now - t < window);
    if (kept.length >= max) this.tooMany();
    kept.push(now);
    list.length = 0;
    list.push(...kept);
  }

  private hitMap(map: Map<string, number[]>, key: string, now: number, max: number, window: number): void {
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
    throw new HttpException("Too many attempts. Please wait a minute and try again.", HttpStatus.TOO_MANY_REQUESTS);
  }
}
