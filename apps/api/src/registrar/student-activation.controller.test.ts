import { HttpException, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { IS_PUBLIC_KEY, ROLES_KEY } from "../auth/decorators.js";
import {
  StudentActivationPublicController,
  StudentActivationStaffController,
} from "./student-activation.controller.js";
import {
  StudentActivationStaffThrottleGuard,
  StudentActivationStartThrottleGuard,
  StudentActivationStatusThrottleGuard,
} from "./student-activation-throttle.guard.js";

function context(body: unknown, personId?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        body,
        user: personId ? { personId } : undefined,
      }),
    }),
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

describe("student activation controller and throttles", () => {
  it("keeps only POST routes public or registrar-scoped with private response headers", () => {
    const publicStart = StudentActivationPublicController.prototype.start;
    const publicStatus = StudentActivationPublicController.prototype.status;
    const staffResolve = StudentActivationStaffController.prototype.resolve;
    const staffApprove = StudentActivationStaffController.prototype.approve;
    const methods = [publicStart, publicStatus, staffResolve, staffApprove];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, publicStart)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, publicStatus)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, staffResolve)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, staffApprove)).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, StudentActivationStaffController),
    ).toEqual(["admin", "registrar"]);
    expect(Reflect.getMetadata(ROLES_KEY, staffResolve)).toEqual([
      "admin",
      "registrar",
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, staffApprove)).toEqual([
      "admin",
      "registrar",
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, publicStart)).toBe(202);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, publicStatus)).toBe(200);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, staffResolve)).toBe(200);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, staffApprove)).toBe(200);

    for (const method of methods) {
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
        RequestMethod.POST,
      );
      const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
        name: string;
        value: string;
      }>;
      expect(
        Object.fromEntries(
          headers.map((header) => [header.name, header.value]),
        ),
      ).toMatchObject({
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "Referrer-Policy": "no-referrer",
      });
    }
    for (const controller of [
      StudentActivationPublicController,
      StudentActivationStaffController,
    ]) {
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const candidate = controller.prototype[
          name as keyof typeof controller.prototype
        ] as unknown;
        if (
          typeof candidate === "function" &&
          Reflect.hasMetadata(METHOD_METADATA, candidate)
        ) {
          expect(Reflect.getMetadata(METHOD_METADATA, candidate)).toBe(
            RequestMethod.POST,
          );
        }
      }
    }
    for (const method of [publicStart, publicStatus]) {
      const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
        name: string;
        value: string;
      }>;
      expect(
        Object.fromEntries(
          headers.map((header) => [header.name, header.value]),
        ),
      ).toMatchObject({
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      });
    }
  });

  it("pins each route to its dedicated trusted throttle guard", () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentActivationPublicController.prototype.start,
      ),
    ).toEqual([StudentActivationStartThrottleGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentActivationPublicController.prototype.status,
      ),
    ).toEqual([StudentActivationStatusThrottleGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentActivationStaffController.prototype.resolve,
      ),
    ).toEqual([StudentActivationStaffThrottleGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentActivationStaffController.prototype.approve,
      ),
    ).toEqual([StudentActivationStaffThrottleGuard]);
  });

  it("keeps controller bodies strict and requires explicit identity verification", async () => {
    const start = vi.fn().mockResolvedValue({ requestToken: "opaque" });
    const status = vi.fn().mockResolvedValue({ status: "pending" });
    const approve = vi.fn().mockResolvedValue({ kind: "approved" });
    const publicController = new StudentActivationPublicController({
      start,
      status,
    } as never);
    const staffController = new StudentActivationStaffController({
      approve,
    } as never);

    expect(() =>
      publicController.start({
        studentNo: "F2026001",
        dob: "2002-04-19",
        requestToken: "cannot-switch-throttle-route",
      }),
    ).toThrow();
    expect(() =>
      staffController.approve(
        { personId: "registrar-1", roles: ["registrar"] } as never,
        "2b966215-a9d4-475f-8587-d3854cdb7c2f",
        { approvalCode: "123456", identityVerified: false },
      ),
    ).toThrow();
    await expect(
      staffController.approve(
        { personId: "registrar-1", roles: ["registrar"] } as never,
        "2b966215-a9d4-475f-8587-d3854cdb7c2f",
        { approvalCode: "123456", identityVerified: true },
      ),
    ).resolves.toEqual({ kind: "approved" });
    expect(approve).toHaveBeenCalledWith(
      "registrar-1",
      "2b966215-a9d4-475f-8587-d3854cdb7c2f",
      "123456",
      {
        identityVerification: "official_photo_credential_checked_in_person",
      },
    );
  });

  it("limits normalized student-number and DOB start attempts without cross-locking a corrected DOB", () => {
    const guard = new StudentActivationStartThrottleGuard();
    const samePair = [
      " f2026001 ",
      "F2026001",
      "f2026001",
      "Ｆ２０２６００１",
      "F2026001",
    ];
    for (const studentNo of samePair) {
      expect(
        guard.canActivate(
          context({ studentNo, dob: "2002-04-18", requestToken: "ignored" }),
        ),
      ).toBe(true);
    }
    expectRateLimited(() =>
      guard.canActivate(context({ studentNo: "F2026001", dob: "2002-04-18" })),
    );
    expect(
      guard.canActivate(context({ studentNo: "F2026001", dob: "2002-04-19" })),
    ).toBe(true);
  });

  it("limits status polling per opaque token", () => {
    const guard = new StudentActivationStatusThrottleGuard();
    const body = { requestToken: "t".repeat(43) };
    for (let attempt = 0; attempt < 150; attempt += 1) {
      expect(guard.canActivate(context(body))).toBe(true);
    }
    expectRateLimited(() => guard.canActivate(context(body)));
    expect(guard.canActivate(context({ requestToken: "u".repeat(43) }))).toBe(
      true,
    );
  });

  it("limits registrar resolve and approve traffic per actor", () => {
    const guard = new StudentActivationStaffThrottleGuard();
    for (let attempt = 0; attempt < 240; attempt += 1) {
      expect(guard.canActivate(context({}, "registrar-1"))).toBe(true);
    }
    expectRateLimited(() => guard.canActivate(context({}, "registrar-1")));
    expect(guard.canActivate(context({}, "registrar-2"))).toBe(true);
  });

  it("bounds attacker-controlled key memory above ten thousand buckets and enforces the global ceiling", () => {
    const statusGuard = new StudentActivationStatusThrottleGuard();
    let now = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      for (let index = 0; index < 10_050; index += 1) {
        now += 61_000;
        expect(
          statusGuard.canActivate(
            context({ requestToken: `unique-status-token-${index}` }),
          ),
        ).toBe(true);
      }
    } finally {
      clock.mockRestore();
    }
    const internal = statusGuard as unknown as {
      buckets: { byKey: Map<string, number[]> };
    };
    expect(internal.buckets.byKey.size).toBe(10_000);

    const startGuard = new StudentActivationStartThrottleGuard();
    for (let index = 0; index < 300; index += 1) {
      expect(
        startGuard.canActivate(
          context({
            studentNo: `GLOBAL-${index}`,
            dob: "2002-04-19",
          }),
        ),
      ).toBe(true);
    }
    expectRateLimited(() =>
      startGuard.canActivate(
        context({ studentNo: "GLOBAL-OVERFLOW", dob: "2002-04-19" }),
      ),
    );
  });
});
