import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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

describe("TranscriptService.generatePdf", () => {
  it("records actor provenance and the exact returned PDF hash", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const tx = {
      student: {
        findUnique: vi.fn(async () => ({
          id: "student-1",
          studentNo: "DAUST/001",
          programId: "program-1",
          catalogYear: "2026–2027",
          catalogYearId: "year-1",
          person: {
            firstName: "Aissatou",
            lastName: "Diallo",
            email: "aissatou@daust.edu",
          },
          program: {
            code: "BSCS",
            name: "Computer Science",
            degree: "B.Sc.",
          },
        })),
      },
      transcriptEntry: {
        findMany: vi.fn(async () => [
          {
            id: "entry-1",
            courseId: "course-1",
            termId: "term-1",
            courseCode: "CS 1000",
            courseTitle: "Introduction to Computing",
            termLabel: "Fall 2026",
            termSortKey: "2026-08-20:Fall 2026",
            grade: "A",
            credits: 6,
            earnedCredits: 6,
            gradePoints: 4,
            countsTowardGpa: true,
            countsTowardCredits: true,
            requirementCategory: "Computer Science",
            source: "approved_enrollment",
          },
        ]),
      },
      enrollment: { findMany: vi.fn(async () => []) },
      academicCatalogRevision: { findMany: vi.fn(async () => []) },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const service = new TranscriptService(prisma as never);
    const actor = {
      personId: "registrar-1",
      roles: ["registrar"],
      email: "registrar@daust.edu",
      name: "Registrar User",
    } as never;

    const pdf = await service.generatePdf(actor, "student-1", "staff");
    const expectedHash = createHash("sha256").update(pdf.data).digest("hex");

    expect(pdf.fileName).toBe("unofficial-transcript-DAUST-001.pdf");
    expect(pdf.sha256).toBe(expectedHash);
    expect(pdf.pageCount).toBe(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "TranscriptGeneration",
        entityId: pdf.generationId,
        action: "pdf-generated",
        actorId: "registrar-1",
        data: expect.objectContaining({
          studentId: "student-1",
          sha256: expectedHash,
          watermark: "UNOFFICIAL · STAFF-GENERATED",
          generation: expect.objectContaining({
            generator: expect.objectContaining({
              email: "registrar@daust.edu",
              role: "registrar",
              kind: "staff",
            }),
          }),
        }),
      }),
    });
  });
});

describe("TranscriptService.view", () => {
  it("reads only active ledger rows and preserves null GPA for non-GPA work", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "entry-pass",
        courseId: "course-pass",
        termId: "term-1",
        courseCode: "HSS 1000",
        courseTitle: "Community Engagement",
        termLabel: "Fall 2026",
        termSortKey: "2026-08-20:Fall 2026",
        grade: "P",
        credits: 3,
        earnedCredits: 3,
        gradePoints: null,
        countsTowardGpa: false,
        countsTowardCredits: true,
        requirementCategory: "Humanities",
        source: "manual",
      },
    ]);
    const tx = {
      student: {
        findUnique: vi.fn(async () => ({
          id: "student-1",
          studentNo: "DAUST-001",
          programId: null,
          catalogYear: null,
          catalogYearId: null,
          person: {
            firstName: "Aissatou",
            lastName: "Diallo",
            email: "aissatou@daust.edu",
          },
          program: null,
        })),
      },
      transcriptEntry: { findMany },
      enrollment: { findMany: vi.fn(async () => []) },
      academicCatalogRevision: { findMany: vi.fn(async () => []) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const service = new TranscriptService(prisma as never);

    const view = await service.view("student-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "student-1", voidedAt: null },
      }),
    );
    expect(view.totals).toMatchObject({
      attemptedCredits: 3,
      earnedCredits: 3,
      gpaCredits: 0,
      gpa: null,
    });
    expect(view.semesters[0]?.gpa).toBeNull();
  });
});
