export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface RequestPaymentParams {
  /** Our own reference (ref_command). Stored as Payment.providerRef; echoed back in the IPN. */
  ref: string;
  /** Integer XOF. */
  amount: number;
  itemName: string;
  customField?: Record<string, unknown>;
  /** Per-checkout return pages; fall back to the global PAYTECH_*_URL envs. */
  successUrl?: string;
  cancelUrl?: string;
}

export interface RequestPaymentResult {
  redirectUrl: string;
  /** Gateway checkout token; used as the idempotency key for IPN processing. */
  token: string;
}

export interface IpnVerification {
  /** True only if the payload's authenticity checks pass. */
  valid: boolean;
  ref: string | null;
  token: string | null;
  /** True when the gateway reports the sale completed. */
  success: boolean;
  method: string | null;
}

/**
 * Payment gateway seam. PayTech is the first implementation; dedicated Wave / Orange Money
 * providers slot in later without touching finance domain logic.
 */
export interface PaymentProvider {
  readonly name: string;
  requestPayment(params: RequestPaymentParams): Promise<RequestPaymentResult>;
  /** Verify + interpret a raw IPN payload. Never trust an unverified payload. */
  verifyIpn(payload: Record<string, unknown>): IpnVerification;
  /** Optional gateway refund. When unsupported, finance records the reversal internally only. */
  refund?(providerRef: string, amount: number): Promise<{ ok: boolean; ref?: string }>;
}
