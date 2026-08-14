import type { PaymentMethodsConfig } from "@mydaust/shared";
import { describe, expect, it, vi } from "vitest";
import { PaymentSubmissionsService } from "./payment-submissions.service.js";

const qrAsset = {
  objectKey: "payment-files/qr-codes/test.png",
  fileName: "test.png",
  mimeType: "image/png" as const,
  size: 128,
};

function config(): PaymentMethodsConfig {
  return {
    wave: {
      enabled: false,
      phoneNumber: "77 000 00 00",
      merchantNumber: "",
      instructions: "Send the exact amount shown.",
      qrAsset,
    },
    orangeMoney: {
      enabled: false,
      phoneNumber: "78 000 00 00",
      merchantNumber: "DAUST-001",
      instructions: "Use the merchant reference.",
      qrAsset,
    },
    bank: {
      enabled: false,
      bankName: "DAUST Bank",
      beneficiary: "DAUST",
      accountNumber: "001234",
      iban: "SN00 0012 34",
      swift: "DAUSTSN",
      branch: "Dakar",
      instructions: "Include the student number.",
    },
    notificationRecipients: ["finance@daust.edu.sn"],
  };
}

function service() {
  const prisma = {
    appSetting: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async () => []),
  };
  return {
    prisma,
    value: new PaymentSubmissionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("payment method configuration", () => {
  it("requires complete Wave instructions and a QR before enabling", async () => {
    const { value } = service();
    const input = config();
    input.wave.enabled = true;
    input.wave.instructions = "";
    await expect(value.updateConfig(input, "actor")).rejects.toThrow(
      "Wave payments require",
    );
  });

  it("requires the Orange Money merchant number", async () => {
    const { value } = service();
    const input = config();
    input.orangeMoney.enabled = true;
    input.orangeMoney.merchantNumber = "";
    await expect(value.updateConfig(input, "actor")).rejects.toThrow(
      "merchant number",
    );
  });

  it("persists complete enabled configuration with an audit entry", async () => {
    const { value, prisma } = service();
    const input = config();
    input.wave.enabled = true;
    await expect(value.updateConfig(input, "actor")).resolves.toMatchObject({
      wave: { enabled: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
