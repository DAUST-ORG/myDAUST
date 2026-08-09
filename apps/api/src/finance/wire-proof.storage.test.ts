import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  MAX_WIRE_PROOF_BYTES,
  detectedWireProofMime,
  validateWireProof,
} from "./wire-proof.storage.js";

describe("wire proof validation", () => {
  it("detects the allowed file signatures", () => {
    expect(detectedWireProofMime(Buffer.from("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(detectedWireProofMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectedWireProofMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
  });

  it("rejects spoofed MIME types and unsupported content", () => {
    expect(() =>
      validateWireProof({
        buffer: Buffer.from("not a pdf"),
        size: 9,
        mimetype: "application/pdf",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateWireProof({
        buffer: Buffer.from("%PDF-1.7"),
        size: 8,
        mimetype: "image/png",
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects files larger than 10 MB", () => {
    expect(() =>
      validateWireProof({
        buffer: Buffer.from("%PDF-1.7"),
        size: MAX_WIRE_PROOF_BYTES + 1,
        mimetype: "application/pdf",
      }),
    ).toThrow("10 MB");
  });
});
