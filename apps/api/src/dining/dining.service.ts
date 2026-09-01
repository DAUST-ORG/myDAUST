import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type AdvanceOrderInput,
  DiningSettingsInput,
  diningEligibility,
  type DiningVerdict,
  type ProofPaymentMethod,
  toDakarDateKey,
} from "@mydaust/shared";
import { deriveApiAccountPosition } from "../finance/account-position.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";
import { signPass, verifyPass } from "./pass-token.js";
import type { AuthUser } from "../auth/current-user.js";
import { FinanceApprovalsService } from "../finance/finance-approvals.service.js";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;
type Period = (typeof PERIODS)[number];

const DINING_SETTINGS_KEY = "dining.settings";

/**
 * `enforcePayment` ships off. Turning it on refuses every student carrying an overdue
 * installment at the door, so it is an announced operational change, not a deploy.
 */
const DEFAULT_DINING_SETTINGS: DiningSettingsInput = {
  mealWindows: {
    breakfast: { start: "07:00", end: "09:00" },
    lunch: { start: "12:00", end: "14:00" },
    dinner: { start: "19:00", end: "21:00" },
  },
  costPerMealXof: 720,
  weekendOrdering: true,
  orderCutoff: "11:00",
  enforcePayment: false,
  blockSecondScan: true,
};

