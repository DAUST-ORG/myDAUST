import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env.js";
import { PaytechProvider } from "./paytech.provider.js";

const KEY = "test-api-key";
const SECRET = "test-api-secret";
const env = { PAYTECH_API_KEY: KEY, PAYTECH_API_SECRET: SECRET } as unknown as Env;

function provider() {
  return new PaytechProvider(env);
}

function hmacFor(amount: string, ref: string) {
  return createHmac("sha256", SECRET).update(`${amount}|${ref}|${KEY}`).digest("hex");
}

describe("PaytechProvider.verifyIpn", () => {
  it("accepts a payload with a correct HMAC (method 1)", () => {
    const v = provider().verifyIpn({
      ref_command: "MD-abc",
      token: "tok-1",
      item_price: 1500000,
      hmac_compute: hmacFor("1500000", "MD-abc"),
      type_event: "sale_complete",
      payment_method: "wave",
    });
    expect(v).toMatchObject({ valid: true, ref: "MD-abc", token: "tok-1", success: true, method: "wave" });
  });

  it("rejects a tampered amount (HMAC no longer matches)", () => {
    const v = provider().verifyIpn({
      ref_command: "MD-abc",
      token: "tok-1",
      item_price: 999,
      hmac_compute: hmacFor("1500000", "MD-abc"),
      type_event: "sale_complete",
    });
    expect(v.valid).toBe(false);
  });

  it("rejects a forged HMAC signed with the wrong secret", () => {
    const forged = createHmac("sha256", "attacker-secret").update(`1500000|MD-abc|${KEY}`).digest("hex");
    const v = provider().verifyIpn({
      ref_command: "MD-abc",
      token: "tok-1",
      item_price: 1500000,
      hmac_compute: forged,
      type_event: "sale_complete",
    });
    expect(v.valid).toBe(false);
  });

  it("accepts the sha256-of-keys fallback (method 2)", () => {
    const v = provider().verifyIpn({
      ref_command: "MD-xyz",
      token: "tok-2",
      api_key_sha256: createHash("sha256").update(KEY).digest("hex"),
      api_secret_sha256: createHash("sha256").update(SECRET).digest("hex"),
      type_event: "sale_canceled",
    });
    expect(v.valid).toBe(true);
    expect(v.success).toBe(false);
  });

  it("rejects a payload with no authentication material at all", () => {
    const v = provider().verifyIpn({ ref_command: "MD-abc", token: "tok-1", type_event: "sale_complete" });
    expect(v.valid).toBe(false);
  });
});
