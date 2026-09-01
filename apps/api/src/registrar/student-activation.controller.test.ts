import { HttpException, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { encodeStudentActivationCode } from "@mydaust/shared";
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

function cardCode(index: number): string {
  const bytes = new Uint8Array(10);
  new DataView(bytes.buffer).setUint32(6, index);
  return encodeStudentActivationCode(bytes);
}

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
      activationCode: "ABCD2345EFGH6789",
      requestToken: TOKEN,
    };

    await expect(controller.start(input)).resolves.toEqual({ accepted: true });
    expect(start).toHaveBeenCalledWith(input);
    expect(() => controller.start({ ...input, extra: true })).toThrow();
    expect(() =>
      controller.start({ ...input, requestToken: "server-mint-this" }),
    ).toThrow();
  });

  it("does not let wrong-DOB traffic consume the real normalized ID+DOB bucket", () => {
    const guard = new StudentActivationStartThrottleGuard();
    const idVariants = [
      " f2026001 ",
      "F2026001",
      "f2026001",
      "Ｆ２０２６００１",
      "F2026001",
    ];
    for (const [index, studentNo] of idVariants.entries()) {
      expect(
        guard.canActivate(
          context({
            studentNo,
            dob: "2002-04-18",
            activationCode: cardCode(index),
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
          activationCode: cardCode(50),
          requestToken: TOKEN,
        }),
      ),
    ).toBe(true);
    expectRateLimited(() =>
      guard.canActivate(
        context({
          studentNo: "F2026001",
          dob: "2002-04-18",
          activationCode: cardCode(51),
          requestToken: TOKEN,
        }),
      ),
    );
    expect(
      guard.canActivate(
        context({
          studentNo: "F2026002",
          dob: "1999-01-01",
          activationCode: cardCode(52),
          requestToken: TOKEN,
        }),
      ),
    ).toBe(true);
  });

  it("also limits repeated attempts with one normalized card code", () => {
    const guard = new StudentActivationStartThrottleGuard();
    const variants = [
      "abcd-2345-efgh-6789",
      "ABCD2345EFGH6789",
      "ＡＢＣＤ２３４５ＥＦＧＨ６７８９",
      "ABCD 2345 EFGH 6789",
      "abcd2345efgh6789",
    ];
    for (let index = 0; index < variants.length; index += 1) {
      expect(
        guard.canActivate(
          context({
            studentNo: `F-CODE-${index}`,
            dob: `2002-04-${String(index + 10).padStart(2, "0")}`,
            activationCode: variants[index],
            requestToken: TOKEN,
          }),
        ),
      ).toBe(true);
    }
    expectRateLimited(() =>
      guard.canActivate(
        context({
          studentNo: "F-CODE-OVERFLOW",
          dob: "2002-04-20",
          activationCode: "ABCD-2345-EFGH-6789",
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
              activationCode: cardCode(index),
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
            activationCode: cardCode(index),
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
          activationCode: cardCode(999),
          requestToken: TOKEN,
        }),
      ),
    );
  });
});
