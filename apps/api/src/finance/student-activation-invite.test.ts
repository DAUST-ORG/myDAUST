import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";

const activation = {
  applicantId: "applicant-1",
  studentId: "student-1",
  studentNo: "S20261AN",
  personId: "person-1",
  email: "awa@example.test",
  name: "Awa Ndiaye",
  inviteToken: "invite-secret",
  inviteExpiresAt: new Date("2026-08-18T00:00:00.000Z"),
};

function service(send: ReturnType<typeof vi.fn>) {
  const prisma = {
    applicant: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ studentInviteSentAt: null }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    prisma,
    finance: new FinanceService(
      prisma as never,
      { send } as never,
      {} as never,
      new Map() as never,
    ),
  };
}

describe("student activation invitation delivery", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("audits a resendable pending delivery when the mail provider throws", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("PORTAL_ORIGIN", "https://portal.example.test");
    const send = vi.fn().mockRejectedValue(new Error("mail unavailable"));
    const { finance, prisma } = service(send);

    await expect(
      finance.deliverStudentActivationInvite(activation),
    ).resolves.toBeUndefined();

    expect(prisma.applicant.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        entity: "Applicant",
        entityId: "applicant-1",
        action: "student-invite-delivery-pending",
        data: { studentId: "student-1" },
      },
    });
  });

  it("audits a resendable pending delivery when runtime configuration is invalid", async () => {
    vi.stubEnv("DATABASE_URL", "not-a-database-url");
    const send = vi.fn().mockResolvedValue({ sent: true });
    const { finance, prisma } = service(send);

    await expect(
      finance.deliverStudentActivationInvite(activation),
    ).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(prisma.applicant.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        entity: "Applicant",
        entityId: "applicant-1",
        action: "student-invite-delivery-pending",
        data: { studentId: "student-1" },
      },
    });
  });

  it("escapes applicant-controlled text in the email body", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("PORTAL_ORIGIN", "https://portal.example.test");
    const send = vi.fn().mockResolvedValue({ sent: true });
    const { finance, prisma } = service(send);

    await finance.deliverStudentActivationInvite({
      ...activation,
      name: '<img src=x onerror="alert(1)">',
      studentNo: "S<2026&1",
    });

    const html = send.mock.calls[0]?.[0]?.html as string;
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("S&lt;2026&amp;1");
    expect(html).not.toContain("<img src=x");
    expect(prisma.applicant.updateMany).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]?.idempotencyKey).toMatch(
      /^student-activation\/applicant-1\/[0-9a-f]{32}$/,
    );
  });

  it("does not report sent when the delivery marker cannot be claimed", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("PORTAL_ORIGIN", "https://portal.example.test");
    const send = vi.fn().mockResolvedValue({ sent: true, id: "mail-1" });
    const { finance, prisma } = service(send);
    prisma.applicant.updateMany.mockResolvedValue({ count: 0 });

    await finance.deliverStudentActivationInvite(activation);

    expect(prisma.applicant.findUnique).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "student-invite-delivery-marker-pending",
        data: expect.objectContaining({ providerMessageId: "mail-1" }),
      }),
    });
  });
});
