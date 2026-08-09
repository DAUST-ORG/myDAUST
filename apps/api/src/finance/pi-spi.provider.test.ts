import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env.js";
import { PiSpiProvider } from "./pi-spi.provider.js";

const SECRET = "test-webhook-secret";
const PAYE_ALIAS = "9b1b2499-3e50-435b-b757-ac7a83d8aa8c";
const PAYER_ALIAS = "9b1b3499-3e50-435b-b757-ac7a83d8aa96";

const env = {
  PI_SPI_ENABLED: "true",
  PI_SPI_BASE_URL: "https://sandbox.example.test/piz/v1",
  PI_SPI_TOKEN_URL: "https://token.example.test/oauth2/token",
  PI_SPI_CLIENT_ID: "client-id",
  PI_SPI_CLIENT_SECRET: "client-secret",
  PI_SPI_API_KEY: "api-key",
  PI_SPI_PAYE_ALIAS: PAYE_ALIAS,
  PI_SPI_WEBHOOK_SECRET: SECRET,
  PI_SPI_CLIENT_CERT: "-----BEGIN CERTIFICATE-----fake",
  PI_SPI_CLIENT_KEY: "-----BEGIN PRIVATE KEY-----fake",
  PI_SPI_REQUEST_TTL_HOURS: 72,
} as unknown as Env;

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** Provider with the network replaced by a scripted transport. */
class TestProvider extends PiSpiProvider {
  calls: Call[] = [];
  responses: { status: number; text: string }[] = [];

