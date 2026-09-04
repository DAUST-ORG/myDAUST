import { describe, expect, it, vi } from "vitest";
import { OperatingBudgetService } from "./operating-budget.service.js";

type TestService = {
  approvalSnapshot(change: {
    kind: string;
    targetId?: string;
    after: Record<string, unknown>;
  }): Promise<unknown>;
  budgetContentHash(budget: Record<string, unknown>): string;
};

function service(prisma: Record<string, unknown>) {
  return new OperatingBudgetService(prisma as never) as unknown as TestService;
}

describe("operating-budget and management-actual no-op approvals", () => {
  it("rejects a draft whose financial content matches the approved budget", async () => {
    const draft = {
      id: "draft",
      academicYearId: "year",
      status: "draft",
      revision: 2,
      baseRevision: 1,
      contentVersion: 4,
      reason: "A new explanation does not change the budget",
      openingBalanceXof: 500n,
      lines: [
        { categoryKey: "utilities", monthIndex: 0, amountXof: 100n },
        { categoryKey: "bursar", monthIndex: 1, amountXof: 200n },
      ],
    };
    const approved = {
      ...draft,
      id: "approved",
      status: "approved",
      revision: 1,
      baseRevision: 0,
      reason: "Original approval",
      contentVersion: 1,
      lines: [...draft.lines].reverse(),
    };
    const budgets = service({
      operatingBudget: {
        findUnique: vi.fn().mockResolvedValue(draft),
        findFirst: vi.fn().mockResolvedValue(approved),
      },
    });

    await expect(
      budgets.approvalSnapshot({
        kind: "operating_budget",
        targetId: draft.id,
        after: {
          budgetId: draft.id,
          expectedContentVersion: draft.contentVersion,
          expectedContentHash: budgets.budgetContentHash(draft),
        },
      }),
    ).rejects.toThrow("already matches the approved budget");
  });

  it("allows a draft when one budget cell changes", async () => {
    const draft = {
      id: "draft",
      academicYearId: "year",
      status: "draft",
      revision: 2,
      baseRevision: 1,
      contentVersion: 4,
      reason: "Move a cell",
      openingBalanceXof: 500n,
      lines: [{ categoryKey: "utilities", monthIndex: 0, amountXof: 101n }],
    };
    const budgets = service({
      operatingBudget: {
        findUnique: vi.fn().mockResolvedValue(draft),
        findFirst: vi.fn().mockResolvedValue({
          ...draft,
          id: "approved",
          status: "approved",
          lines: [{ ...draft.lines[0], amountXof: 100n }],
        }),
      },
    });

    await expect(
      budgets.approvalSnapshot({
        kind: "operating_budget",
        targetId: draft.id,
        after: {
          budgetId: draft.id,
          expectedContentVersion: draft.contentVersion,
          expectedContentHash: budgets.budgetContentHash(draft),
        },
      }),
    ).resolves.toMatchObject({ baseRevision: 1 });
  });

  it("rejects an expense correction equal to the approved expense", async () => {
    const expense = {
      id: "expense",
      status: "approved",
      revision: 3,
      academicYearId: "year",
      academicYear: { label: "2026–2027" },
      managementCategoryKey: "utilities",
      category: "Utilities",
      costCenterCode: "9100",
      description: "Electricity",
      payee: "Senelec",
      amount: 25_000,
      isEstimate: false,
      incurredOn: new Date("2026-09-03T00:00:00.000Z"),
    };
    const budgets = service({
      expense: { findUnique: vi.fn().mockResolvedValue(expense) },
    });

    await expect(
      budgets.approvalSnapshot({
        kind: "management_actual",
        targetId: expense.id,
        after: {
          mode: "update_expense",
          academicYearId: "year",
          categoryKey: "utilities",
          legacyCategory: "Utilities",
          costCenterCode: "9100",
          description: "Electricity",
          payee: "Senelec",
          amountXof: 25_000,
          isEstimate: false,
          occurredOn: "2026-09-03",
        },
      }),
    ).rejects.toThrow("expense already has these approved details");
  });

  it("rejects a manual-income correction equal to the approved entry", async () => {
    const entry = {
      id: "entry",
      status: "approved",
      revision: 2,
      academicYearId: "year",
      academicYear: { label: "2026–2027" },
      categoryKey: "research_grants",
      category: { label: "Research grants" },
      costCenterCode: "9100",
      amountXof: 75_000n,
      occurredOn: new Date("2026-09-03T00:00:00.000Z"),
      description: "Grant receipt",
    };
    const budgets = service({
      managementActualEntry: {
        findUnique: vi.fn().mockResolvedValue(entry),
      },
    });

    await expect(
      budgets.approvalSnapshot({
        kind: "management_actual",
        targetId: entry.id,
        after: {
          mode: "update_entry",
          academicYearId: "year",
          categoryKey: "research_grants",
          costCenterCode: "9100",
          amountXof: 75_000,
          occurredOn: "2026-09-03",
          description: "Grant receipt",
        },
      }),
    ).rejects.toThrow("manual actual already has these approved details");
  });
});
