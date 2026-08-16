import { describe, expect, it } from "vitest";
import { createPaymentGatedAcceptanceInTransaction } from "./payment-gated-acceptance.js";

describe("createPaymentGatedAcceptanceInTransaction", () => {
  it("fails before database access when normal acceptance tries to suppress the status capability", async () => {
    await expect(
      createPaymentGatedAcceptanceInTransaction({} as never, {
        applicantId: "applicant-1",
        actorId: "actor-1",
        academicYearId: "academic-year-1",
        studentNo: "S202631AD",
        studentNoSource: "generated",
        statusCapabilityPolicy: "suppress",
      }),
    ).rejects.toThrow(
      "Applicant status capabilities can only be suppressed for a reviewed legacy acceptance",
    );
  });
});