  protected override async transport(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<{ status: number; text: string }> {
    this.calls.push({ method, url, headers, body });
    return this.responses.shift() ?? { status: 200, text: "{}" };
  }
}

function provider(overrides: Partial<Env> = {}) {
  const p = new TestProvider({ ...env, ...overrides } as Env);
  // Skip the real OAuth round-trip; token caching is covered separately.
  vi.spyOn(
    p as unknown as { accessToken: () => Promise<string> },
    "accessToken",
  ).mockResolvedValue("test-token");
  return p;
}

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("PiSpiProvider.isConfigured", () => {
  it("is configured only when every credential including the mTLS pair is present", () => {
    expect(provider().isConfigured()).toBe(true);
  });

  it("is unconfigured without the client certificate (the gateway would drop the TLS handshake)", () => {
    expect(provider({ PI_SPI_CLIENT_CERT: undefined }).isConfigured()).toBe(false);
    expect(provider({ PI_SPI_CLIENT_KEY: undefined }).isConfigured()).toBe(false);
  });

  it("is unconfigured when the feature flag is off, even with full credentials", () => {
    expect(provider({ PI_SPI_ENABLED: "false" } as Partial<Env>).isConfigured()).toBe(false);
  });

  it("refuses to build a request when unconfigured rather than calling out", async () => {
    const p = provider({ PI_SPI_API_KEY: undefined });
    await expect(
      p.requestPayment({ txId: "T1", amount: 1000, payerAlias: PAYER_ALIAS, motif: "x" }),
    ).rejects.toThrow(/not configured/i);
    expect(p.calls).toHaveLength(0);
  });
});

describe("PiSpiProvider.requestPayment", () => {
  it("sends a facture (401) request with our alias, amount and auth headers", async () => {
    const p = provider();
    p.responses.push({
      status: 200,
      text: JSON.stringify({
        txId: "MD-1",
        end2endId: "E2E-1",
        statut: "ENVOYE",
        payeurNom: "Jean Dupont",
        payeurPays: "SN",
        montant: 450000,
      }),
    });

    const res = await p.requestPayment({
      txId: "MD-1",
      amount: 450000,
      payerAlias: PAYER_ALIAS,
      motif: "Tuition 2026-27",
      documentRef: "INV-001",
    });

    expect(res).toMatchObject({
      txId: "MD-1",
      end2endId: "E2E-1",
      status: "sent",
      payerName: "Jean Dupont",
      payerCountry: "SN",
      amount: 450000,
    });

    const call = p.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://sandbox.example.test/piz/v1/demandes-paiements");
    expect(call.headers.Authorization).toBe("Bearer test-token");
    expect(call.headers["x-api-key"]).toBe("api-key");

    const body = JSON.parse(call.body!);
    expect(body).toMatchObject({
      txId: "MD-1",
      categorie: "401",
      payeAlias: PAYE_ALIAS,
      payeurAlias: PAYER_ALIAS,
      montant: 450000,
      refDocNumero: "INV-001",
    });
    expect(Date.parse(body.dateLimitePaiement)).toBeGreaterThan(Date.now());
  });

  it("rejects a txId over the rail's 35-character limit before sending", async () => {
    const p = provider();
    await expect(
      p.requestPayment({
        txId: "MD-" + "x".repeat(40),
        amount: 1000,
        payerAlias: PAYER_ALIAS,
        motif: "x",
      }),
    ).rejects.toThrow(/35 characters/);
    expect(p.calls).toHaveLength(0);
  });

  it("maps a rejection with its ISO 20022 reason code", async () => {
    const p = provider();
    p.responses.push({
      status: 200,
      text: JSON.stringify({ txId: "MD-2", statut: "REJETE", statutRaison: "BE23" }),
    });
    const res = await p.requestPayment({
      txId: "MD-2",
      amount: 1000,
      payerAlias: "bad",
      motif: "x",
    });
    expect(res.status).toBe("rejected");
    expect(res.statusReason).toBe("BE23");
  });

  it("surfaces an RFC 7807 problem detail on failure", async () => {
    const p = provider();
    p.responses.push({
      status: 400,
      text: JSON.stringify({ title: "Format invalide", detail: "montant must be >= 1" }),
    });
    await expect(
      p.requestPayment({ txId: "MD-3", amount: 0, payerAlias: PAYER_ALIAS, motif: "x" }),
    ).rejects.toThrow(/montant must be >= 1/);
  });
});

describe("PiSpiProvider.verifyAlias", () => {
  it("resolves an alias to its owner", async () => {
    const p = provider();
    p.responses.push({
      status: 200,
      text: JSON.stringify({
        client: { nom: "Jean Dupont", pays: "SN" },
        alias: { cle: PAYER_ALIAS },
      }),
    });
    await expect(p.verifyAlias(PAYER_ALIAS)).resolves.toEqual({
      alias: PAYER_ALIAS,
      name: "Jean Dupont",
      country: "SN",
    });
  });

  it("returns null for an unknown alias (404) instead of throwing", async () => {
    const p = provider();
    p.responses.push({ status: 404, text: "" });
    await expect(p.verifyAlias(PAYER_ALIAS)).resolves.toBeNull();
  });
});

describe("PiSpiProvider.verifyWebhook", () => {
  const body = JSON.stringify([
    { event: "PAIEMENT_RECU", data: { txId: "MD-1", end2endId: "E2E-1", montant: 450000 } },
  ]);

  it("accepts a correctly signed body and decodes a settlement", () => {
    const v = provider().verifyWebhook(body, sign(body));
    expect(v.valid).toBe(true);
    expect(v.events).toHaveLength(1);
    expect(v.events[0]).toMatchObject({
      txId: "MD-1",
      end2endId: "E2E-1",
      status: "settled",
      amount: 450000,
    });
  });

  it("accepts a base64 signature as well as hex", () => {
    const b64 = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(provider().verifyWebhook(body, b64).valid).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    expect(provider().verifyWebhook(body, sign(body, "attacker")).valid).toBe(false);
  });

  it("rejects a tampered body (signature covers the raw bytes)", () => {
    const sig = sign(body);
    const tampered = body.replace("450000", "1");
    expect(provider().verifyWebhook(tampered, sig).valid).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(provider().verifyWebhook(body, undefined).valid).toBe(false);
  });

  it("rejects everything when no webhook secret is configured", () => {
    const p = provider({ PI_SPI_WEBHOOK_SECRET: undefined });
    expect(p.verifyWebhook(body, sign(body)).valid).toBe(false);
  });

  it("treats the event name as authoritative over a lagging statut", () => {
    const raw = JSON.stringify([
      { event: "RTP_REJETE", data: { txId: "MD-9", statut: "ENVOYE", statutRaison: "DU03" } },
    ]);
    const v = provider().verifyWebhook(raw, sign(raw));
    expect(v.events[0]).toMatchObject({ status: "rejected", statusReason: "DU03" });
  });

  it("decodes a single-object notification as well as an array", () => {
    const raw = JSON.stringify({ event: "PAIEMENT_RECU", data: { txId: "MD-5" } });
    const v = provider().verifyWebhook(raw, sign(raw));
    expect(v.valid).toBe(true);
    expect(v.events[0]).toMatchObject({ txId: "MD-5", status: "settled" });
  });
});

describe("PiSpiProvider token cache", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fetches once and reuses the token across calls", async () => {
    const p = new TestProvider(env);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "tok", expires_in: 86400 }), {
          status: 200,
        }),
      );
    p.responses.push({ status: 200, text: "{}" }, { status: 200, text: "{}" });

    await p.getRequest("MD-1");
    await p.getRequest("MD-2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(p.calls.every((c) => c.headers.Authorization === "Bearer tok")).toBe(true);
  });
});
