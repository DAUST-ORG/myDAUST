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
  // A number and a QR are two ways of telling the payer the same thing, so either alone
  // is a usable configuration. Requiring all of them rejected real setups.
  it("enables Wave with only a phone number", async () => {
    const { value } = service();
    const input = config();
    input.wave.enabled = true;
    input.wave.qrAsset = null;
    input.wave.instructions = "";
    await expect(value.updateConfig(input, "actor")).resolves.toMatchObject({
      wave: { enabled: true },
    });
  });

  it("enables Wave with only a QR code", async () => {
    const { value } = service();
    const input = config();
    input.wave.enabled = true;
    input.wave.phoneNumber = "";
    input.wave.instructions = "";
    await expect(value.updateConfig(input, "actor")).resolves.toMatchObject({
      wave: { enabled: true },
    });
  });

  it("enables Orange Money with only a merchant number", async () => {
    const { value } = service();
    const input = config();
    input.orangeMoney.enabled = true;
    input.orangeMoney.phoneNumber = "";
    input.orangeMoney.qrAsset = null;
    input.orangeMoney.instructions = "";
    await expect(value.updateConfig(input, "actor")).resolves.toMatchObject({
      orangeMoney: { enabled: true },
    });
  });

  it("still refuses a method with nowhere to send the money", async () => {
    for (const key of ["wave", "orangeMoney"] as const) {
      const { value } = service();
      const input = config();
      input[key].enabled = true;
      input[key].phoneNumber = "";
      input[key].merchantNumber = "";
      input[key].qrAsset = null;
      await expect(value.updateConfig(input, "actor")).rejects.toThrow(
        "somewhere to send the money",
      );
    }
  });

  it("leaves the bank rule alone — it still needs a beneficiary and an account", async () => {
    const { value } = service();
    const input = config();
    input.bank.enabled = true;
    input.bank.accountNumber = "";
    input.bank.iban = "";
    await expect(value.updateConfig(input, "actor")).rejects.toThrow(
      "account number or IBAN",
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

describe("revoked Applicant payer capabilities", () => {
  function publicService(input: {
    applicant?: {
      id: string;
      email: string;
      stage: string;
      onboardingStatus: string;
    } | null;
    paymentLink?: { id: string; status: string } | null;
  }) {
    const prisma = {
      applicant: {
        findUnique: vi.fn().mockResolvedValue(input.applicant ?? null),
      },
      paymentLink: {
        findUnique: vi.fn().mockResolvedValue(input.paymentLink ?? null),
      },
      paymentSubmission: { findMany: vi.fn().mockResolvedValue([]) },
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

  it("rejects a removed Applicant UUID on proof creation and history reads", async () => {
    const { value, prisma } = publicService({
      applicant: {
        id: "removed-applicant",
        email: "removed@example.test",
        stage: "rejected",
        onboardingStatus: "cancelled",
      },
    });
    await expect(
      value.createForApplicant("removed-applicant", "wave", 50_000),
    ).rejects.toThrow("Application not found");
    await expect(value.listForApplicant("removed-applicant")).rejects.toThrow(
      "Application not found",
    );
    expect(prisma.paymentSubmission.findMany).not.toHaveBeenCalled();
  });

  it("rejects a cancelled payment-link token on public history reads", async () => {
    const { value, prisma } = publicService({
      paymentLink: { id: "removed-link", status: "cancelled" },
    });
    await expect(
      value.listForPaymentLinkToken("revoked-token"),
    ).rejects.toThrow("Payment link not found");
    expect(prisma.paymentSubmission.findMany).not.toHaveBeenCalled();
  });
});