@Injectable()
export class DiningService {
  private readonly approvals: FinanceApprovalsService;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly paymentSubmissions: PaymentSubmissionsService,
    @Optional() approvals?: FinanceApprovalsService,
  ) {
    this.approvals = approvals ?? new FinanceApprovalsService(prisma);
  }

  private secret() {
    return this.env.SESSION_SECRET;
  }

  /**
   * The Dakar calendar date, stored as midnight UTC. This is the third component of
   * `DiningScan @@unique([studentId, period, date])`, so it decides when a student's
   * "already served" window rolls over. Dakar is UTC+0 year-round, so the stored value
   * is identical to the previous UTC-derived one — but it now says what it means, and
   * it agrees with every other date on the money surface.
   */
  private dayOnly(d = new Date()) {
    return new Date(`${toDakarDateKey(d)}T00:00:00.000Z`);
  }

  /**
   * Dining access is valid only inside one explicitly date-bounded active
   * AcademicYear. A status flag without dates, or overlapping active years,
   * cannot grant cafeteria access.
   */
  private async effectiveAcademicYearLabel(at = new Date()) {
    const date = this.dayOnly(at);
    const years = await this.prisma.academicYear.findMany({
      where: {
        status: "active",
        startsOn: { lte: date },
        endsOn: { gte: date },
      },
      orderBy: [{ startsOn: "desc" }, { label: "desc" }],
      take: 2,
      select: { label: true },
    });
    if (years.length === 0) {
      throw new BadRequestException(
        "No currently effective academic year is configured for Dining",
      );
    }
    if (years.length !== 1) {
      throw new BadRequestException(
        "Dining access is blocked because the effective academic year is ambiguous",
      );
    }
    return years[0]!.label;
  }

  private currentMealPlan(studentId: string, academicYearLabel: string) {
    return this.prisma.mealPlan.findUnique({
      where: {
        studentId_academicYearLabel: { studentId, academicYearLabel },
      },
    });
  }

  /**
   * Service rules, with the shipped defaults. `enforcePayment` is the one that turns
   * students away at the door, so it is the one an operator can flip without a deploy.
   */
  async settings(): Promise<DiningSettingsInput> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: DINING_SETTINGS_KEY },
    });
    const parsed = DiningSettingsInput.safeParse(row?.valueJson);
    return parsed.success ? parsed.data : DEFAULT_DINING_SETTINGS;
  }

  async updateSettings(input: DiningSettingsInput, actorPersonId: string) {
    const [saved] = await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: DINING_SETTINGS_KEY },
        update: { valueJson: input },
        create: { key: DINING_SETTINGS_KEY, valueJson: input },
      }),
      this.prisma.auditLog.create({
        data: {
          entity: "AppSetting",
          entityId: DINING_SETTINGS_KEY,
          action: "update",
          actorId: actorPersonId,
          data: input,
        },
      }),
    ]);
    return DiningSettingsInput.parse(saved.valueJson);
  }

  /** Total overdue across the student's account — the figure the door refuses on. */
  private async overdueXof(studentId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        createdAt: true,
        plan: {
          select: {
            installments: {
              select: {
                id: true,
                sequence: true,
                dueDate: true,
                amountDue: true,
                amountPaid: true,
              },
            },
          },
        },
      },
    });
    return deriveApiAccountPosition(invoices).summary.overdueXof;
  }

  private async requireActiveStudent(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, recordStatus: "active" },
      select: { id: true },
    });
    if (!student) {
      throw new ForbiddenException("Student enrollment is not active");
    }
  }

  // --- Student ---

  async myPass(studentId: string) {
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const [student, mealPlan] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        include: { person: true },
      }),
      this.currentMealPlan(studentId, academicYearLabel),
    ]);
    if (student.recordStatus !== "active") {
      throw new ForbiddenException("Student enrollment is not active");
    }
    return {
      token: signPass(studentId, this.secret()),
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`,
      academicYearLabel,
      plan: mealPlan?.type ?? "none",
      active: mealPlan?.active ?? false,
    };
  }

  private async cafeteriaOptions(academicYearLabel: string) {
    const supportedCodes = ["none", "half", "full"] as const;
    const rows = await this.prisma.billingServiceOption.findMany({
      where: {
        academicYearLabel,
        kind: "cafeteria",
        active: true,
        code: { in: [...supportedCodes] },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    return rows
      .filter(
        (row) =>
          row.calculation === "fixed" &&
          row.amountXof !== null &&
          (row.code === "none" || row.amountXof > 0),
      )
      .map((row) => ({
        code: row.code as (typeof supportedCodes)[number],
        label: row.label,
        description: row.description,
        amountXof: row.amountXof!,
      }));
  }

  async myPlanOptions(studentId: string) {
    await this.requireActiveStudent(studentId);
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const profile = await this.prisma.annualBillingProfile.findFirst({
      where: { studentId, academicYearLabel, status: "active" },
      include: { selections: true },
    });
    if (!profile) {
      throw new BadRequestException(
        "Finance must create an annual billing profile before a cafeteria change can be requested",
      );
    }
    const [options, pending] = await Promise.all([
      this.cafeteriaOptions(profile.academicYearLabel),
      this.prisma.approvalRequest.findFirst({
        where: {
          kind: "billing_profile",
          targetType: "Student",
          targetId: studentId,
          status: "pending",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true, afterJson: true },
      }),
    ]);
    const pendingAfter =
      pending?.afterJson &&
      typeof pending.afterJson === "object" &&
      !Array.isArray(pending.afterJson)
        ? (pending.afterJson as Record<string, unknown>)
        : null;
    return {
      academicYearLabel: profile.academicYearLabel,
      currentOptionCode:
        profile.selections.find((selection) => selection.kind === "cafeteria")
          ?.optionCode ?? "none",
      options,
      pendingRequest: pending
        ? {
            id: pending.id,
            status: pending.status,
            requestedOptionCode:
              typeof pendingAfter?.cafeteriaOptionCode === "string"
                ? pendingAfter.cafeteriaOptionCode
                : null,
            createdAt: pending.createdAt.toISOString(),
          }
        : null,
    };
  }

  async choosePlan(
    studentId: string,
    actor: AuthUser,
    type: "none" | "half" | "full",
  ) {
    await this.requireActiveStudent(studentId);
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const profile = await this.prisma.annualBillingProfile.findFirst({
      where: { studentId, academicYearLabel, status: "active" },
      include: {
        selections: true,
        awards: {
          where: { definitionId: { not: null } },
          orderBy: { createdAt: "asc" },
        },
        invoiceAdjustments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!profile) {
      throw new BadRequestException(
        "Finance must create an annual billing profile before a cafeteria change can be requested",
      );
    }
    const availableOptions = await this.cafeteriaOptions(
      profile.academicYearLabel,
    );
    if (!availableOptions.some((option) => option.code === type)) {
      throw new BadRequestException(
        `Cafeteria option ${type} is not active and priced for ${profile.academicYearLabel}`,
      );
    }
    const selection = (
      kind: "housing" | "cafeteria" | "insurance" | "housing_caution",
    ) => profile.selections.find((row) => row.kind === kind);
    const housing = selection("housing");
    if (!housing) {
      throw new BadRequestException(
        "The annual billing profile has no housing selection",
      );
    }
    if (selection("cafeteria")?.optionCode === type) {
      throw new BadRequestException("This cafeteria plan is already active");
    }
    const revisionReference = `billing-profile:${profile.id}:revision:${profile.revision}`;
    const hasRevisionTaggedAdjustments = profile.invoiceAdjustments.some(
      (adjustment) =>
        adjustment.sourceReference?.startsWith(
          `billing-profile:${profile.id}:revision:`,
        ) ?? false,
    );
    const currentAdjustments = hasRevisionTaggedAdjustments
      ? profile.invoiceAdjustments.filter(
          (adjustment) => adjustment.sourceReference === revisionReference,
        )
      : profile.invoiceAdjustments;
    const currentAdjustmentIds = new Set(
      currentAdjustments.map((adjustment) => adjustment.id),
    );
    const currentAwards = profile.awards.filter(
      (award) =>
        !award.invoiceAdjustmentId ||
        currentAdjustmentIds.has(award.invoiceAdjustmentId),
    );
    return this.approvals.request(actor, {
      kind: "billing_profile",
      targetType: "Student",
      targetId: studentId,
      academicYearLabel: profile.academicYearLabel,
      reason: `Student requested cafeteria plan ${type}`,
      after: {
        academicYearLabel: profile.academicYearLabel,
        expectedRevision: profile.revision,
        housingOptionCode: housing.optionCode,
        cafeteriaOptionCode: type,
        insuranceSelected: (selection("insurance")?.amountXof ?? 0) > 0,
        cautionSelected: (selection("housing_caution")?.amountXof ?? 0) > 0,
        awardDefinitionIds: currentAwards.flatMap((award) =>
          award.definitionId && award.calculation !== "manual"
            ? [award.definitionId]
            : [],
        ),
        manualAdjustments: currentAdjustments
          .filter((adjustment) => adjustment.calculation === "manual")
          .map((adjustment) => ({
            definitionId: adjustment.definitionId ?? undefined,
            label: adjustment.label,
            amountXof:
              adjustment.effect === "discount"
                ? -adjustment.amountXof
                : adjustment.amountXof,
            reason:
              adjustment.reason ?? "Carried forward from the approved profile",
          })),
      },
    });
  }

  async menu() {
    return this.prisma.menuItem.findMany({
      where: { available: true },
      orderBy: { name: "asc" },
    });
  }

  /** Which meal periods the student has already been served today (for the home hub). */
  /**
   * Today's served periods plus the configured service windows. The windows ride along
   * because the student's "next meal" card is one of the two things the dining Settings
   * screen claims to drive — and a setting nothing reads is a decorative switch.
   */
  async myToday(studentId: string) {
    await this.requireActiveStudent(studentId);
    const [scans, settings] = await Promise.all([
      this.prisma.diningScan.findMany({
        where: { studentId, date: this.dayOnly(), result: "served" },
        select: { period: true },
      }),
      this.settings(),
    ]);
    return {
      scannedPeriods: scans.map((s) => s.period),
      mealWindows: settings.mealWindows,
      weekendOrdering: settings.weekendOrdering,
      orderCutoff: settings.orderCutoff,
    };
  }

  async myOrders(studentId: string) {
    await this.requireActiveStudent(studentId);
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
      items: o.items.map((i) => ({
        name: i.menuItem.name,
        qty: i.qty,
        priceXof: i.priceXof,
      })),
    }));
  }

  async createOrder(
    studentId: string,
    items: { menuItemId: string; qty: number }[],
  ) {
    await this.requireActiveStudent(studentId);
    if (items.length === 0) throw new BadRequestException("Order is empty");
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
    });
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
      data: {
        studentId,
        status: "cart",
        totalXof: total,
        items: { create: orderItems },
      },
    });
  }

  /**
   * Start or resume a proof-based weekend-order payment. The order remains a cart until
   * Finance verifies both pieces of evidence.
   */
  async payOrder(
    studentId: string,
    orderId: string,
    method: ProofPaymentMethod,
    actor: { personId: string; email: string },
  ) {
    await this.requireActiveStudent(studentId);
    const order = await this.prisma.diningOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.studentId !== studentId)
      throw new ForbiddenException("Not your order");
    if (order.status !== "cart")
      throw new BadRequestException("Order is not payable");

    return this.paymentSubmissions.createForDining(
      studentId,
      orderId,
      method,
      actor,
    );
  }

  // --- Scanner station ---

  /**
   * The door. Every refusal is decided by `diningEligibility` in @mydaust/shared, so the
   * student's own screen can show the same verdict before they walk over. The response
   * carries the student's photo because that, not the token, is what stops pass sharing.
   */
  async scan(token: string, period: Period) {
    const studentId = verifyPass(token, this.secret());
    if (!studentId) return this.refuseUnknown("INVALID", "Invalid pass");

    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const [student, mealPlan] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        include: { person: true, program: true },
      }),
      this.currentMealPlan(studentId, academicYearLabel),
    ]);
    if (!student || student.recordStatus !== "active") {
      return this.refuseUnknown("UNKNOWN", "Unknown student");
    }

    const settings = await this.settings();
    const date = this.dayOnly();
    const [existing, overdueXof] = await Promise.all([
      this.prisma.diningScan.findUnique({
        where: { studentId_period_date: { studentId, period, date } },
      }),
      settings.enforcePayment ? this.overdueXof(studentId) : Promise.resolve(0),
    ]);

    const verdict = diningEligibility({
      planType: mealPlan?.type ?? null,
      planActive: mealPlan?.active ?? false,
      period,
      overdueXof,
      alreadyServed: existing?.result === "served",
      enforcePayment: settings.enforcePayment,
      blockSecondScan: settings.blockSecondScan,
    });

    // A repeat scan must not overwrite the row that already served them.
    if (verdict.code !== "SERVED") {
      await this.recordScan(
        studentId,
        period,
        date,
        verdict.serve ? "served" : "turned_away",
        verdict.serve ? null : verdict.reason,
      );
    }

    return this.describe(verdict, student, mealPlan, period);
  }

  private refuseUnknown(code: DiningVerdict["code"], reason: string) {
    return {
      result: "turned_away" as const,
      code,
      reason,
      overridable: false,
      name: null,
      studentNo: null,
      photoUrl: null,
      plan: null,
      program: null,
      period: null as Period | null,
    };
  }

  private describe(
    verdict: DiningVerdict,
    student: {
      studentNo: string;
      photoUrl: string | null;
      person: { firstName: string; lastName: string };
      program?: { code: string } | null;
    },
    mealPlan: { type: string } | null,
    period: Period,
  ) {
    return {
      result: verdict.serve ? ("served" as const) : ("turned_away" as const),
      code: verdict.code,
      reason: verdict.reason,
      overridable: verdict.overridable,
      name: `${student.person.firstName} ${student.person.lastName}`,
      studentNo: student.studentNo,
      photoUrl: student.photoUrl,
      plan: mealPlan?.type ?? "none",
      program: student.program?.code ?? null,
      period,
    };
  }

  /** What the door would say right now, for the student's own screen. */
  async myEligibility(studentId: string, period: Period) {
    await this.requireActiveStudent(studentId);
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const [mealPlan, settings, date] = await Promise.all([
      this.currentMealPlan(studentId, academicYearLabel),
      this.settings(),
      Promise.resolve(this.dayOnly()),
    ]);
    const [existing, overdueXof] = await Promise.all([
      this.prisma.diningScan.findUnique({
        where: { studentId_period_date: { studentId, period, date } },
      }),
      settings.enforcePayment ? this.overdueXof(studentId) : Promise.resolve(0),
    ]);
    return {
      period,
      academicYearLabel,
      ...diningEligibility({
        planType: mealPlan?.type ?? null,
        planActive: mealPlan?.active ?? false,
        period,
        overdueXof,
        alreadyServed: existing?.result === "served",
        enforcePayment: settings.enforcePayment,
        blockSecondScan: settings.blockSecondScan,
      }),
    };
  }

  /**
   * Staff-approved manual serve when the pass will not scan, or a waiver of an overridable
   * refusal. Which refusals may be waived is decided here, not by the station: the roles
   * guard is fail-open and the client is never a control. A student with no meal plan is
   * not a scanning problem, so that one cannot be waived.
   */
  async scanOverride(studentNo: string, period: Period, actorPersonId: string) {
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const student = await this.prisma.student.findUnique({
      where: { studentNo },
      include: { person: true, program: true },
    });
    if (!student || student.recordStatus !== "active") {
      return this.refuseUnknown(
        "UNKNOWN",
        "Unknown or inactive student number",
      );
    }

    const settings = await this.settings();
    const date = this.dayOnly();
    const [mealPlan, existing, overdueXof] = await Promise.all([
      this.currentMealPlan(student.id, academicYearLabel),
      this.prisma.diningScan.findUnique({
        where: {
          studentId_period_date: { studentId: student.id, period, date },
        },
      }),
      settings.enforcePayment
        ? this.overdueXof(student.id)
        : Promise.resolve(0),
    ]);

    const current = diningEligibility({
      planType: mealPlan?.type ?? null,
      planActive: mealPlan?.active ?? false,
      period,
      overdueXof,
      alreadyServed: existing?.result === "served",
      enforcePayment: settings.enforcePayment,
      blockSecondScan: settings.blockSecondScan,
    });

    if (!current.serve && !current.overridable) {
      return this.describe(current, student, mealPlan, period);
    }

    const waived = current.serve ? null : current.code;
    const reason = waived ? `Override · ${waived}` : "Manual override";
    await this.prisma.$transaction([
      this.prisma.diningScan.upsert({
        where: {
          studentId_period_date: { studentId: student.id, period, date },
        },
        update: { result: "served", reason },
        create: {
          studentId: student.id,
          period,
          date,
          result: "served",
          reason,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          entity: "DiningScan",
          entityId: student.id,
          action: "override",
          actorId: actorPersonId,
          data: {
            studentNo,
            period,
            date: date.toISOString(),
            waivedCode: waived,
          },
        },
      }),
    ]);

    return this.describe(
      { code: "OK", reason, serve: true, overridable: false },
      student,
      mealPlan,
      period,
    );
  }

  private async recordScan(
    studentId: string,
    period: Period,
    date: Date,
    result: "served" | "turned_away",
    reason: string | null,
  ) {
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
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const [byPeriod, plans, orders] = await Promise.all([
      this.prisma.diningScan.groupBy({
        by: ["period", "result"],
        where: { date },
        _count: true,
      }),
      this.prisma.mealPlan.groupBy({
        by: ["type"],
        where: {
          academicYearLabel,
          active: true,
          student: { recordStatus: "active" },
        },
        _count: true,
      }),
      this.prisma.diningOrder.findMany({
        where: {
          status: { in: ["paid", "preparing", "ready"] },
          student: { recordStatus: "active" },
        },
      }),
    ]);
    const periods = PERIODS.map((p) => ({
      period: p,
      served:
        byPeriod.find((b) => b.period === p && b.result === "served")?._count ??
        0,
      turnedAway:
        byPeriod.find((b) => b.period === p && b.result === "turned_away")
          ?._count ?? 0,
    }));
    return {
      academicYearLabel,
      periods,
      activePlans: plans
        .filter((p) => p.type !== "none")
        .reduce((s, p) => s + p._count, 0),
      planMix: plans.map((p) => ({ type: p.type, count: p._count })),
      openOrders: orders.length,
      weekendRevenue: orders.reduce((s, o) => s + o.totalXof, 0),
    };
  }

  async adminOrders() {
    const orders = await this.prisma.diningOrder.findMany({
      where: {
        status: { not: "cart" },
        student: { recordStatus: "active" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        student: { include: { person: true } },
        items: { include: { menuItem: true } },
      },
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

  /** Fulfilment state on an order that has already been paid, so it is audited. */
  async advanceOrder(
    orderId: string,
    status: AdvanceOrderInput["status"],
    actorPersonId: string,
  ) {
    const order = await this.prisma.diningOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === "cart") {
      throw new BadRequestException("Order is not paid yet");
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.diningOrder.update({
        where: { id: orderId },
        data: { status },
      }),
      this.prisma.auditLog.create({
        data: {
          entity: "DiningOrder",
          entityId: orderId,
          action: "advance",
          actorId: actorPersonId,
          data: { from: order.status, to: status },
        },
      }),
    ]);
    return updated;
  }

  /**
   * The Finances screen. Plan revenue is read the same way the director cockpit reads it
   * (`finance.service.ts` revenueByCc) — net component allocations on cost center 3600 —
   * so the two surfaces cannot disagree. There is no settlement or payout here: the money
   * is already in the university's account by the time Finance verifies a proof.
   */
  async diningFinances() {
    const settings = await this.settings();
    const [allocations, orders, servedMeals, cafeteriaComponents] =
      await Promise.all([
        this.prisma.paymentComponentAllocation.findMany({
          where: {
            invoiceComponent: { costCenterCode: "3600" },
            payment: { status: "success" },
          },
          select: {
            amountXof: true,
            refundedAmountXof: true,
            payment: { select: { createdAt: true } },
          },
        }),
        this.prisma.diningOrder.findMany({
          where: {
            status: { in: ["paid", "preparing", "ready", "collected"] },
          },
          select: { totalXof: true, createdAt: true },
        }),
        this.prisma.diningScan.count({ where: { result: "served" } }),
        this.prisma.invoiceComponent.findMany({
          where: {
            costCenterCode: "3600",
            invoice: { status: { not: "void" } },
          },
          select: {
            amountXof: true,
            allocations: { select: { amountXof: true } },
          },
        }),
      ]);

    const planRevenue = allocations.reduce(
      (sum, a) => sum + a.amountXof - a.refundedAmountXof,
      0,
    );
    const weekendRevenue = orders.reduce((sum, o) => sum + o.totalXof, 0);
    const outstanding = cafeteriaComponents.reduce((sum, c) => {
      const allocated = c.allocations.reduce((a, x) => a + x.amountXof, 0);
      return sum + Math.max(0, c.amountXof - allocated);
    }, 0);

    const revenue = planRevenue + weekendRevenue;
    const foodCost = servedMeals * settings.costPerMealXof;

    const byMonth = new Map<string, { plan: number; weekend: number }>();
    const bucket = (at: Date) => {
      const key = toDakarDateKey(at).slice(0, 7);
      const row = byMonth.get(key) ?? { plan: 0, weekend: 0 };
      byMonth.set(key, row);
      return row;
    };
    for (const a of allocations) {
      bucket(a.payment.createdAt).plan += a.amountXof - a.refundedAmountXof;
    }
    for (const o of orders) bucket(o.createdAt).weekend += o.totalXof;

    return {
      planRevenue,
      weekendRevenue,
      revenue,
      outstanding,
      servedMeals,
      costPerMealXof: settings.costPerMealXof,
      foodCost,
      margin: revenue - foodCost,
      marginPct:
        revenue > 0 ? Math.round(((revenue - foodCost) / revenue) * 100) : 0,
      byMonth: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v })),
      settledTo: "Cost center 3600 — Dining / Auxiliary Services",
    };
  }

  /** Recent dining money movements, newest first, for the Finances ledger. */
  async diningTransactions() {
    const [orders, allocations] = await Promise.all([
      this.prisma.diningOrder.findMany({
        where: { status: { not: "cart" } },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { student: { include: { person: true } } },
      }),
      this.prisma.paymentComponentAllocation.findMany({
        where: {
          invoiceComponent: { costCenterCode: "3600" },
          payment: { status: "success" },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          payment: {
            include: { student: { include: { person: true } } },
          },
        },
      }),
    ]);

    const rows = [
      ...orders.map((o) => ({
        id: o.id,
        kind: "weekend" as const,
        student: `${o.student.person.firstName} ${o.student.person.lastName}`,
        amountXof: o.totalXof,
        status: o.status,
        when: o.createdAt,
      })),
      ...allocations.map((a) => ({
        id: a.id,
        kind: a.refundedAmountXof > 0 ? ("refund" as const) : ("plan" as const),
        student: a.payment.student
          ? `${a.payment.student.person.firstName} ${a.payment.student.person.lastName}`
          : "—",
        amountXof: a.amountXof - a.refundedAmountXof,
        status: a.payment.status,
        when: a.createdAt,
      })),
    ];
    return rows
      .sort((l, r) => r.when.getTime() - l.when.getTime())
      .slice(0, 40);
  }

  async settlement() {
    const paid = await this.prisma.diningOrder.findMany({
      where: { status: { in: ["paid", "preparing", "ready", "collected"] } },
    });
    const revenue = paid.reduce((s, o) => s + o.totalXof, 0);
    return {
      orders: paid.length,
      revenue,
      settledTo: "Cost center 3600 — Dining / Auxiliary Services",
    };
  }

  /** Meal-plan roster: every student holding a plan record + how many meals they scanned today. */
  async adminStudents() {
    const date = this.dayOnly();
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const [plans, scans] = await Promise.all([
      this.prisma.mealPlan.findMany({
        where: {
          academicYearLabel,
          student: { recordStatus: "active" },
        },
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
      academicYearLabel: p.academicYearLabel,
      term: p.term,
      scansToday: scansByStudent.get(p.studentId) ?? 0,
    }));
  }

  /**
   * Derived reporting: 7-day service trend, plan mix, weekend revenue, top-selling items.
   * The day arithmetic below stays in UTC deliberately: `dayOnly()` anchors on midnight UTC
   * of the Dakar date, so adding whole days and slicing the ISO string yields Dakar
   * calendar keys. Change that anchor and every key here shifts with it.
   */
  async adminReports() {
    const today = this.dayOnly();
    const academicYearLabel = await this.effectiveAcademicYearLabel();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);

    const [scanGroups, plans, paidOrders, itemGroups] = await Promise.all([
      this.prisma.diningScan.groupBy({
        by: ["date", "result"],
        where: { date: { gte: start } },
        _count: true,
      }),
      this.prisma.mealPlan.groupBy({
        by: ["type"],
        where: { academicYearLabel, active: true },
        _count: true,
      }),
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
        scanGroups.find(
          (g) =>
            g.date.toISOString().slice(0, 10) === key && g.result === result,
        )?._count ?? 0;
      return {
        date: key,
        served: count("served"),
        turnedAway: count("turned_away"),
      };
    });

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: itemGroups.map((g) => g.menuItemId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(menuItems.map((m) => [m.id, m.name]));

    return {
      academicYearLabel,
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
    return this.prisma.menuItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  async createMenuItem(input: {
    name: string;
    description?: string;
    category: string;
    priceXof: number;
    imageUrl?: string;
  }) {
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
    return this.prisma.menuItem.update({
      where: { id },
      data: { imageUrl: imageUrl || null },
    });
  }

  async toggleMenuItem(id: string) {
    const item = await this.prisma.menuItem.findUniqueOrThrow({
      where: { id },
    });
    return this.prisma.menuItem.update({
      where: { id },
      data: { available: !item.available },
    });
  }
}
