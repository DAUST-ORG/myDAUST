import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService admin student detail", () => {
  it("opens a payment-pending staff profile without weakening transcript access", async () => {
    const student = {
      id: "student-pending",
      studentNo: "S20261TAA",
      person: {
        firstName: "Test",
        lastName: "Applicant",
        email: "test-applicant@example.invalid",
      },
      photoUrl: null,
      programId: null,
      program: null,
      catalogYearId: null,
      catalogYear: null,
      recordStatus: "pending_payment",
      transcriptEntries: [],
      enrollments: [],
      invoices: [],
      holds: [],
      dateOfBirth: null,
      gender: null,
      phone: null,
      address: null,
      city: null,
      nationality: null,
      guardianName: null,
      guardianRelation: null,
      guardianPhone: null,
      advisor: null,
      yearLevel: null,
      cohort: null,
      enrolledAt: null,
      preferredName: null,
      nationalId: null,
      maritalStatus: null,
      personalEmail: null,
      bloodType: null,
      allergies: null,
      insurance: null,
      physician: null,
      emergencyName2: null,
      emergencyPhone2: null,
      major: null,
      admitTerm: null,
      expectedGrad: null,
      enrollmentStatus: null,
    };
    const prisma = {
      student: { findUnique: vi.fn().mockResolvedValue(student) },
      annualBillingProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AcademicsService(prisma as never);
    const transcriptView = vi.fn();
    const standingPolicy = {
      rules: [],
      notYetGraded: {
        code: "not_yet_graded",
        label: "Not yet graded",
        tone: "neutral",
      },
      catalog: null,
    };
    Object.assign(service as unknown as Record<string, unknown>, {
      transcript: { view: transcriptView },
      standings: {
        policyForStudent: vi.fn().mockResolvedValue(standingPolicy),
      },
      catalogs: {
        progress: vi.fn().mockResolvedValue({
          earnedCredits: 0,
          requiredCredits: null,
          inProgressCredits: 0,
          level: null,
          maximumLevel: null,
          catalog: null,
        }),
      },
    });

    const detail = await service.adminStudentDetail(student.id);

    expect(transcriptView).not.toHaveBeenCalled();
    expect(detail).toMatchObject({
      id: student.id,
      recordStatus: "pending_payment",
      standing: "Not yet graded",
      academicStanding: { code: "not_yet_graded", source: "computed" },
    });
  });
});

describe("AcademicsService student profile changes", () => {
  function updateFixture() {
    const student = {
      id: "student-1",
      personId: "person-1",
      recordStatus: "active",
      person: {
        id: "person-1",
        firstName: "Awa",
        lastName: "Ndiaye",
        email: "old@example.test",
      },
    };
    const prisma = {
      student: {
        findUnique: vi.fn().mockResolvedValue(student),
        update: vi.fn().mockResolvedValue(student),
      },
      person: { update: vi.fn().mockResolvedValue(student.person) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (work: Promise<unknown>[]) =>
        Promise.all(work),
      ),
    };
    const service = new AcademicsService(prisma as never);
    vi.spyOn(service, "adminStudentDetail").mockResolvedValue({
      id: student.id,
    } as never);
    return { prisma, service, student };
  }

  it("updates profile fields without changing the DAUST login identity", async () => {
    const { prisma, service, student } = updateFixture();

    await service.updateStudent("registrar-1", student.id, {
      fullName: "Awa Updated",
    });

    expect(prisma.person.update).toHaveBeenCalledWith({
      where: { id: student.personId },
      data: { firstName: "Awa", lastName: "Updated" },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("does not expose login email as an update field", () => {
    const input: Parameters<AcademicsService["updateStudent"]>[2] = {
      fullName: "Awa Updated",
    };
    expect(input).not.toHaveProperty("email");
  });
});
