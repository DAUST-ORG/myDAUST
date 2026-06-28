import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Payslips derived from salary Expense records for this employee (non-statutory net estimate).
   * Joins on the canonical `personId`, never the mutable display name, so name collisions or a
   * renamed employee can't cross-expose payroll.
   */
  async payslips(personId: string) {
    const salaries = await this.prisma.expense.findMany({
      where: { category: "Salary", personId },
      orderBy: { incurredOn: "desc" },
    });
    return salaries.map((s) => {
      const gross = s.amount;
      const net = Math.round(gross * 0.9); // illustrative 10% withholding; statutory payroll -> ERP
      return {
        id: s.id,
        period: s.incurredOn.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        gross,
        deductions: gross - net,
        net,
        isEstimate: s.isEstimate,
      };
    });
  }

  async myLeave(personId: string) {
    return this.prisma.leaveRequest.findMany({ where: { personId }, orderBy: { createdAt: "desc" } });
  }

  async requestLeave(personId: string, input: { type: string; startDate: string; endDate: string; reason?: string }) {
    return this.prisma.leaveRequest.create({
      data: { personId, type: input.type, startDate: new Date(input.startDate), endDate: new Date(input.endDate), reason: input.reason ?? null },
    });
  }

  async myBookings(personId: string) {
    return this.prisma.roomBooking.findMany({ where: { personId }, orderBy: { date: "desc" } });
  }

  async book(personId: string, input: { room: string; date: string; startTime: string; endTime: string; purpose?: string }) {
    return this.prisma.roomBooking.create({
      data: { personId, room: input.room, date: new Date(input.date), startTime: input.startTime, endTime: input.endTime, purpose: input.purpose ?? null },
    });
  }
}
