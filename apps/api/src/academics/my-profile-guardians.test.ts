import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService.myProfile guardian links", () => {
  it("returns only the signed-in student's linked guardian contact fields", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      studentNo: "S2026001",
      recordStatus: "active",
      person: {
        firstName: "Student",
        lastName: "Example",
        email: "student@mydaust.org",
      },
      program: null,
      guardians: [
        {
          relation: "Mother",
          guardian: {
            firstName: "Aminata",
            lastName: "Example",
            email: "aminata@example.com",
            guardianProfile: { phone: "+221770000000" },
          },
        },
        {
          relation: null,
          guardian: {
            firstName: "Moussa",
            lastName: "Example",
            email: "moussa@example.com",
            guardianProfile: null,
          },
        },
      ],
      piSpiAlias: null,
    });
    const service = new AcademicsService({
      student: { findUnique },
    } as never);
    Object.assign(service as unknown as Record<string, unknown>, {
      transcript: {
        view: vi.fn().mockResolvedValue({
          totals: { gpa: 3.25, earnedCredits: 60 },
          academicProgress: {},
          academicStanding: { label: "Good Standing" },
        }),
      },
    });

    const profile = await service.myProfile("student-1");

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      include: {
        person: true,
        program: true,
        guardians: {
          orderBy: { createdAt: "asc" },
          select: {
            relation: true,
            guardian: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                guardianProfile: { select: { phone: true } },
              },
            },
          },
        },
      },
    });
    expect(profile.guardians).toEqual([
      {
        name: "Aminata Example",
        relation: "Mother",
        email: "aminata@example.com",
        phone: "+221770000000",
      },
      {
        name: "Moussa Example",
        relation: null,
        email: "moussa@example.com",
        phone: null,
      },
    ]);
    expect(profile.guardians[0]).not.toHaveProperty("address");
    expect(profile.guardians[0]).not.toHaveProperty("hasLogin");
  });
});
