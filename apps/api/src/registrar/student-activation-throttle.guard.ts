import { createHash } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { normalizeStudentNumber } from "@mydaust/shared";
import type { Request } from "express";

const START_WINDOW_MS = 15 * 60_000;
const START_ACCOUNT_MAX = 5;
const START_GLOBAL_WINDOW_MS = 60_000;
const START_GLOBAL_MAX = 300;
const STATUS_WINDOW_MS = 15 * 60_000;
const STATUS_TOKEN_MAX = 150;
const STATUS_GLOBAL_WINDOW_MS = 60_000;
const STATUS_GLOBAL_MAX = 6_000;
const STAFF_WINDOW_MS = 10 * 60_000;
// Resolve + approve are two hits. This supports 120 completed desk approvals
// per registrar per 10 minutes while remaining bounded and authenticated.
const STAFF_ACTOR_MAX = 240;
const STAFF_GLOBAL_MAX = 1_000;
export const ACTIVATION_RATE_BUCKET_MAX_KEYS = 10_000;

type ActivationRequest = Request & { user?: { personId?: string } };

class DigestRateBuckets {
  private readonly byKey = new Map<string, number[]>();
  private readonly global: number[] = [];

  hit(input: string, now: number, limits: {
    keyMax: number;
    keyWindowMs: number;
    globalMax: number;
    globalWindowMs: number;
  }) {
    this.hitList(
      this.global,
      now,
      limits.globalMax,
      limits.globalWindowMs,
    );
    const key = createHash("sha256").update(input).digest("hex");
    const recent = (this.byKey.get(key) ?? []).filter(
      (timestamp) => now - timestamp < limits.keyWindowMs,
    );
    if (recent.length >= limits.keyMax) this.tooMany();
    recent.push(now);
    // Refresh insertion order for an O(1)-amortized bounded LRU. Never scan
    // attacker-controlled unique token buckets on the request path.
    this.byKey.delete(key);
    if (this.byKey.size >= ACTIVATION_RATE_BUCKET_MAX_KEYS) {
      const oldest = this.byKey.keys().next().value as string | undefined;
      if (oldest) this.byKey.delete(oldest);
    }
    this.byKey.set(key, recent);
  }

  private hitList(list: number[], now: number, max: number, windowMs: number) {
    const recent = list.filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= max) this.tooMany();
    recent.push(now);
    list.splice(0, list.length, ...recent);
  }

  private tooMany(): never {
    throw new HttpException(
      "Too many activation attempts. Please wait and try again.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * These are intentionally three distinct guards selected by trusted route
 * metadata. Never dispatch on attacker-controlled body shape: an extra field
 * must not move a start request into the more permissive polling bucket.
 * Counters assume the current single API task; use a shared store before scale-out.
 */
@Injectable()
export class StudentActivationStartThrottleGuard implements CanActivate {
  private readonly buckets = new DigestRateBuckets();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ActivationRequest>();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw =
      typeof body.studentNo === "string" ? body.studentNo.slice(0, 128) : "";
    const normalized = normalizeStudentNumber(raw) || "__invalid__";
    const rawDob = typeof body.dob === "string" ? body.dob.slice(0, 32) : "";
    const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(rawDob)
      ? new Date(`${rawDob}T00:00:00.000Z`)
      : null;
    const canonicalDob =
      parsedDob &&
      !Number.isNaN(parsedDob.getTime()) &&
      parsedDob.toISOString().slice(0, 10) === rawDob
        ? rawDob
        : `__invalid__:${rawDob}`;
    // Keep a typo/wrong-DOB bucket from locking out the correct ceremony. The
    // global bucket still bounds distributed DOB guessing for a known ID.
    this.buckets.hit(`student-start-v1\0${normalized}\0${canonicalDob}`, Date.now(), {
      keyMax: START_ACCOUNT_MAX,
      keyWindowMs: START_WINDOW_MS,
      globalMax: START_GLOBAL_MAX,
      globalWindowMs: START_GLOBAL_WINDOW_MS,
    });
    return true;
  }
}

@Injectable()
export class StudentActivationStatusThrottleGuard implements CanActivate {
  private readonly buckets = new DigestRateBuckets();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ActivationRequest>();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token =
      typeof body.requestToken === "string"
        ? body.requestToken.slice(0, 256)
        : "__invalid__";
    this.buckets.hit(token, Date.now(), {
      keyMax: STATUS_TOKEN_MAX,
      keyWindowMs: STATUS_WINDOW_MS,
      globalMax: STATUS_GLOBAL_MAX,
      globalWindowMs: STATUS_GLOBAL_WINDOW_MS,
    });
    return true;
  }
}

@Injectable()
export class StudentActivationStaffThrottleGuard implements CanActivate {
  private readonly buckets = new DigestRateBuckets();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ActivationRequest>();
    this.buckets.hit(req.user?.personId ?? "__anonymous__", Date.now(), {
      keyMax: STAFF_ACTOR_MAX,
      keyWindowMs: STAFF_WINDOW_MS,
      globalMax: STAFF_GLOBAL_MAX,
      globalWindowMs: STAFF_WINDOW_MS,
    });
    return true;
  }
}
