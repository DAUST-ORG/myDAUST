import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  AcademicsService,
  normalizeMaterialFolderName,
} from "./academics.service.js";

function ownedService(prisma: unknown) {
  const service = new AcademicsService(prisma as never);
  vi.spyOn(
    service as unknown as { assertSectionOwner: () => Promise<void> },
    "assertSectionOwner",
  ).mockResolvedValue();
  return service;
}

describe("course material folder names", () => {
  it("normalizes compatibility characters, spacing, and case", () => {
    expect(normalizeMaterialFolderName("  Week  １  ")).toEqual({
      name: "Week 1",
      normalizedName: "week 1",
    });
  });

  it.each(["", "../private", "week\\one", "week\u0000one", "x".repeat(81)])(
    "rejects an unsafe folder name: %j",
    (name) => {
      expect(() => normalizeMaterialFolderName(name)).toThrow(
        BadRequestException,
      );
    },
  );

  it("accepts the 80-character boundary", () => {
    const name = "x".repeat(80);
    expect(normalizeMaterialFolderName(name)).toEqual({
      name,
      normalizedName: name,
    });
  });
});

describe("AcademicsService material folders", () => {
  it("keeps folder creation and its audit record in one transaction", async () => {
    const folder = {
      id: "folder-1",
      sectionId: "section-1",
      category: "lecture_notes",
      name: "Week 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      sectionMaterialFolder: { create: vi.fn().mockResolvedValue(folder) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const created = await ownedService(prisma).createSectionMaterialFolder(
      "section-1",
      { category: "lecture_notes", name: " Week  1 " },
      "faculty-1",
      false,
    );

    expect(created).toEqual(folder);
    expect(tx.sectionMaterialFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sectionId: "section-1",
          name: "Week 1",
          normalizedName: "week 1",
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "SectionMaterialFolder",
          entityId: "folder-1",
          action: "created",
        }),
      }),
    );
  });

  it("maps normalized-name uniqueness conflicts to a useful API conflict", async () => {
    const tx = {
      sectionMaterialFolder: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).createSectionMaterialFolder(
        "section-1",
        { category: "lecture_notes", name: "WEEK 1" },
        "faculty-1",
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("renames a folder and writes the before/after audit atomically", async () => {
    const existing = {
      id: "folder-1",
      sectionId: "section-1",
      category: "lecture_notes",
      name: "Week 1",
      normalizedName: "week 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const renamed = {
      ...existing,
      name: "Week 2",
      normalizedName: "week 2",
    };
    const tx = {
      sectionMaterialFolder: { update: vi.fn().mockResolvedValue(renamed) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).renameSectionMaterialFolder(
        "folder-1",
        " Week 2 ",
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(renamed);
    expect(tx.sectionMaterialFolder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Week 2", normalizedName: "week 2" },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "renamed",
          data: {
            before: { name: "Week 1" },
            after: { name: "Week 2" },
          },
        }),
      }),
    );
  });

  it("returns a stable public response for a rename that changes nothing", async () => {
    const existing = {
      id: "folder-1",
      sectionId: "section-1",
      category: "lecture_notes",
      name: "Week 1",
      normalizedName: "week 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      sectionMaterialFolder: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(),
    };

    const result = await ownedService(prisma).renameSectionMaterialFolder(
      "folder-1",
      "Week 1",
      "faculty-1",
      false,
    );

    expect(result).toEqual({
      id: "folder-1",
      sectionId: "section-1",
      category: "lecture_notes",
      name: "Week 1",
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });
    expect(result).not.toHaveProperty("normalizedName");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deleting a folder unfiles its materials instead of deleting them", async () => {
    const folder = {
      id: "folder-1",
      sectionId: "section-1",
      category: "lecture_notes",
      name: "Week 1",
      normalizedName: "week 1",
    };
    const tx = {
      sectionMaterial: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      sectionMaterialFolder: { delete: vi.fn().mockResolvedValue(folder) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      sectionMaterialFolder: { findUnique: vi.fn().mockResolvedValue(folder) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).deleteSectionMaterialFolder(
        "folder-1",
        "faculty-1",
        false,
      ),
    ).resolves.toEqual({ ok: true, unfiledMaterialCount: 2 });
    expect(tx.sectionMaterial.updateMany).toHaveBeenCalledWith({
      where: { folderId: "folder-1" },
      data: { folderId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects moving a material into another category", async () => {
    const prisma = {
      sectionMaterial: {
        findUnique: vi.fn().mockResolvedValue({
          id: "material-1",
          sectionId: "section-1",
          category: "lecture_notes",
          folderId: null,
        }),
      },
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue({
          sectionId: "section-1",
          category: "assignments",
        }),
      },
      $transaction: vi.fn(),
    };

    await expect(
      ownedService(prisma).moveSectionMaterial(
        "material-1",
        "folder-1",
        "faculty-1",
        false,
      ),
    ).rejects.toThrow("must belong to this section and category");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects moving a material into another section", async () => {
    const prisma = {
      sectionMaterial: {
        findUnique: vi.fn().mockResolvedValue({
          id: "material-1",
          sectionId: "section-1",
          category: "lecture_notes",
          folderId: null,
        }),
      },
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue({
          sectionId: "section-2",
          category: "lecture_notes",
        }),
      },
      $transaction: vi.fn(),
    };

    await expect(
      ownedService(prisma).moveSectionMaterial(
        "material-1",
        "folder-1",
        "faculty-1",
        false,
      ),
    ).rejects.toThrow("must belong to this section and category");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("moves a material to the end of its folder and audits atomically", async () => {
    const material = {
      id: "material-1",
      sectionId: "section-1",
      category: "lecture_notes",
      folderId: null,
    };
    const updated = { ...material, folderId: "folder-1", sortOrder: 3 };
    const tx = {
      sectionMaterial: {
        findFirst: vi.fn().mockResolvedValue({ sortOrder: 2 }),
        update: vi.fn().mockResolvedValue(updated),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      sectionMaterial: { findUnique: vi.fn().mockResolvedValue(material) },
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue({
          sectionId: "section-1",
          category: "lecture_notes",
        }),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).moveSectionMaterial(
        "material-1",
        "folder-1",
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(updated);
    expect(tx.sectionMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { folderId: "folder-1", sortOrder: 3 },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "moved-folder" }),
      }),
    );
  });

  it("moves a material back to Unfiled and audits atomically", async () => {
    const material = {
      id: "material-1",
      sectionId: "section-1",
      category: "lecture_notes",
      folderId: "folder-1",
    };
    const updated = { ...material, folderId: null, sortOrder: 2 };
    const tx = {
      sectionMaterial: {
        findFirst: vi.fn().mockResolvedValue({ sortOrder: 1 }),
        update: vi.fn().mockResolvedValue(updated),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      sectionMaterial: { findUnique: vi.fn().mockResolvedValue(material) },
      sectionMaterialFolder: { findUnique: vi.fn() },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).moveSectionMaterial(
        "material-1",
        null,
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(updated);
    expect(prisma.sectionMaterialFolder.findUnique).not.toHaveBeenCalled();
    expect(tx.sectionMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { folderId: null, sortOrder: 2 } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "moved-folder",
          data: {
            before: { folderId: "folder-1" },
            after: { folderId: null },
          },
        }),
      }),
    );
  });

  it("uploads into a same-category folder and audits the material atomically", async () => {
    const created = {
      id: "material-1",
      sectionId: "section-1",
      category: "lecture_notes",
      folderId: "folder-1",
      sortOrder: 3,
    };
    const tx = {
      sectionMaterial: {
        findFirst: vi.fn().mockResolvedValue({ sortOrder: 2 }),
        create: vi.fn().mockResolvedValue(created),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue({
          sectionId: "section-1",
          category: "lecture_notes",
        }),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      ownedService(prisma).createSectionMaterial(
        "section-1",
        {
          title: "Week 3.pdf",
          kind: "Document",
          category: "lecture_notes",
          folderId: "folder-1",
          fileUrl: "/api/uploads/week-3.pdf",
          fileName: "Week 3.pdf",
        },
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(created);
    expect(tx.sectionMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sectionId: "section-1",
          category: "lecture_notes",
          folderId: "folder-1",
          sortOrder: 3,
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "SectionMaterial",
          action: "created",
        }),
      }),
    );
  });

  it("reorders only the requested folder and includes the audit in the transaction", async () => {
    const reordered = [
      {
        id: "material-2",
        sectionId: "section-1",
        category: "lecture_notes",
        folderId: "folder-1",
        sortOrder: 0,
      },
      {
        id: "material-1",
        sectionId: "section-1",
        category: "lecture_notes",
        folderId: "folder-1",
        sortOrder: 1,
      },
    ];
    const prisma = {
      sectionMaterialFolder: {
        findUnique: vi.fn().mockResolvedValue({
          sectionId: "section-1",
          category: "lecture_notes",
        }),
      },
      sectionMaterial: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "material-1" }, { id: "material-2" }])
          .mockResolvedValueOnce(reordered),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };

    await expect(
      ownedService(prisma).reorderSectionMaterials(
        "section-1",
        "lecture_notes",
        "folder-1",
        ["material-2", "material-1"],
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(reordered);
    expect(prisma.sectionMaterial.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          sectionId: "section-1",
          category: "lecture_notes",
          folderId: "folder-1",
        },
      }),
    );
    expect(prisma.sectionMaterial.update).toHaveBeenNthCalledWith(1, {
      where: { id: "material-2" },
      data: { sortOrder: 0 },
    });
    expect(prisma.sectionMaterial.update).toHaveBeenNthCalledWith(2, {
      where: { id: "material-1" },
      data: { sortOrder: 1 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "materials-reordered",
          data: {
            category: "lecture_notes",
            folderId: "folder-1",
            orderedIds: ["material-2", "material-1"],
          },
        }),
      }),
    );
    expect(prisma.$transaction.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("publishes with its folder response and audit in one transaction", async () => {
    const material = {
      id: "material-1",
      sectionId: "section-1",
      category: "lecture_notes",
      folderId: "folder-1",
      published: false,
    };
    const updated = {
      ...material,
      published: true,
      folder: {
        id: "folder-1",
        name: "Week 1",
        category: "lecture_notes",
      },
    };
    const update = vi.fn().mockResolvedValue(updated);
    const createAudit = vi.fn().mockResolvedValue({});
    const prisma = {
      sectionMaterial: {
        findUnique: vi.fn().mockResolvedValue(material),
        update,
      },
      auditLog: { create: createAudit },
      $transaction: vi.fn().mockResolvedValue([updated, {}]),
    };

    await expect(
      ownedService(prisma).toggleSectionMaterial(
        "material-1",
        "faculty-1",
        false,
      ),
    ).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { id: "material-1" },
      data: { published: true },
      include: {
        folder: { select: { id: true, name: true, category: true } },
      },
    });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "published" }),
      }),
    );
    expect(prisma.$transaction.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("blocks a faculty member who does not own the section", async () => {
    const prisma = {
      section: {
        findUnique: vi.fn().mockResolvedValue({
          id: "section-1",
          instructorId: "faculty-2",
          course: {},
        }),
      },
      sectionMaterialFolder: { findMany: vi.fn() },
    };

    await expect(
      new AcademicsService(prisma as never).listSectionMaterialFolders(
        "section-1",
        "faculty-1",
        false,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.sectionMaterialFolder.findMany).not.toHaveBeenCalled();
  });

  it("returns only published, downloadable materials and their visible folder", async () => {
    const prisma = {
      enrollment: {
        findUnique: vi.fn().mockResolvedValue({ status: "enrolled" }),
      },
      sectionMaterial: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "material-1",
            published: true,
            fileUrl: "/api/uploads/notes.pdf",
            folderId: "folder-1",
            folder: {
              id: "folder-1",
              name: "Week 1",
              category: "lecture_notes",
            },
          },
          {
            id: "material-2",
            published: true,
            fileUrl: null,
            folderId: "folder-empty",
            folder: {
              id: "folder-empty",
              name: "Empty",
              category: "lecture_notes",
            },
          },
        ]),
      },
    };

    const result = await new AcademicsService(
      prisma as never,
    ).studentSectionMaterials("student-1", "section-1");

    expect(result).toEqual([
      expect.objectContaining({
        id: "material-1",
        folder: expect.objectContaining({ name: "Week 1" }),
      }),
    ]);
    expect(prisma.sectionMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sectionId: "section-1", published: true },
      }),
    );
  });
});
