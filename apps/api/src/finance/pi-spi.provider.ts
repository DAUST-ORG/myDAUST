import { Agent, request } from "node:https";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import type {
  AliasLookup,
  RequestToPayEvent,
  RequestToPayParams,
  RequestToPayProvider,
  RequestToPayResult,
  RequestToPayStatus,
  WebhookVerification,
} from "./request-to-pay.provider.js";

/**
 * PI-SPI (BCEAO / UEMOA Plateforme d'Interopérabilité) Business API v1.3.0.
 *
 * A request-to-pay rail, not a hosted checkout: we push a "demande de paiement" at the
 * payer's alias and they approve it in their own banking app, so settlement arrives
 * asynchronously by webhook (with a reconciliation sweep behind it).
 *
 * Three credentials are needed on every call — an OAuth2 client-credentials bearer, the
 * `x-api-key` header, and a mutual-TLS client certificate. Without the certificate the
 * gateway closes the connection during the TLS handshake, so failures look like a network
 * error rather than a 401.
 */

/** `txId` is capped at 35 characters by the spec. */
const MAX_TX_ID = 35;
/** Tuition is billed as a "facture" (categorie 401), which carries a payment deadline. */
const CATEGORIE_FACTURE = "401";
/** Documented ceiling is 20 req/s; stay under it. */
const MIN_REQUEST_INTERVAL_MS = 60;
/** Refresh the token this long before it actually expires. */
const TOKEN_SKEW_MS = 5 * 60_000;

/** PI-SPI `statut` → our rail-neutral lifecycle. */
const STATUS_MAP: Record<string, RequestToPayStatus> = {
  INITIE: "initiated",
  ENVOYE: "sent",
  IRREVOCABLE: "settled",
  ANNULE: "cancelled",
  REJETE: "rejected",
  EXPIRE: "expired",
};

/** Webhook event names that mean money actually moved. */
const SETTLED_EVENTS = new Set([
  "PAIEMENT_RECU",
  "PAIEMENT_RECUE",
  "PAIEMENT_RECU_RTP_ACCEPTE",
  "RTP_ENVOYE_ACCEPTE",
]);
const REJECTED_EVENTS = new Set(["RTP_REJETE", "PAIEMENT_REJETE"]);

interface TokenCache {
  token: string;
  expiresAt: number;
}

/** Shape of a demande-de-paiement as PI-SPI returns it. */
interface PiSpiRequestPayload {
  txId?: string;
  end2endId?: string;
  statut?: string;
  statutRaison?: string;
  payeurNom?: string;
  payeurPays?: string;
  montant?: number;
}

function mapStatus(statut: string | undefined): RequestToPayStatus {
  if (!statut) return "sent";
  return STATUS_MAP[statut.toUpperCase()] ?? "sent";
}

