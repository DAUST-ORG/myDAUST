import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BillThrottleGuard } from "./bill-throttle.guard.js";

function context(token: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body: undefined, params: { token } }),
    }),
  } as unknown as ExecutionContext;
}

describe("BillThrottleGuard status capabilities", () => {
  it("bounds reads per status token without sharing the bucket across tokens", () => {
    const guard = new BillThrottleGuard();
    for (let request = 0; request < 30; request += 1) {
      expect(guard.canActivate(context("status-capability-a"))).toBe(true);
    }
    expect(() => guard.canActivate(context("status-capability-a"))).toThrow(
      "Too many attempts",
    );
    expect(guard.canActivate(context("status-capability-b"))).toBe(true);
  });
});
