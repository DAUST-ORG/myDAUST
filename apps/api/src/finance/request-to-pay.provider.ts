/** Automatic request-to-pay rail used by PI-SPI. */

export const REQUEST_TO_PAY_PROVIDERS = Symbol("REQUEST_TO_PAY_PROVIDERS");

/** Lifecycle of a request-to-pay, mirroring PI-SPI's `statut`. */
export type RequestToPayStatus =
  | "initiated" // awaiting our confirmation (two-step flow)
  | "sent" // delivered to the payer, awaiting their approval
  | "settled" // payer approved and funds are irrevocable
  | "cancelled"
  | "rejected"
  | "expired";

/** Result of resolving a payer alias to a human, shown before we push a request at them. */
export interface AliasLookup {
  alias: string;
  name: string;
  country: string | null;
}

export interface RequestToPayParams {
  /** Our reference. Stored as Payment.providerRef and echoed in notifications. */
  txId: string;
  /** Integer XOF. */
  amount: number;
  /** The payer's alias on the rail. */
  payerAlias: string;
  /** Shown to the payer in their banking app. */
  motif: string;
  /** Invoice/document number, so the payer sees what they are settling. */
  documentRef?: string;
  /** Absolute deadline after which the request expires. */
  dueAt?: Date;
  /**
   * When true the rail resolves the alias and returns the payer's identity for us to
   * confirm before it reaches them. We use it to show "Pay as <name>?".
   */
  confirmation?: boolean;
}

export interface RequestToPayResult {
  txId: string;
  /** Rail-wide identifier, unique across participants. Our webhook idempotency key. */
  end2endId: string | null;
  status: RequestToPayStatus;
  /** Rail reason code when rejected (e.g. ISO 20022 `DU03`, `BE23`). */
  statusReason: string | null;
  payerName: string | null;
  payerCountry: string | null;
  amount: number | null;
}

/** One notification decoded from a verified webhook body. */
export interface RequestToPayEvent {
  txId: string | null;
  end2endId: string | null;
  status: RequestToPayStatus;
  statusReason: string | null;
  /** Integer XOF actually moved, when the rail reports it. */
  amount: number | null;
  raw: Record<string, unknown>;
}

export interface WebhookVerification {
  /** True only when the signature check passes. Never act on an unverified body. */
  valid: boolean;
  events: RequestToPayEvent[];
}

export interface RequestToPayProvider {
  /** Matches Payment.provider, so settlement can find the rail that produced a payment. */
  readonly name: string;
  /** Whether credentials are configured; false keeps the method hidden from payers. */
  isConfigured(): boolean;
  /** Resolve an alias to its owner, or null when the rail does not know it. */
  verifyAlias(alias: string): Promise<AliasLookup | null>;
  requestPayment(params: RequestToPayParams): Promise<RequestToPayResult>;
  /** Confirm a request held for two-step validation, releasing it to the payer. */
  confirmRequest(txId: string): Promise<RequestToPayResult>;
  /** Current state, for polling and for the reconciliation sweep. */
  getRequest(txId: string): Promise<RequestToPayResult | null>;
  /** Verify + decode a raw webhook body. Raw bytes, because the signature covers them. */
  verifyWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): WebhookVerification;
}

/**
 * Resolves a request-to-pay rail by name. Settlement dispatches through this so a payment
 * is always interpreted by the rail that created it, even once a second rail exists.
 */
export class RequestToPayRegistry {
  private readonly byName: Map<string, RequestToPayProvider>;

  constructor(providers: RequestToPayProvider[]) {
    this.byName = new Map(providers.map((p) => [p.name, p]));
  }

  /** The rail for a Payment.provider value, or null when it is not a request-to-pay rail. */
  get(name: string): RequestToPayProvider | null {
    return this.byName.get(name) ?? null;
  }

  /** Rails whose credentials are present — the set a payer may actually choose from. */
  configured(): RequestToPayProvider[] {
    return [...this.byName.values()].filter((p) => p.isConfigured());
  }
}
