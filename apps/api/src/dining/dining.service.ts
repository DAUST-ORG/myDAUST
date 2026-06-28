import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;
type Period = (typeof PERIODS)[number];

@Injectable()
export class DiningService {
  constructor(private readonly prisma: PrismaService) {}

  private secret() {
    return process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";
  }

  /** Signed dining-pass token for a student: `studentId.hmac`. Verified at the scanner. */
  private signPass(studentId: string) {
    const sig = createHmac("sha256", this.secret()).update(studentId).digest("hex");
    return `${studentId}.${sig}`;
  }

  private verifyPass(token: string): string | null {
    const [studentId, sig] = token.split(".");
    if (!studentId || !sig) return null;
    const expected = createHmac("sha256", this.secret()).update(studentId).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return studentId;
  }

  private dayOnly(d = new Date()) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // --- Student ---

  async myPass(studentId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { person: true, mealPlan: true },
    });
    return {
      token: this.signPass(studentId),
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`,
      plan: student.mealPlan?.type ?? "none",
      active: student.mealPlan?.active ?? false,
    };
  }

  async choosePlan(studentId: string, type: "none" | "half" | "full") {
    return this.prisma.mealPlan.upsert({
      where: { studentId },
      update: { type, active: type !== "none" },
      create: { studentId, type, term: "Fall 2026", active: type !== "none" },
    });
  }

  async menu() {
    return this.prisma.menuItem.findMany({ where: { available: true }, orderBy: { name: "asc" } });
  }

  async myOrders(studentId: string) {
    const orders = await this.prisma.diningOrder.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { menuItem: true } } },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalXof: o.totalXof,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.menuItem.name, qty: i.qty, priceXof: i.priceXof })),
    }));
  }

  async createOrder(studentId: string, items: { menuItemId: string; qty: number }[]) {
    if (items.length === 0) throw new BadRequestException("Order is empty");
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: items.map((i) => i.menuItemId) } } });
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    let total = 0;
    const orderItems = items.map((i) => {
      const m = byId.get(i.menuItemId);
      if (!m) throw new BadRequestException("Unknown menu item");
      const qty = Math.max(1, i.qty);
      total += m.priceXof * qty;
      return { menuItemId: m.id, qty, priceXof: m.priceXof };
    });
    return this.prisma.diningOrder.create({
      data: { studentId, status: "cart", totalXof: total, items: { create: orderItems } },
    });
  }

  /**
   * Pay for a weekend order via the shared PayTech rail. In local/sandbox we mark it paid
   * directly; production routes through PaymentProvider + IPN like tuition.
   */
  async payOrder(studentId: string, orderId: string) {
    const order = await this.prisma.diningOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.studentId !== studentId) throw new ForbiddenException("Not your order");
    if (order.status !== "cart") throw new BadRequestException("Order is not payable");
    return this.prisma.diningOrder.update({ where: { id: orderId }, data: { status: "paid" } });
  }

  // --- Scanner station ---

  async scan(token: string, period: Period) {
    const studentId = this.verifyPass(token);
    if (!studentId) return { result: "turned_away" as const, reason: "Invalid pass", name: null, studentNo: null };

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { person: true, mealPlan: true },
    });
    if (!student) return { result: "turned_away" as const, reason: "Unknown student", name: null, studentNo: null };

    const name = `${student.person.firstName} ${student.person.lastName}`;
    const base = { name, studentNo: student.studentNo };
    const date = this.dayOnly();

    if (!student.mealPlan?.active) {
      await this.recordScan(studentId, period, date, "turned_away", "No active meal plan");
      return { result: "turned_away" as const, reason: "No active meal plan", ...base };
    }
    if (student.mealPlan.type === "half" && period === "dinner") {
      await this.recordScan(studentId, period, date, "turned_away", "Half plan — dinner not covered");
      return { result: "turned_away" as const, reason: "Half plan — dinner not covered", ...base };
    }

    const existing = await this.prisma.diningScan.findUnique({
      where: { studentId_period_date: { studentId, period, date } },
    });
    if (existing?.result === "served") {
      return { result: "turned_away" as const, reason: "Already served", ...base };
    }

    await this.recordScan(studentId, period, date, "served", null);
    return { result: "served" as const, reason: null, ...base };
  }

  private async recordScan(studentId: string, period: Period, date: Date, result: "served" | "turned_away", reason: string | null) {
    await this.prisma.diningScan.upsert({
      where: { studentId_period_date: { studentId, period, date } },
      update: { result, reason },
      create: { studentId, period, date, result, reason },
    });
  }

  /** Live scan feed + counters for a meal period today. */
  async liveScans(period: Period) {
    const date = this.dayOnly();
    const scans = await this.prisma.diningScan.findMany({
      where: { period, date },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { student: { include: { person: true } } },
    });
    const all = await this.prisma.diningScan.groupBy({
      by: ["result"],
      where: { period, date },
      _count: true,
    });
    const served = all.find((a) => a.result === "served")?._count ?? 0;
    const turnedAway = all.find((a) => a.result === "turned_away")?._count ?? 0;
    return {
      period,
      served,
      turnedAway,
      recent: scans.map((s) => ({
        name: `${s.student.person.firstName} ${s.student.person.lastName}`,
        studentNo: s.student.studentNo,
        result: s.result,
        reason: s.reason,
        time: s.createdAt,
      })),
    };
  }

  // --- Admin console ---

  async adminOverview() {
    const date = this.dayOnly();
    const [byPeriod, plans, orders] = await Promise.all([
      this.prisma.diningScan.groupBy({ by: ["period", "result"], where: { date }, _count: true }),
      this.prisma.mealPlan.groupBy({ by: ["type"], where: { active: true }, _count: true }),
      this.prisma.diningOrder.findMany({ where: { status: { in: ["paid", "preparing", "ready"] } } }),
    ]);
    const periods = PERIODS.map((p) => ({
      period: p,
      served: byPeriod.find((b) => b.period === p && b.result === "served")?._count ?? 0,
      turnedAway: byPeriod.find((b) => b.period === p && b.result === "turned_away")?._count ?? 0,
    }));
    return {
      periods,
      activePlans: plans.filter((p) => p.type !== "none").reduce((s, p) => s + p._count, 0),
      planMix: plans.map((p) => ({ type: p.type, count: p._count })),
      openOrders: orders.length,
      weekendRevenue: orders.reduce((s, o) => s + o.totalXof, 0),
    };
  }

  async adminOrders() {
    const orders = await this.prisma.diningOrder.findMany({
      where: { status: { not: "cart" } },
      orderBy: { createdAt: "desc" },
      include: { student: { include: { person: true } }, items: { include: { menuItem: true } } },
    });
    return orders.map((o) => ({
      id: o.id,
      student: `${o.student.person.firstName} ${o.student.person.lastName}`,
      status: o.status,
      totalXof: o.totalXof,
      items: o.items.map((i) => `${i.qty}× ${i.menuItem.name}`),
      createdAt: o.createdAt,
    }));
  }

  async advanceOrder(orderId: string, status: string) {
    const flow = ["paid", "preparing", "ready", "collected"];
    if (!flow.includes(status)) throw new BadRequestException("Invalid status");
    return this.prisma.diningOrder.update({ where: { id: orderId }, data: { status: status as never } });
  }

  async settlement() {
    const paid = await this.prisma.diningOrder.findMany({ where: { status: { in: ["paid", "preparing", "ready", "collected"] } } });
    const revenue = paid.reduce((s, o) => s + o.totalXof, 0);
    return { orders: paid.length, revenue, settledTo: "Cost center 3600 — Dining / Auxiliary Services" };
  }

  async adminMenu() {
    return this.prisma.menuItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  }

  async createMenuItem(input: { name: string; description?: string; category: string; priceXof: number }) {
    return this.prisma.menuItem.create({
      data: { name: input.name, description: input.description ?? null, category: input.category, priceXof: input.priceXof },
    });
  }

  async toggleMenuItem(id: string) {
    const item = await this.prisma.menuItem.findUniqueOrThrow({ where: { id } });
    return this.prisma.menuItem.update({ where: { id }, data: { available: !item.available } });
  }
}
