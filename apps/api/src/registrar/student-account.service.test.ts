import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentAccountService } from "./student-account.service.js";

describe("StudentAccountService setup-link configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not commit a capability when its disclosure origin is invalid", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/mydaust");
    vi.stubEnv("SESSION_SECRET", "student-account-service-test-secret");
    vi.stubEnv("PORTAL_ORIGIN", "not-a-url");
    const prisma = { $transaction: vi.fn() };
    const service = new StudentAccountService(prisma as never);

    await expect(
      service.issueCredentials("registrar-1", "student-1", "setup_link"),
    ).rejects.toThrow(/PORTAL_ORIGIN/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
