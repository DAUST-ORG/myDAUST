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
const START_STUDENT_ID_MAX = 20;
const START_GLOBAL_WINDOW_MS = 60_000;
const START_GLOBAL_MAX = 300;
export const ACTIVATION_RATE_BUCKET_MAX_KEYS = 10_000;

type ActivationRequest = Request;

class DigestRateBuckets {
  private readonly byKey = new Map<string, number[]>();
  private readonly global: number[] = [];

  hit(
    inputs: Array<{ value: string; max: number; windowMs: number }>,
    now: number,
    limits: {
      globalMax: number;
      globalWindowMs: number;
    },
  ) {
    this.hitList(this.global, now, limits.globalMax, limits.globalWindowMs);
    for (const input of inputs) {
      const key = createHash("sha256").update(input.value).digest("hex");
      const recent = (this.byKey.get(key) ?? []).filter(
        (timestamp) => now - timestamp < input.windowMs,
      );
      if (recent.length >= input.max) this.tooMany();
      recent.push(now);
      // Refresh insertion order for an O(1)-amortized bounded LRU. Never scan
      // attacker-controlled code or student-number buckets on the request path.
      this.byKey.delete(key);
      if (this.byKey.size >= ACTIVATION_RATE_BUCKET_MAX_KEYS) {
        const oldest = this.byKey.keys().next().value as string | undefined;
        if (oldest) this.byKey.delete(oldest);
      }
      this.byKey.set(key, recent);
    }
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
 * The narrow account bucket is keyed by normalized student number plus a
 * strict calendar DOB, while the wider student-ID-only bucket bounds DOB
 * variation. The latter necessarily permits a targeted temporary denial of
 * service; this endpoint has no possession factor. The process-global bucket
 * bounds distributed guessing.
 * Counters assume the current single API task; use a shared store before
 * scale-out.
 */
@Injectable()
export class StudentActivationStartThrottleGuard implements CanActivate {
  private readonly buckets = new DigestRateBuckets();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ActivationRequest>();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawStudentNo =
      typeof body.studentNo === "string" ? body.studentNo.slice(0, 128) : "";
    const normalizedStudentNo =
      normalizeStudentNumber(rawStudentNo) || "__invalid__";
    const rawDob = typeof body.dob === "string" ? body.dob.slice(0, 32) : "";
    const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(rawDob)
      ? new Date(`${rawDob}T00:00:00.000Z`)
      : null;
    const normalizedDob =
      parsedDob !== null &&
      !Number.isNaN(parsedDob.getTime()) &&
      parsedDob.toISOString().slice(0, 10) === rawDob
        ? rawDob
        : "__invalid__";
    this.buckets.hit(
      [
        {
          value: `student-start-id-v1\0${normalizedStudentNo}`,
          max: START_STUDENT_ID_MAX,
          windowMs: START_WINDOW_MS,
        },
        {
          value: `student-start-account-v4\0${normalizedStudentNo}\0${normalizedDob}`,
          max: START_ACCOUNT_MAX,
          windowMs: START_WINDOW_MS,
        },
      ],
      Date.now(),
      {
        globalMax: START_GLOBAL_MAX,
        globalWindowMs: START_GLOBAL_WINDOW_MS,
      },
    );
    return true;
  }
}
