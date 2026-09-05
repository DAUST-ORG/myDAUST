import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";

/**
 * Scholarships hang off the same versioned FeeSchedule as the components, so a
 * catalog edit rides the `global_fee_schedule` approval. These cover the two
 * ways the apply step used to lose that catalog: refusing a scholarships-only
 * payload outright, and dropping the catalog from every revision it recreates.
 */

const SCHEDULE_ID = "schedule-1";

function approvedSchedule() {
  return {
    id: SCHEDULE_ID,
    academicYearLabel: "2026-2027",
    revision: 3,
    status: "approved",
    rows: [
      {
        id: "row-1",
        academicYearLabel: "2026-2027",
        semester: "fall",
        label: "Fall instalment",
        sequence: 1,
        dueOn: new Date("2026-10-01T00:00:00.000Z"),
        amountFullXof: 1_000_000,
        amountTuitionXof: 1_000_000,
        amountHousingXof: 0,
        amountCafeteriaXof: 0,
      },
    ],
    components: [
      {
        id: "component-1",
        key: "tuition",
        label: "Tuition",
        description: null,
        costCenterCode: "9100",
        annualAmountXof: 1_000_000,
        defaultSelected: true,
        sortOrder: 0,
      },
    ],
    scholarships: [
      {
        id: "scholarship-1",
        key: "merit_bien",
        label: "Mention Bien",
        description: "Merit award",
        basis: "tuition",
        rateMode: "fixed",
        pctBps: 1_500,
        flatXof: null,
        costCenterCode: "9100",
        active: true,
        sortOrder: 0,
      },
    ],
  };
}

function buildTx() {
  const created: Record<string, unknown>[] = [];
  const tx = {
    feeSchedule: {
      findFirstOrThrow: vi.fn(async () => approvedSchedule()),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "schedule-2", components: [] };
      }),
      update: vi.fn(async () => ({})),
    },
    costCenter: {
      findMany: vi.fn(
        async ({ where }: { where: { code: { in: string[] } } }) =>
          where.code.in.map((code) => ({ code })),
      ),
    },
    invoice: { findMany: vi.fn(async () => []) },
    feeItem: { upsert: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, created };
}

function applyRevision(after: Record<string, unknown>) {
  const service = new FinanceApprovalsService({} as unknown as PrismaService);
  const { tx, created } = buildTx();
  const request = {
    id: "approval-1",
    kind: "global_fee_schedule",
    academicYearLabel: "2026-2027",
    targetId: SCHEDULE_ID,
    reason: "Load the August 2026 workbook",
    requestedById: "person-bursar",
    baseRevision: 3,
  };
  const run = (
    service as unknown as {
      applyScheduleRevision: (
        tx: unknown,
        request: unknown,
        after: Record<string, unknown>,
        actorId: string,
      ) => Promise<unknown>;
    }
  ).applyScheduleRevision.bind(service);
  return { promise: run(tx, request, after, "person-admin"), created, tx };
}

function scholarshipsOf(created: Record<string, unknown>[]) {
  const data = created[0] as
    { scholarships?: { create: Record<string, unknown>[] } } | undefined;
  return data?.scholarships?.create ?? [];
}

describe("applying a fee-schedule revision that carries scholarships", () => {
  it("applies a scholarships-only payload instead of hunting for a fee row", async () => {
    const { promise, created } = applyRevision({
      scholarships: [
        {
          key: "social_help",
          label: "Social help",
          description: "Case by case",
          basis: "tuition",
          rateMode: "per_student",
          costCenterCode: "9100",
          active: true,
          sortOrder: 0,
        },
      ],
    });
    await promise;
    expect(scholarshipsOf(created)).toEqual([
      expect.objectContaining({
        key: "social_help",
        rateMode: "per_student",
        pctBps: null,
        flatXof: null,
      }),
    ]);
  });

  it("leaves the installments untouched when only the catalog changed", async () => {
    const { promise, created } = applyRevision({
      scholarships: [
        {
          key: "merit_bien",
          label: "Mention Bien",
          description: "Merit award",
          basis: "tuition",
          rateMode: "fixed",
          pctBps: 2_000,
          costCenterCode: "9100",
          active: true,
          sortOrder: 0,
        },
      ],
    });
    await promise;
    const data = created[0] as {
      rows: { create: Record<string, unknown>[] };
      components: { create: Record<string, unknown>[] };
    };
    expect(data.rows.create).toEqual([
      expect.objectContaining({ sequence: 1, amountFullXof: 1_000_000 }),
    ]);
    expect(data.components.create).toEqual([
      expect.objectContaining({ key: "tuition", annualAmountXof: 1_000_000 }),
    ]);
    expect(scholarshipsOf(created)).toEqual([
      expect.objectContaining({ key: "merit_bien", pctBps: 2_000 }),
    ]);
  });

  it("carries the approved catalog forward when a fee edit does not mention it", async () => {
    const { promise, created } = applyRevision({
      rows: [{ id: "row-1", amountTuitionXof: 1_200_000 }],
    });
    await promise;
    expect(scholarshipsOf(created)).toEqual([
      expect.objectContaining({ key: "merit_bien", pctBps: 1_500 }),
    ]);
  });

  it("refuses a catalog entry whose cost center does not exist", async () => {
    const service = new FinanceApprovalsService({} as unknown as PrismaService);
    const { tx } = buildTx();
    tx.costCenter.findMany = vi.fn(async () => [{ code: "9100" }]);
    const run = (
      service as unknown as {
        applyScheduleRevision: (...args: unknown[]) => Promise<unknown>;
      }
    ).applyScheduleRevision.bind(service);
    await expect(
      run(
        tx,
        {
          academicYearLabel: "2026-2027",
          targetId: SCHEDULE_ID,
          reason: "r",
          requestedById: "person-bursar",
        },
        {
          scholarships: [
            {
              key: "merit_bien",
              label: "Mention Bien",
              description: "Merit award",
              basis: "tuition",
              rateMode: "fixed",
              pctBps: 1_500,
              costCenterCode: "9999",
              active: true,
              sortOrder: 0,
            },
          ],
        },
        "person-admin",
      ),
    ).rejects.toThrow(/Unknown cost center 9999/);
  });
});
