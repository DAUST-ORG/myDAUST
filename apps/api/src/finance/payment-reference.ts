import { createHash } from "node:crypto";
import type { Prisma } from "@mydaust/db";
import { normalizeExternalReference } from "./historical-payment-import.manifest.js";

function jsonObject(
  value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, Prisma.JsonValue>;
}

/**
 * Stable, non-reversible uniqueness key for reviewed accounting references.
 * Method is part of the key because separate payment rails can legitimately use
 * the same short numeric reference.
 */
export function externalReferenceFingerprintSha256(
  method: string,
  value: string | null | undefined,
): string | null {
  const normalized = normalizeExternalReference(value);
  if (!normalized) return null;
  return createHash("sha256")
    .update(`${method.trim().toLowerCase()}\u0000${normalized}`)
    .digest("hex");
}

/** Canonical reference evidence already retained by the payment ledger. */
export function paymentReferenceEvidence(payment: {
  providerRef: string;
  ipnPayload: Prisma.JsonValue | null;
  submission: { bankReference: string | null } | null;
}): { normalized: Set<string>; hashes: Set<string> } {
  const normalized = new Set<string>();
  const hashes = new Set<string>();
  const providerRef = normalizeExternalReference(payment.providerRef);
  if (providerRef) normalized.add(providerRef);
  const bankReference = normalizeExternalReference(
    payment.submission?.bankReference,
  );
  if (bankReference) normalized.add(bankReference);

  const payload = jsonObject(payment.ipnPayload);
  if (!payload) return { normalized, hashes };
  for (const key of [
    "externalReference",
    "bankReference",
    "reference",
    "chequeNumber",
  ]) {
    const value = payload[key];
    if (typeof value !== "string") continue;
    const reference = normalizeExternalReference(value);
    if (reference) normalized.add(reference);
  }
  for (const key of ["externalReferenceSha256", "externalReferenceHash"]) {
    const value = payload[key];
    if (typeof value === "string" && /^[0-9a-f]{64}$/i.test(value)) {
      hashes.add(value.toLowerCase());
    }
  }
  return { normalized, hashes };
}
