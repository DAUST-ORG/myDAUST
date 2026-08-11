import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("registrar dashboard hold count", () => {
  it("counts distinct active StudentHold accounts instead of balances", async () => {
    const heldStudents = [
      { studentId: "student-1" },
      { studentId: "student-2" },
    ];
    const findMany = vi.fn().mockResolvedValue(heldStudents);
    const prisma = {
      student: { count: vi.fn().mockResolvedValue(5) },
      enrollment: { count: vi.fn().mockResolvedValue(8) },
      program: { findMany: vi.fn().mockResolvedValue([]) },
      applicant: { count: vi.fn().mockResolvedValue(1) },
      studentHold: { findMany },
    };

    const result = await new AcademicsService(prisma as never).adminStats();

    expect(result.holdsCount).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true, student: { recordStatus: "active" } },
      distinct: ["studentId"],
      select: { studentId: true },
    });
  });
});
