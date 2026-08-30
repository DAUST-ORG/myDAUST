import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ROLES_KEY } from "../auth/decorators.js";
import { ApplicantNotesController } from "./applicant-notes.controller.js";
import { ApplicantNotesService } from "./applicant-notes.service.js";

describe("ApplicantNotesController role gate", () => {
  it("declares admin and admissions roles on the controller class", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ApplicantNotesController),
    ).toEqual(["admin", "admissions"]);
  });

  it("rejects an unknown note kind", () => {
    const notes = { create: vi.fn() };
    const controller = new ApplicantNotesController(notes as never);
    const actor = { personId: "p1", roles: ["admissions"] } as never;
    expect(() =>
      controller.create(actor, "app-1", {
        kind: "nope" as never,
        body: "hello",
      }),
    ).toThrow();
    expect(notes.create).not.toHaveBeenCalled();
  });

  it("requires a non-empty body", () => {
    const notes = { create: vi.fn() };
    const controller = new ApplicantNotesController(notes as never);
    const actor = { personId: "p1", roles: ["admissions"] } as never;
    expect(() =>
      controller.create(actor, "app-1", { body: "  " }),
    ).toThrow();
    expect(notes.create).not.toHaveBeenCalled();
  });

  it("requires at least one field on update", () => {
    const notes = { update: vi.fn() };
    const controller = new ApplicantNotesController(notes as never);
    const actor = { personId: "p1", roles: ["admissions"] } as never;
    expect(() => controller.update(actor, "app-1", "n1", {})).toThrow();
    expect(notes.update).not.toHaveBeenCalled();
  });
});

describe("ApplicantNotesService authorisation", () => {
  function makePrisma(note: {
    id: string;
    applicantId: string;
    authorId: string;
    kind: string;
  }) {
    const findUnique = vi.fn().mockResolvedValue(note);
    const noteUpdate = vi.fn().mockResolvedValue({ id: note.id });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      admissionNote: { update: noteUpdate },
      auditLog: { create: auditCreate },
    };
    const $transaction = vi.fn().mockImplementation(async (fn) => fn(tx));
    return {
      prisma: {
        admissionNote: { findUnique },
        auditLog: { create: auditCreate },
        $transaction,
      },
      noteUpdate,
      auditCreate,
    };
  }

  it("lets the original author edit their own note", async () => {
    const { prisma, noteUpdate, auditCreate } = makePrisma({
      id: "n1",
      applicantId: "app-1",
      authorId: "p1",
      kind: "general",
    });
    const svc = new ApplicantNotesService(prisma as unknown as PrismaService);
    await svc.update("p1", false, "app-1", "n1", { body: "new body" });
    expect(noteUpdate).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("blocks an admissions user from editing someone else's note", async () => {
    const { prisma, noteUpdate } = makePrisma({
      id: "n1",
      applicantId: "app-1",
      authorId: "p2",
      kind: "general",
    });
    const svc = new ApplicantNotesService(prisma as unknown as PrismaService);
    await expect(
      svc.update("p1", false, "app-1", "n1", { body: "x" }),
    ).rejects.toThrow(/Only the author or an admin/);
    expect(noteUpdate).not.toHaveBeenCalled();
  });

  it("lets an admin edit any note", async () => {
    const { prisma, noteUpdate } = makePrisma({
      id: "n1",
      applicantId: "app-1",
      authorId: "p2",
      kind: "general",
    });
    const svc = new ApplicantNotesService(prisma as unknown as PrismaService);
    await svc.update("admin-p", true, "app-1", "n1", { body: "edit" });
    expect(noteUpdate).toHaveBeenCalledOnce();
  });
});
