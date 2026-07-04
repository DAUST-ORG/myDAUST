import { describe, expect, it, vi } from "vitest";
import type { ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { z } from "zod";
import { ZodExceptionFilter } from "./zod-exception.filter.js";

function fakeHost() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe("ZodExceptionFilter", () => {
  it("maps a ZodError to 400 with per-issue paths (duck-typed — survives the ESM/CJS dual-package hazard)", () => {
    const { host, res } = fakeHost();
    let zodError: unknown;
    try {
      z.object({ sectionId: z.string().uuid() }).parse({ sectionId: "nope" });
    } catch (e) {
      zodError = e;
    }

    new ZodExceptionFilter().catch(zodError, host);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0]![0] as { message: string; issues: { path: string }[] };
    expect(body.message).toBe("Validation failed");
    expect(body.issues[0]!.path).toBe("sectionId");
  });

  it("still matches when the error is a structural clone (different class identity)", () => {
    const { host, res } = fakeHost();
    const foreign = { name: "ZodError", issues: [{ path: ["amount"], message: "Required" }] };

    new ZodExceptionFilter().catch(foreign, host);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("delegates non-Zod errors to Nest's base handler untouched", () => {
    const { host } = fakeHost();
    const base = vi.spyOn(BaseExceptionFilter.prototype, "catch").mockImplementation(() => {});
    const boom = new Error("boom");

    new ZodExceptionFilter().catch(boom, host);

    expect(base).toHaveBeenCalledWith(boom, host);
    base.mockRestore();
  });
});
