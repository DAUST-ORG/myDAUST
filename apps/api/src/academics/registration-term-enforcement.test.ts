import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

const designatedTermId = "11111111-1111-4111-8111-111111111111";
const otherTermId = "22222222-2222-4222-8222-222222222222";

function serviceWithConfiguration(
  valueJson: unknown,
  sectionTermId = designatedTermId,
) {
  const tx = {
    $queryRaw: vi.fn(async () => [
      {
        id: "section-1",
        capacity: 30,
        courseId: "course-1",
        termId: sectionTermId,
      },
    ]),
    appSetting: {
      findUnique: vi.fn(async () =>
        valueJson === undefined ? null : { valueJson },
      ),
    },
    term: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: sectionTermId,
        name: "Ended term",
        endDate: new Date("2000-01-01T00:00:00.000Z"),
        addDeadline: null,
      })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  return { service: new AcademicsService(prisma as never), tx };
}

describe("AcademicsService.enroll designated-term enforcement", () => {
  it("blocks every self-service enrollment after an explicit close", async () => {
    const { service, tx } = serviceWithConfiguration({
      termId: null,
      recommendationsEnabled: false,
    });

    await expect(service.enroll("student-1", "section-1")).rejects.toThrow(
      /registration is closed/i,
    );
    expect(tx.term.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$queryRaw.mock.calls[0]?.[0].join(" ")).toContain(
      "pg_advisory_xact_lock_shared",
    );
    expect(tx.$queryRaw.mock.calls[1]?.[0].join(" ")).toContain("FOR UPDATE");
    expect(tx.$queryRaw.mock.calls[2]?.[0].join(" ")).toContain(
      'FROM "Student"',
    );
  });

  it("blocks a section outside the configured term", async () => {
    const { service, tx } = serviceWithConfiguration(
      { termId: designatedTermId, recommendationsEnabled: true },
      otherTermId,
    );

    await expect(service.enroll("student-1", "section-1")).rejects.toThrow(
      /not in the designated/i,
    );
    expect(tx.term.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("fails closed on malformed persisted JSON", async () => {
    const { service, tx } = serviceWithConfiguration({ termId: 42 });

    await expect(service.enroll("student-1", "section-1")).rejects.toThrow(
      /configuration is invalid/i,
    );
    expect(tx.term.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("preserves the legacy gate sequence while the setting is absent", async () => {
    const { service, tx } = serviceWithConfiguration(undefined);

    await expect(service.enroll("student-1", "section-1")).rejects.toThrow(
      /registration is closed for this term/i,
    );
    expect(tx.term.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: designatedTermId },
    });
  });
});
