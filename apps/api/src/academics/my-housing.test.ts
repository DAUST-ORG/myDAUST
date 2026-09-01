import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService.myHousing operational assignment", () => {
  it.each(["pending", "unassigned"])(
    "does not expose a %s housing row as an active room assignment",
    async (status) => {
      const findMany = vi.fn();
      const service = new AcademicsService({
        housingAssignment: {
          findFirst: vi.fn().mockResolvedValue({
            studentId: "student-1",
            academicYearLabel: "2026–2027",
            hallId: "hall-1",
            room: "A-101",
            status,
            hall: { name: "Teranga", kind: "Double" },
          }),
          findMany,
        },
      } as never);

      await expect(service.myHousing("student-1")).resolves.toEqual({
        assigned: false,
      });
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it("includes only operationally assigned students as roommates", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new AcademicsService({
      housingAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          studentId: "student-1",
          academicYearLabel: "2026–2027",
          hallId: "hall-1",
          room: "A-101",
          status: "assigned",
          note: null,
          hall: { name: "Teranga", kind: "Double" },
        }),
        findMany,
      },
    } as never);

    await expect(service.myHousing("student-1")).resolves.toMatchObject({
      assigned: true,
      building: "Teranga",
      room: "A-101",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "assigned" }),
      }),
    );
  });
});
