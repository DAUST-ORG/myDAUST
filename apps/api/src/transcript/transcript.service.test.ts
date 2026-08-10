import { describe, expect, it, vi } from "vitest";
import { TranscriptService } from "./transcript.service.js";

describe("TranscriptService.update", () => {
  it("preserves a custom earned-credit value when unchanged credits are sent", async () => {
    const existing = {
      id: "entry-1",
      studentId: "student-1",
      source: "manual",
      sourceKey: null,
      importBatchId: null,
      importRowNumber: null,
      gradeSubmissionItemId: null,
      enrollmentId: null,
      courseId: null,
      termId: null,
      courseCode: "CS 1000",
      courseTitle: "Original title",
      termLabel: "Fall 2025",
      termSortKey: null,
      grade: "P",
      credits: 6,
      earnedCredits: 3,
      gradePoints: null,
      countsTowardGpa: false,
      countsTowardCredits: true,
      requirementCategory: null,
      note: null,
      createdById: null,
      updatedById: null,
      voidedById: null,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      voidedAt: null,
      voidReason: null,
    };
    const update = vi.fn(async ({ data }) => ({ ...existing, ...data }));
    const auditCreate = vi.fn(async () => ({}));
    const tx = {
      transcriptEntry: { update },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      transcriptEntry: { findUnique: vi.fn(async () => existing) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const service = new TranscriptService(prisma as never);

    await service.update("actor-1", "entry-1", {
      courseTitle: "Corrected title",
      credits: 6,
      reason: "Correct the displayed title",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ earnedCredits: 3 }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});
