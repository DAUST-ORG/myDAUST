import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AuthUser } from "../auth/current-user.js";
import { AcademicsController } from "./academics.controller.js";

const registrar: AuthUser = {
  personId: "registrar-1",
  roles: ["registrar"],
  email: "registrar@daust.edu",
  name: "Registrar",
};

const course = {
  code: "ENGR 51011",
  title: "Internship & Co-Ops - Thesis",
  credits: 30,
  departmentId: "engineering",
};

describe("course credit input validation", () => {
  it("accepts an official 30-credit course on create", () => {
    const adminCreateCourse = vi.fn();
    const controller = new AcademicsController({ adminCreateCourse } as never);

    controller.createCourse(registrar, course);

    expect(adminCreateCourse).toHaveBeenCalledWith("registrar-1", course);
  });

  it("accepts an official 30-credit course on update", () => {
    const updateCourse = vi.fn();
    const controller = new AcademicsController({ updateCourse } as never);

    controller.updateCourse(registrar, course.code, { credits: 30 });

    expect(updateCourse).toHaveBeenCalledWith("registrar-1", course.code, {
      credits: 30,
    });
  });

  it("continues to reject course creation above 30 credits", () => {
    const adminCreateCourse = vi.fn();
    const controller = new AcademicsController({ adminCreateCourse } as never);

    expect(() =>
      controller.createCourse(registrar, { ...course, credits: 31 }),
    ).toThrow(ZodError);
    expect(adminCreateCourse).not.toHaveBeenCalled();
  });

  it("continues to reject non-integer and out-of-range course updates", () => {
    const updateCourse = vi.fn();
    const controller = new AcademicsController({ updateCourse } as never);

    for (const credits of [0, 3.5, 31]) {
      expect(() =>
        controller.updateCourse(registrar, course.code, { credits }),
      ).toThrow(ZodError);
    }
    expect(updateCourse).not.toHaveBeenCalled();
  });
});
