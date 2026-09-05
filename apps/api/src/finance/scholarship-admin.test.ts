import { describe, expect, it, vi } from "vitest";
import { ScholarshipCatalogRevisionInput } from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { ROLES_KEY } from "../auth/decorators.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { FinanceApprovalsService } from "./finance-approvals.service.js";
import { ScholarshipAdminController } from "./scholarship-admin.controller.js";
import {
  ScholarshipAdminService,
  type ScholarshipCatalogProposal,
} from "./scholarship-admin.service.js";

const ACTOR: AuthUser = {
  personId: "person-bursar",
  email: "bursar@daust.edu.sn",
  roles: ["bursar"],
} as AuthUser;

const APPROVED_SCHEDULE = {
  id: "schedule-1",
  academicYearLabel: "2026-2027",
  revision: 3,
  status: "approved",
  approvedAt: new Date("2026-08-01T00:00:00.000Z"),
  scholarships: [],
};

function meritBien() {
  return {
    key: "merit_bien",
    label: "Mention Bien",
    description: "Merit award",
    basis: "tuition" as const,
    rateMode: "fixed" as const,
    pctBps: 1_500,
    costCenterCode: "9100",
    active: true,
    sortOrder: 0,
  };
}

function socialHelp() {
  return {
    key: "social_help",
    label: "Social help",
    description: "Case by case",
    basis: "tuition" as const,
    rateMode: "per_student" as const,
    costCenterCode: "9100",
    active: true,
    sortOrder: 1,
  };
}

function buildService() {
  const request = vi.fn(async () => ({ ok: true, id: "approval-1" }));
  const prisma = {
    academicYear: { findFirst: vi.fn(async () => ({ label: "2026-2027" })) },
    feeSchedule: { findFirst: vi.fn(async () => APPROVED_SCHEDULE) },
    costCenter: { findMany: vi.fn(async () => [{ code: "9100" }]) },
  } as unknown as PrismaService;
  const approvals = { request } as unknown as FinanceApprovalsService;
  return {
    service: new ScholarshipAdminService(prisma, approvals),
    prisma,
    request,
  };
}

function propose(
  scholarships: ScholarshipCatalogProposal["scholarships"],
): ScholarshipCatalogProposal {
  return { reason: "Load the August 2026 workbook", scholarships };
}

describe("scholarship catalog validation", () => {
  it("rejects a fixed award that carries no rate", async () => {
    const { service } = buildService();
    const { pctBps: _dropped, ...noRate } = meritBien();
    await expect(
      service.proposeCatalog(ACTOR, propose([noRate])),
    ).rejects.toThrow(/exactly one of pctBps or flatXof/);
  });

  it("rejects a fixed award that carries both a percentage and a flat amount", async () => {
    const { service } = buildService();
    await expect(
      service.proposeCatalog(
        ACTOR,
        propose([{ ...meritBien(), flatXof: 250_000 }]),
      ),
    ).rejects.toThrow(/exactly one of pctBps or flatXof/);
  });

  it("rejects a per-student award that carries a catalog rate", async () => {
    const { service } = buildService();
    await expect(
      service.proposeCatalog(
        ACTOR,
        propose([{ ...socialHelp(), pctBps: 2_000 }]),
      ),
    ).rejects.toThrow(/belongs on the award/);
  });

  it("rejects a duplicate key", async () => {
    const { service } = buildService();
    await expect(
      service.proposeCatalog(
        ACTOR,
        propose([meritBien(), { ...meritBien(), label: "Copy" }]),
      ),
    ).rejects.toThrow(/Duplicate scholarship merit_bien/);
  });

  it("rejects a cost center that is not in the chart of accounts", async () => {
    const { service } = buildService();
    await expect(
      service.proposeCatalog(
        ACTOR,
        propose([{ ...meritBien(), costCenterCode: "0000" }]),
      ),
    ).rejects.toThrow(/Unknown cost center 0000/);
  });

  it("files a valid catalog against the approved schedule as a fee-schedule revision", async () => {
    const { service, request } = buildService();
    const result = await service.proposeCatalog(
      ACTOR,
      propose([meritBien(), socialHelp()]),
    );
    expect(request).toHaveBeenCalledTimes(1);
    const change = request.mock.calls[0]![1];
    expect(change).toMatchObject({
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: "schedule-1",
      academicYearLabel: "2026-2027",
    });
    expect(change.after.scholarships).toHaveLength(2);
    expect(result.approvalKind).toBe("global_fee_schedule");
  });

  it("never writes the schedule directly", async () => {
    const { service, prisma } = buildService();
    await service.proposeCatalog(ACTOR, propose([meritBien()]));
    expect(
      (prisma.feeSchedule as unknown as Record<string, unknown>).create,
    ).toBeUndefined();
    expect(
      (prisma.feeSchedule as unknown as Record<string, unknown>).update,
    ).toBeUndefined();
  });
});

describe("scholarship catalog contract", () => {
  it("refuses a fixed award with no rate before it reaches the service", () => {
    const { pctBps: _dropped, ...noRate } = meritBien();
    const parsed = ScholarshipCatalogRevisionInput.safeParse({
      reason: "test",
      scholarships: [noRate],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a per-student award carrying a rate", () => {
    const parsed = ScholarshipCatalogRevisionInput.safeParse({
      reason: "test",
      scholarships: [{ ...socialHelp(), flatXof: 100_000 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an unknown field rather than dropping it silently", () => {
    const parsed = ScholarshipCatalogRevisionInput.safeParse({
      reason: "test",
      scholarships: [{ ...meritBien(), amountXof: 5_000 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a key that is not a lowercase identifier", () => {
    const parsed = ScholarshipCatalogRevisionInput.safeParse({
      reason: "test",
      scholarships: [{ ...meritBien(), key: "Merit Bien" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("holds a percentage inside 1..10000 basis points", () => {
    for (const pctBps of [0, 10_001, 1.5]) {
      const parsed = ScholarshipCatalogRevisionInput.safeParse({
        reason: "test",
        scholarships: [{ ...meritBien(), pctBps }],
      });
      expect(parsed.success).toBe(false);
    }
  });
});

describe("scholarship catalog authorization metadata", () => {
  it("keeps the catalog inside Finance on every route", () => {
    expect(Reflect.getMetadata(ROLES_KEY, ScholarshipAdminController)).toEqual([
      "bursar",
      "admin",
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ScholarshipAdminController.prototype.list),
    ).toEqual(["bursar", "admin"]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ScholarshipAdminController.prototype.propose,
      ),
    ).toEqual(["bursar", "admin"]);
  });
});
