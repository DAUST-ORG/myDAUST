import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { FormThrottleGuard } from "./form-throttle.guard.js";

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body: undefined, params: { token: token ?? "" } }),
    }),
  } as unknown as ExecutionContext;
}

describe("FormThrottleGuard", () => {
  it("allows requests up to the per-token limit", () => {
    const guard = new FormThrottleGuard();
    for (let i = 0; i < 20; i++) {
      expect(guard.canActivate(context("token-a"))).toBe(true);
    }
    expect(() => guard.canActivate(context("token-a"))).toThrow(
      "Too many submissions",
    );
  });

  it("does not share buckets across tokens", () => {
    const guard = new FormThrottleGuard();
    for (let i = 0; i < 20; i++) {
      guard.canActivate(context("token-a"));
    }
    expect(() => guard.canActivate(context("token-a"))).toThrow("Too many");
    expect(guard.canActivate(context("token-b"))).toBe(true);
  });

  it("enforces global limit across all tokens", () => {
    const guard = new FormThrottleGuard();
    // Exhaust global limit (200) across many tokens
    for (let i = 0; i < 200; i++) {
      guard.canActivate(context(`unique-${i}`));
    }
    expect(() => guard.canActivate(context("new-token"))).toThrow("Too many");
  });

  it("treats missing token as distinct key", () => {
    const guard = new FormThrottleGuard();
    for (let i = 0; i < 20; i++) {
      guard.canActivate(context());
    }
    expect(() => guard.canActivate(context())).toThrow("Too many");
    expect(guard.canActivate(context("other"))).toBe(true);
  });
});
