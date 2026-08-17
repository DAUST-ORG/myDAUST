import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

describe("additional CORS origins", () => {
  it("parses a comma-separated transition allowlist", () => {
    process.env = {
      DATABASE_URL: "postgresql://localhost:5432/mydaust",
      NODE_ENV: "test",
      ADDITIONAL_CORS_ORIGINS: " https://daust.net, https://www.daust.org ",
    };

    expect(loadEnv().ADDITIONAL_CORS_ORIGINS).toEqual([
      "https://daust.net",
      "https://www.daust.org",
    ]);
  });

  it("rejects an invalid origin", () => {
    process.env = {
      DATABASE_URL: "postgresql://localhost:5432/mydaust",
      NODE_ENV: "test",
      ADDITIONAL_CORS_ORIGINS: "not-a-url",
    };

    expect(() => loadEnv()).toThrow(/ADDITIONAL_CORS_ORIGINS/);
  });
});