/** Integer XOF only; the rail speaks plain numbers and we never carry decimals. */
function toXof(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

@Injectable()
export class PiSpiProvider implements RequestToPayProvider {
  readonly name = "pi_spi";

  private readonly log = new Logger(PiSpiProvider.name);
  private token: TokenCache | null = null;
  private agent: Agent | null = null;
  /** Serialises outbound calls just enough to stay under the rail's rate limit. */
  private nextSlot = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  isConfigured(): boolean {
    const e = this.env;
    return (
      e.PI_SPI_ENABLED === "true" &&
      !!e.PI_SPI_TOKEN_URL &&
      !!e.PI_SPI_CLIENT_ID &&
      !!e.PI_SPI_CLIENT_SECRET &&
      !!e.PI_SPI_API_KEY &&
      !!e.PI_SPI_PAYE_ALIAS &&
      !!e.PI_SPI_CLIENT_CERT &&
      !!e.PI_SPI_CLIENT_KEY
    );
  }

  private requireConfig(): void {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException(
        "PI-SPI is not configured (needs PI_SPI_ENABLED, client id/secret, API key, payee alias and the mTLS certificate pair)",
      );
    }
  }

  /** The receiving alias every request-to-pay credits. */
  payeAlias(): string {
    this.requireConfig();
    return this.env.PI_SPI_PAYE_ALIAS!;
  }

  /**
   * mTLS agent. Built once and reused so the TLS session is not renegotiated per call —
   * the certificate is what gets us past the gateway at all.
   */
  private httpsAgent(): Agent {
    if (!this.agent) {
      this.agent = new Agent({
        cert: this.env.PI_SPI_CLIENT_CERT,
        key: this.env.PI_SPI_CLIENT_KEY,
        keepAlive: true,
      });
    }
    return this.agent;
  }

  /** Client-credentials token, cached until shortly before it expires (they last ~24h). */
  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now) return this.token.token;

    const basic = Buffer.from(
      `${this.env.PI_SPI_CLIENT_ID}:${this.env.PI_SPI_CLIENT_SECRET}`,
    ).toString("base64");
    const res = await fetch(this.env.PI_SPI_TOKEN_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new InternalServerErrorException(
        `PI-SPI token request failed: ${res.status}`,
      );
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new InternalServerErrorException("PI-SPI token response missing access_token");
    }
    const ttlMs = (data.expires_in ?? 3600) * 1000;
    this.token = {
      token: data.access_token,
      expiresAt: now + Math.max(ttlMs - TOKEN_SKEW_MS, 30_000),
    };
    return this.token.token;
  }

  /** Space out calls so a burst of students cannot breach the rail's 20 req/s cap. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + MIN_REQUEST_INTERVAL_MS;
    const wait = slot - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  /**
   * One HTTPS round-trip over the mTLS agent.
   *
   * Deliberately `node:https` rather than `fetch`: Node's fetch is undici-backed and
   * ignores an `agent`, so a client certificate never reaches the socket and every call
   * dies in the TLS handshake. Overridable so tests can drive the provider without a
   * network or a certificate.
   */
  protected async transport(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<{ status: number; text: string }> {
    const target = new URL(url);
    return new Promise((resolve, reject) => {
      const req = request(
        {
          method,
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || 443,
          path: `${target.pathname}${target.search}`,
          headers,
          agent: this.httpsAgent(),
          timeout: 20_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("PI-SPI request timed out")));
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  private async call<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    this.requireConfig();
    await this.rateLimit();
    const token = await this.accessToken();
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "x-api-key": this.env.PI_SPI_API_KEY!,
    };
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }

    const { status, text } = await this.transport(
      method,
      `${this.env.PI_SPI_BASE_URL}${path}`,
      headers,
      payload,
    );

    if (status === 404) return { status, data: null };
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    if (status < 200 || status >= 300) {
      // RFC 7807 problem+json; surface `detail` so operators see the real reason.
      const problem = data as { detail?: string; title?: string } | null;
      const reason = problem?.detail ?? problem?.title ?? text.slice(0, 200) ?? "unknown error";
      this.log.warn(`PI-SPI ${method} ${path} -> ${status}: ${reason}`);
      throw new InternalServerErrorException(
        `PI-SPI ${method} ${path} failed (${status}): ${reason}`,
      );
    }
    return { status, data };
  }

  async verifyAlias(alias: string): Promise<AliasLookup | null> {
    const { data } = await this.call<{
      client?: { nom?: string; pays?: string };
      alias?: { cle?: string };
    }>("GET", `/alias/${encodeURIComponent(alias)}`);
    if (!data?.client?.nom) return null;
    return {
      alias: data.alias?.cle ?? alias,
      name: data.client.nom,
      country: data.client.pays ?? null,
    };
  }

  async requestPayment(params: RequestToPayParams): Promise<RequestToPayResult> {
    if (params.txId.length > MAX_TX_ID) {
      throw new InternalServerErrorException(
        `PI-SPI txId must be at most ${MAX_TX_ID} characters (got ${params.txId.length})`,
      );
    }
    const dueAt =
      params.dueAt ??
      new Date(Date.now() + this.env.PI_SPI_REQUEST_TTL_HOURS * 3600_000);

    const body: Record<string, unknown> = {
      txId: params.txId,
      confirmation: params.confirmation ?? false,
      categorie: CATEGORIE_FACTURE,
      payeurAlias: params.payerAlias,
      payeAlias: this.payeAlias(),
      montant: params.amount,
      motif: params.motif.slice(0, 140),
      dateLimitePaiement: dueAt.toISOString(),
    };
    if (params.documentRef) {
      body.refDocType = "MSIN";
      body.refDocNumero = params.documentRef.slice(0, 35);
    }

    const { data } = await this.call<PiSpiRequestPayload>(
      "POST",
      "/demandes-paiements",
      body,
    );
    return this.toResult(params.txId, data);
  }

  async confirmRequest(txId: string): Promise<RequestToPayResult> {
    const { data } = await this.call<PiSpiRequestPayload>(
      "PUT",
      `/demandes-paiements/${encodeURIComponent(txId)}/confirmations`,
      { confirmation: true },
    );
    return this.toResult(txId, data);
  }

  async getRequest(txId: string): Promise<RequestToPayResult | null> {
    const { data } = await this.call<PiSpiRequestPayload>(
      "GET",
      `/demandes-paiements/${encodeURIComponent(txId)}`,
    );
    return data ? this.toResult(txId, data) : null;
  }

  private toResult(txId: string, data: PiSpiRequestPayload | null): RequestToPayResult {
    return {
      txId: data?.txId ?? txId,
      end2endId: data?.end2endId ?? null,
      status: mapStatus(data?.statut),
      statusReason: data?.statutRaison ?? null,
      payerName: data?.payeurNom ?? null,
      payerCountry: data?.payeurPays ?? null,
      amount: toXof(data?.montant),
    };
  }

  /**
   * Verify `X-Signature` (HMAC-SHA256 over the raw body) and decode the event list.
   * The raw bytes matter: re-serialising the parsed JSON would change the signed text.
   */
  verifyWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): WebhookVerification {
    const secret = this.env.PI_SPI_WEBHOOK_SECRET;
    if (!secret || !signature) return { valid: false, events: [] };

    const expected = createHmac("sha256", secret)
      .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
      .digest();
    // Accept hex or base64 — the field is documented only as "HMAC-SHA256 of the body".
    let provided: Buffer;
    try {
      provided = /^[0-9a-f]+$/i.test(signature)
        ? Buffer.from(signature, "hex")
        : Buffer.from(signature, "base64");
    } catch {
      return { valid: false, events: [] };
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { valid: false, events: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString());
    } catch {
      return { valid: false, events: [] };
    }
    return { valid: true, events: this.decodeEvents(parsed) };
  }

  /** Notifications arrive as an array of events, or a single object on some rails. */
  private decodeEvents(parsed: unknown): RequestToPayEvent[] {
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { events?: unknown })?.events)
        ? ((parsed as { events: unknown[] }).events)
        : [parsed];

    const events: RequestToPayEvent[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const payload = (
        raw.data && typeof raw.data === "object" ? raw.data : raw
      ) as Record<string, unknown>;
      const eventName = typeof raw.event === "string" ? raw.event : typeof raw.type === "string" ? raw.type : "";

      const statut = typeof payload.statut === "string" ? payload.statut : undefined;
      let status: RequestToPayStatus = mapStatus(statut);
      // The event name is authoritative for terminal outcomes; `statut` may lag behind it.
      if (SETTLED_EVENTS.has(eventName)) status = "settled";
      else if (REJECTED_EVENTS.has(eventName)) status = "rejected";

      events.push({
        txId: typeof payload.txId === "string" ? payload.txId : null,
        end2endId: typeof payload.end2endId === "string" ? payload.end2endId : null,
        status,
        statusReason:
          typeof payload.statutRaison === "string" ? payload.statutRaison : null,
        amount: toXof(payload.montant),
        raw,
      });
    }
    return events;
  }
}
