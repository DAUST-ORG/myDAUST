import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { BillThrottleGuard } from "../finance/bill-throttle.guard.js";
import { AdmissionsController } from "./admissions.controller.js";

describe("AdmissionsController public status capability", () => {
  it("is throttled and prevents token caching, referrer leakage and indexing", async () => {
    const admissions = {
      publicOnboardingStatus: vi.fn().mockResolvedValue({
        onboardingStatus: "payment_pending",
      }),
    };
    const controller = new AdmissionsController(
      admissions as never,
      {} as never,
    );

    await expect(controller.onboardingStatus("opaque-token")).resolves.toEqual({
      onboardingStatus: "payment_pending",
    });
    expect(admissions.publicOnboardingStatus).toHaveBeenCalledWith(
      "opaque-token",
    );

    const method = AdmissionsController.prototype.onboardingStatus;
    const guards = Reflect.getMetadata(GUARDS_METADATA, method) as unknown[];
    const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
      name: string;
      value: string;
    }>;
    expect(guards).toContain(BillThrottleGuard);
    expect(
      Object.fromEntries(headers.map((row) => [row.name, row.value])),
    ).toMatchObject({
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });
});
