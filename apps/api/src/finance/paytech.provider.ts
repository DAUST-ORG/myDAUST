import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import type {
  IpnVerification,
  PaymentProvider,
  RequestPaymentParams,
  RequestPaymentResult,
} from "./payment-provider.js";

const PAYTECH_REQUEST_URL = "https://paytech.sn/api/payment/request-payment";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time hex compare; false on any length/format mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * PayTech (paytech.sn) implementation.
 *
 * IPN verification follows PayTech's documented scheme: the IPN payload carries
 * `api_key_sha256` and `api_secret_sha256`; we recompute SHA-256 of our own key/secret
 * and compare. (Confirm exact field names against PayTech docs before go-live — flagged
 * as an open item in the plan.)
 */
@Injectable()
export class PaytechProvider implements PaymentProvider {
  readonly name = "paytech";

  constructor(@Inject(ENV) private readonly env: Env) {}

  private creds(): { key: string; secret: string } {
    const key = this.env.PAYTECH_API_KEY;
    const secret = this.env.PAYTECH_API_SECRET;
    if (!key || !secret) {
      throw new InternalServerErrorException(
        "PayTech keys not configured (set PAYTECH_API_KEY / PAYTECH_API_SECRET)",
      );
    }
    return { key, secret };
  }

  async requestPayment(params: RequestPaymentParams): Promise<RequestPaymentResult> {
    const { key, secret } = this.creds();
    const body = {
      item_name: params.itemName,
      item_price: params.amount,
      currency: "XOF",
      ref_command: params.ref,
      command_name: params.itemName,
      env: this.env.PAYTECH_ENV,
      ipn_url: this.env.PAYTECH_IPN_URL,
      success_url: params.successUrl ?? this.env.PAYTECH_SUCCESS_URL,
      cancel_url: params.cancelUrl ?? this.env.PAYTECH_CANCEL_URL,
      custom_field: JSON.stringify(params.customField ?? {}),
    };

    const res = await fetch(PAYTECH_REQUEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        API_KEY: key,
        API_SECRET: secret,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new InternalServerErrorException(`PayTech request failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      success?: number | boolean;
      token?: string;
      redirect_url?: string;
      redirectUrl?: string;
    };
    const token = data.token;
    const redirectUrl = data.redirect_url ?? data.redirectUrl;
    if (!token || !redirectUrl) {
      throw new InternalServerErrorException("PayTech response missing token/redirect_url");
    }
    return { token, redirectUrl };
  }

  verifyIpn(payload: Record<string, unknown>): IpnVerification {
    const { key, secret } = this.creds();
    const str = (k: string): string | null =>
      typeof payload[k] === "string"
        ? (payload[k] as string)
        : typeof payload[k] === "number"
          ? String(payload[k])
          : null;

    const ref = str("ref_command");
    const token = str("token");
    const method = str("payment_method");
    const typeEvent = payload["type_event"];

    // Method 1 (preferred): HMAC-SHA256 of `amount|ref_command|api_key` keyed with api_secret.
    let valid = false;
    const hmacCompute = str("hmac_compute");
    const amount = str("final_item_price") ?? str("item_price");
    if (hmacCompute && amount && ref) {
      const expected = createHmac("sha256", secret)
        .update(`${amount}|${ref}|${key}`)
        .digest("hex");
      valid = safeEqualHex(expected, hmacCompute);
    }

    // Method 2 (fallback): plain SHA-256 hex of the key/secret strings.
    if (!valid) {
      const keyHash = str("api_key_sha256");
      const secretHash = str("api_secret_sha256");
      valid =
        !!keyHash &&
        !!secretHash &&
        safeEqualHex(sha256(key), keyHash) &&
        safeEqualHex(sha256(secret), secretHash);
    }

    return { valid, ref, token, success: typeEvent === "sale_complete", method };
  }
}
