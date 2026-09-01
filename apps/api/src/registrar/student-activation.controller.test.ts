import { HttpException, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { IS_PUBLIC_KEY } from "../auth/decorators.js";
import { StudentActivationPublicController } from "./student-activation.controller.js";
import {
  ACTIVATION_RATE_BUCKET_MAX_KEYS,
  StudentActivationStartThrottleGuard,
} from "./student-activation-throttle.guard.js";

function context(body: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as never;
}

function expectRateLimited(action: () => unknown) {
  try {
    action();
    throw new Error("Expected activation throttle to reject the request");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as Error).message).not.toContain("student");
  }
}

const TOKEN = "t".repeat(43);

describe("student activation controller and throttle", () => {
  it("exposes one no-store public POST and no staff approval routes", () => {
    const start = StudentActivationPublicController.prototype.start;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, start)).toBe(true);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, start)).toBe(202);
    expect(Reflect.getMetadata(METHOD_METADATA, start)).toBe(
      RequestMethod.POST,
    );
    expect(
      Object.fromEntries(
        (
          Reflect.getMetadata(HEADERS_METADATA, start) as Array<{
            name: string;
            value: string;
          }>
        ).map((header) => [header.name, header.value]),
      ),
    ).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    expect(Reflect.getMetadata(GUARDS_METADATA, start)).toEqual([
      StudentActivationStartThrottleGuard,
    ]);

    const routes = Object.getOwnPropertyNames(
      StudentActivationPublicController.prototype,
    ).filter((name) => {
      const candidate = StudentActivationPublicController.prototype[
        name as keyof StudentActivationPublicController
      ] as unknown;
      return (
        typeof candidate === "function" &&
        Reflect.hasMetadata(METHOD_METADATA, candidate)
      );
    });
    expect(routes).toEqual(["start"]);
  });

  it("passes the strict browser-owned capability contract to the service", async () => {
    const start = vi.fn().mockResolvedValue({ accepted: true });
    const controller = new StudentActivationPublicController({
      start,
    } as never);
    const input = {
      studentNo: "F2026001",
      dob: "2002-04-19",
      requestToken: TOKEN,
    };

    await expect(controller.start(input)).resolves.toEqual({ accepted: true });
    expect(start).toHaveBeenCalledWith(input);
    expect(() => controller.start({ ...input, extra: true })).toThrow();
    expect(() =>
      controller.start({ ...input, requestToken: "server-mint-this" }),
    ).toThrow();
  });

  it("normalizes the ID and DOB into one narrow account bucket", () => {
    const guard = new StudentActivationStartThrottleGuard();
    const idVariants = [
      " f2026001 ",
      "F2026001",
      "f2026001",
      "Ｆ２０２６００１",
      "F2026001",
    ];
    for (const studentNo of idVariants) {
      expect(
        guard.canActivate(
          context({
            studentNo,
            dob: "2002-04-18",
            requestToken: TOKEN,
          }),
        ),
      ).toBe(true);
    }
    expect(
      guard.canActivate(
        context({
          studentNo: "F2026001",
          dob: "2002-04-19",
          requestToken: TOKEN,
        }),
      ),
    ).toBe(true);
    expectRateLimited(() =>
      guard.canActivate(
        context({
          studentNo: "F2026001",
          dob: "2002-04-18",
          requestToken: TOKEN,
        }),
      ),
    );
    expect(
      guard.canActivate(
        context({
          studentNo: "F2026002",
          dob: "1999-01-01",
          requestToken: TOKEN,
        }),
      ),
    ).toBe(true);
  });

  it("limits DOB variation against one normalized student ID", () => {
    const guard = new StudentActivationStartThrottleGuard();
    for (let index = 0; index < 20; index += 1) {
      expect(
        guard.canActivate(
          context({
            studentNo: "F2026001",
            dob: `2002-04-${String((index % 28) + 1).padStart(2, "0")}`,
            requestToken: TOKEN,
          }),
        ),
      ).toBe(true);
    }
    expectRateLimited(() =>
      guard.canActivate(
        context({
          studentNo: "F2026001",
          dob: "2002-05-20",
          requestToken: TOKEN,
        }),
      ),
    );
  });

  it("bounds attacker-controlled key memory and enforces the global ceiling", () => {
    const guard = new StudentActivationStartThrottleGuard();
    let now = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      for (let index = 0; index < 5_100; index += 1) {
        now += 61_000;
        expect(
          guard.canActivate(
            context({
              studentNo: `MEMORY-${index}`,
              dob: "2002-04-19",
              requestToken: TOKEN,
            }),
          ),
        ).toBe(true);
      }
    } finally {
      clock.mockRestore();
    }
    const internal = guard as unknown as {
      buckets: { byKey: Map<string, number[]> };
    };
    expect(internal.buckets.byKey.size).toBe(ACTIVATION_RATE_BUCKET_MAX_KEYS);

    const globalGuard = new StudentActivationStartThrottleGuard();
    for (let index = 0; index < 300; index += 1) {
      expect(
        globalGuard.canActivate(
          context({
            studentNo: `GLOBAL-${index}`,
            dob: `2002-04-${String((index % 28) + 1).padStart(2, "0")}`,
            requestToken: TOKEN,
          }),
        ),
      ).toBe(true);
    }
    expectRateLimited(() =>
      globalGuard.canActivate(
        context({
          studentNo: "GLOBAL-OVERFLOW",
          dob: "2002-05-01",
          requestToken: TOKEN,
        }),
      ),
    );
  });
});
