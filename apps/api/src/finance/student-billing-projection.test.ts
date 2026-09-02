import { describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";

const installment = (id: string, amountDue: number, amountPaid: number) => ({
  id,
  sequence: 1,
  dueDate: new Date("2027-03-05T00:00:00Z"),
  amountDue,
  amountPaid,
  status: amountPaid >= amountDue ? "paid" : "pending",
  components: [],
});

describe("student billing projection", () => {
  it("shows the canonical annual schedule and omits its voided predecessor", async () => {
    const canonical = {
      id: "canonical",
      studentId: "student",
      status: "partial",
      totalAmount: 4_285_000,
      amountPaid: 2_900_000,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      description: "August 29 workbook annual billing baseline",
      packageType: "standard_full",
      academicYearLabel: "2026–2027",
      feeScheduleRevision: 2,
      term: { name: "Fall 2026" },
      plan: {
        installments: [
          installment("canonical-installment", 4_285_000, 2_900_000),
        ],
      },
      payments: [],
      paymentSubmissions: [],
    };
    const superseded = {
      ...canonical,
      id: "superseded",
      status: "void",
      amountPaid: 4_285_000,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "Annual tuition, housing and cafeteria package",
      plan: {
        installments: [
          installment("superseded-installment", 4_285_000, 4_285_000),
        ],
      },
    };
    const prisma = {
      invoice: { findMany: vi.fn().mockResolvedValue([canonical, superseded]) },
    };
    const finance = new FinanceService(
      prisma as never,
      { send: vi.fn() } as never,
      {} as never,
      {} as never,
    );

    const result = await finance.getStudentBilling("student");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "canonical",
      label: "Annual fee schedule",
      description: "August 29 workbook annual billing baseline",
      status: "partial",
    });
    expect(result.some((invoice) => invoice.id === "superseded")).toBe(false);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student" } }),
    );
  });
});
