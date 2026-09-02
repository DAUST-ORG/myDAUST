import { describe, expect, it, vi } from "vitest";
import { RegistrarService } from "./registrar.service.js";

const term = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fall 2026",
  status: "planning",
  semester: "Fall",
  academicYearId: "year-1",
  startDate: new Date("2026-09-07T00:00:00.000Z"),
  endDate: new Date("2026-12-18T00:00:00.000Z"),
  addDeadline: new Date("2026-09-21T00:00:00.000Z"),
  dropDeadline: new Date("2026-10-05T00:00:00.000Z"),
  academicYear: { label: "2026-2027" },
};

describe("RegistrarService registration configuration", () => {
  it("reports an absent row as legacy behavior with recommendations off", async () => {
    const service = new RegistrarService({
      appSetting: { findUnique: vi.fn(async () => null) },
    } as never);

    await expect(service.registrationConfiguration()).resolves.toEqual({
      configured: false,
      termId: null,
      recommendationsEnabled: false,
      term: null,
    });
  });

  it("returns the complete designated term metadata", async () => {
    const service = new RegistrarService({
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: {
            termId: term.id,
            recommendationsEnabled: true,
          },
        })),
      },
      term: { findUnique: vi.fn(async () => term) },
    } as never);

    await expect(service.registrationConfiguration()).resolves.toMatchObject({
      configured: true,
      termId: term.id,
      recommendationsEnabled: true,
      term: {
        id: term.id,
        name: "Fall 2026",
        status: "planning",
        semester: "Fall",
        academicYearId: "year-1",
        academicYearLabel: "2026-2027",
      },
    });
  });

  it("fails closed when a saved term id is dangling", async () => {
    const service = new RegistrarService({
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: {
            termId: term.id,
            recommendationsEnabled: true,
          },
        })),
      },
      term: { findUnique: vi.fn(async () => null) },
    } as never);

    await expect(service.registrationConfiguration()).rejects.toThrow(
      /designated registration term no longer exists/i,
    );
  });

  it("persists explicit closure and audits the reason in the same transaction", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: { termId: term.id, recommendationsEnabled: true },
        })),
        upsert: vi.fn(async () => ({})),
      },
      term: { findUnique: vi.fn() },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const service = new RegistrarService(prisma as never);

    await expect(
      service.updateRegistrationConfiguration("registrar-1", {
        termId: null,
        recommendationsEnabled: false,
        reason: "Close between registration periods",
      }),
    ).resolves.toEqual({
      configured: true,
      termId: null,
      recommendationsEnabled: false,
      term: null,
    });
    expect(tx.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "academics.registration" },
      create: {
        key: "academics.registration",
        valueJson: { termId: null, recommendationsEnabled: false },
      },
      update: {
        valueJson: { termId: null, recommendationsEnabled: false },
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[0]?.[0].join(" ")).toContain(
      "pg_advisory_xact_lock",
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.appSetting.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "AppSetting",
        entityId: "academics.registration",
        action: "registration-configuration-updated",
        actorId: "registrar-1",
        data: expect.objectContaining({
          reason: "Close between registration periods",
          current: { termId: null, recommendationsEnabled: false },
        }),
      }),
    });
  });

  it.each([
    {
      label: "academic year",
      term: { ...term, academicYearId: null, academicYear: null },
    },
    {
      label: "supported semester",
      term: { ...term, semester: "Annual" },
    },
  ])("rejects recommendation enablement without a $label", async ({ term }) => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      appSetting: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
      },
      term: { findUnique: vi.fn(async () => term) },
      auditLog: { create: vi.fn() },
    };
    const service = new RegistrarService({
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    } as never);

    await expect(
      service.updateRegistrationConfiguration("registrar-1", {
        termId: term.id,
        recommendationsEnabled: true,
        reason: "Enable recommendations for registration",
      }),
    ).rejects.toThrow(/academic year.*Fall, Spring, or Summer/i);
    expect(tx.appSetting.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
