import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import {
  RegistrarTranscriptController,
  StudentTranscriptController,
} from "./transcript.controller.js";

describe("transcript controller authorization and provenance", () => {
  it("keeps student transcript routes student-only", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        StudentTranscriptController.prototype.transcriptForStudent,
      ),
    ).toEqual(["student"]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        StudentTranscriptController.prototype.transcriptViewForStudent,
      ),
    ).toEqual(["student"]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        StudentTranscriptController.prototype.transcriptPdfForStudent,
      ),
    ).toEqual(["student"]);
  });

  it("keeps registrar transcript routes restricted to registrar and admin", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, RegistrarTranscriptController),
    ).toEqual(["admin", "registrar"]);
  });

  it("preserves the row-list endpoint and passes the authenticated student to PDF generation", async () => {
    const transcript = {
      list: vi.fn(async () => [{ id: "entry-1" }]),
      generatePdf: vi.fn(async () => ({
        data: Buffer.from("pdf"),
        fileName: "unofficial-transcript-DAUST-001.pdf",
      })),
    };
    const controller = new StudentTranscriptController(transcript as never);
    const actor = {
      personId: "person-1",
      studentId: "student-1",
      roles: ["student"],
      email: "student@daust.edu",
      name: "Student User",
    } as never;

    await controller.transcriptForStudent(actor);
    await controller.transcriptPdfForStudent(actor);

    expect(transcript.list).toHaveBeenCalledWith("student-1");
    expect(transcript.generatePdf).toHaveBeenCalledWith(
      actor,
      "student-1",
      "student",
    );
  });

  it("marks registrar/admin downloads as staff-generated", async () => {
    const transcript = {
      generatePdf: vi.fn(async () => ({
        data: Buffer.from("pdf"),
        fileName: "unofficial-transcript-DAUST-001.pdf",
      })),
    };
    const controller = new RegistrarTranscriptController(transcript as never);
    const actor = {
      personId: "admin-1",
      roles: ["admin"],
      email: "admin@daust.edu",
      name: "Admin User",
    } as never;

    await controller.pdf(actor, "student-1");

    expect(transcript.generatePdf).toHaveBeenCalledWith(
      actor,
      "student-1",
      "staff",
    );
  });
});
