import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../finance/payment-provider.js";
import { signPass, verifyPass } from "./pass-token.js";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;
type Period = (typeof PERIODS)[number];

@Injectable()
export class DiningService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  private secret() {
    return process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";
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
      token: signPass(studentId, this.secret()),
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

  /** Which meal periods the student has already been served today (for the home hub). */
  async myToday(studentId: string) {
    const scans = await this.prisma.diningScan.findMany({
      where: { studentId, date: this.dayOnly(), result: "served" },
      select: { period: true },
    });
    return { scannedPeriods: scans.map((s) => s.period) };
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
   * Pay for a weekend order via the shared PayTech rail: checkout redirect now, the verified
   * IPN (ref DINE-<orderId>) marks it paid. Falls back to direct settle only when no gateway
   * is configured (local dev without keys).
   */
  async payOrder(studentId: string, orderId: string): Promise<{ paid: boolean; redirectUrl?: string }> {
    const order = await this.prisma.diningOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.studentId !== studentId) throw new ForbiddenException("Not your order");
    if (order.status !== "cart") throw new BadRequestException("Order is not payable");

    if (!process.env.PAYTECH_API_KEY) {
      await this.prisma.diningOrder.update({ where: { id: orderId }, data: { status: "paid" } });
      return { paid: true };
    }

    const { redirectUrl } = await this.provider.requestPayment({
      ref: `DINE-${order.id}`,
      amount: order.totalXof,
      itemName: "DAUST weekend dining order",
      customField: { orderId: order.id, studentId },
    });
    return { paid: false, redirectUrl };
  }

  // --- Scanner station ---

  async scan(token: string, period: Period) {
    const studentId = verifyPass(token, this.secret());
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

  /** Staff-approved manual serve when the pass can't be scanned (or a turn-away is overridden). */
  async scanOverride(studentNo: string, period: Period, actorPersonId: string) {
    const student = await this.prisma.student.findUnique({
      where: { studentNo },
      include: { person: true },
    });
    if (!student) {
      return { result: "turned_away" as const, reason: "Unknown student number", name: null, studentNo: null };
    }
    const date = this.dayOnly();
    await this.recordScan(student.id, period, date, "served", "Manual override");
    await this.prisma.auditLog.create({
      data: {
        entity: "DiningScan",
        entityId: student.id,
        action: "override",
        actorId: actorPersonId,
        data: { studentNo, period, date: date.toISOString() },
      },
    });
    return {
      result: "served" as const,
      reason: "Manual override",
      name: `${student.person.firstName} ${student.person.lastName}`,
      studentNo: student.studentNo,
    };
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

  /** Meal-plan roster: every student holding a plan record + how many meals they scanned today. */
  async adminStudents() {
    const date = this.dayOnly();
    const [plans, scans] = await Promise.all([
      this.prisma.mealPlan.findMany({
        include: { student: { include: { person: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.diningScan.groupBy({
        by: ["studentId"],
        where: { date, result: "served" },
        _count: true,
      }),
    ]);
    const scansByStudent = new Map(scans.map((s) => [s.studentId, s._count]));
    return plans.map((p) => ({
      studentId: p.studentId,
      name: `${p.student.person.firstName} ${p.student.person.lastName}`,
      studentNo: p.student.studentNo,
      plan: p.type,
      active: p.active,
      term: p.term,
      scansToday: scansByStudent.get(p.studentId) ?? 0,
    }));
  }

  /** Derived reporting: 7-day service trend, plan mix, weekend revenue, top-selling items. */
  async adminReports() {
    const today = this.dayOnly();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);

    const [scanGroups, plans, paidOrders, itemGroups] = await Promise.all([
      this.prisma.diningScan.groupBy({
        by: ["date", "result"],
        where: { date: { gte: start } },
        _count: true,
      }),
      this.prisma.mealPlan.groupBy({ by: ["type"], where: { active: true }, _count: true }),
      this.prisma.diningOrder.findMany({
        where: { status: { in: ["paid", "preparing", "ready", "collected"] } },
        select: { totalXof: true },
      }),
      this.prisma.diningOrderItem.groupBy({
        by: ["menuItemId"],
        where: { order: { status: { not: "cart" } } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: "desc" } },
        take: 8,
      }),
    ]);

    const last7days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const count = (result: string) =>
        scanGroups.find((g) => g.date.toISOString().slice(0, 10) === key && g.result === result)?._count ?? 0;
      return { date: key, served: count("served"), turnedAway: count("turned_away") };
    });

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: itemGroups.map((g) => g.menuItemId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(menuItems.map((m) => [m.id, m.name]));

    return {
      last7days,
      planMix: plans.map((p) => ({ type: p.type, count: p._count })),
      weekendRevenue: paidOrders.reduce((s, o) => s + o.totalXof, 0),
      topItems: itemGroups.map((g) => ({
        name: nameById.get(g.menuItemId) ?? "Unknown item",
        qty: g._sum.qty ?? 0,
      })),
    };
  }

  async adminMenu() {
    return this.prisma.menuItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  }

  async createMenuItem(input: { name: string; description?: string; category: string; priceXof: number; imageUrl?: string }) {
    return this.prisma.menuItem.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        priceXof: input.priceXof,
        imageUrl: input.imageUrl || null,
      },
    });
  }

  async setMenuItemImage(id: string, imageUrl: string) {
    await this.prisma.menuItem.findUniqueOrThrow({ where: { id } });
    return this.prisma.menuItem.update({ where: { id }, data: { imageUrl: imageUrl || null } });
  }

  async toggleMenuItem(id: string) {
    const item = await this.prisma.menuItem.findUniqueOrThrow({ where: { id } });
    return this.prisma.menuItem.update({ where: { id }, data: { available: !item.available } });
  }
}
