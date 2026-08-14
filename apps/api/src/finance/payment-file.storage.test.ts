import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  MAX_PAYMENT_FILE_BYTES,
  detectedPaymentFileMime,
  validatePaymentFile,
} from "./payment-file.storage.js";

describe("payment file validation", () => {
  it("accepts signed PDF, JPEG, and PNG evidence", () => {
    expect(detectedPaymentFileMime(Buffer.from("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(detectedPaymentFileMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectedPaymentFileMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
  });

  it("rejects MIME spoofing and oversize evidence", () => {
    expect(() =>
      validatePaymentFile({
        buffer: Buffer.from("%PDF-1.7"),
        size: 8,
        mimetype: "image/png",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validatePaymentFile({
        buffer: Buffer.from("%PDF-1.7"),
        size: MAX_PAYMENT_FILE_BYTES + 1,
        mimetype: "application/pdf",
      }),
    ).toThrow("10 MB");
  });

  it("requires QR assets to be images", () => {
    expect(() =>
      validatePaymentFile(
        {
          buffer: Buffer.from("%PDF-1.7"),
          size: 8,
          mimetype: "application/pdf",
        },
        { imageOnly: true },
      ),
    ).toThrow("QR codes must be JPG or PNG");
  });
});
