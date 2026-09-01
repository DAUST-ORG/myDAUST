import { describe, expect, it, vi } from "vitest";
import { OperatingBudgetService } from "./operating-budget.service.js";

describe("operating-budget workbook balance reconstruction", () => {
  it("recognizes reconstructed cash on the reviewed source date and labels it distinctly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    const sourceAsOfDate = new Date("2026-08-29T00:00:00.000Z");
    const paymentFindMany = vi.fn().mockResolvedValue([
      {
        id: "payment-1",
        amount: 286_551_264,
        status: "success",
        settledAt: null,
        refundedAt: null,
        recognizedOn: sourceAsOfDate,
        invoice: { costCenterCode: "9100" },
        componentAllocations: [
          {
            id: "allocation-1",
            amountXof: 286_551_264,
            refundedAmountXof: 0,
            invoiceComponent: {
              kind: "tuition",
              label: "Workbook tuition reconstruction",
              costCenterCode: "9100",
            },
          },
        ],
        paymentBalanceImportRow: null,
        workbookCutoverRecords: [{ batch: { sourceAsOfDate } }],
        workbookReplacementEvents: [],
      },
    ]);
    const prisma = {
      payment: { findMany: paymentFindMany },
      expense: { findMany: vi.fn().mockResolvedValue([]) },
      managementActualEntry: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new OperatingBudgetService(prisma as never);

    const records = await (
      service as unknown as {
        actualRecords(
          db: typeof prisma,
          year: { id: string; label: string },
        ): Promise<
          {
            source: string;
            occurredOn: Date;
            amountXof: number;
            description: string;
          }[]
        >;
      }
    ).actualRecords(prisma, { id: "year-1", label: "2026–2027" });

    expect(records).toEqual([
      expect.objectContaining({
        source: "balance_reconciliation",
        occurredOn: sourceAsOfDate,
        amountXof: 286_551_264,
        description:
          "Balance reconstruction as of 2026-08-29 · Workbook tuition reconstruction",
      }),
    ]);
    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: expect.arrayContaining(["success", "refunded"]) },
          OR: expect.arrayContaining([
            expect.objectContaining({ recognizedOn: expect.any(Object) }),
            expect.objectContaining({
              workbookCutoverRecords: expect.any(Object),
            }),
          ]),
        }),
      }),
    );
    vi.useRealTimers();
  });
});
