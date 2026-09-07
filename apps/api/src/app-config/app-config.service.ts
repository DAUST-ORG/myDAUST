import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FEE_STRUCTURE,
  type UpdateFeeInput,
  type EmailTemplatesInput,
  DEFAULT_EMAIL_TEMPLATES,
} from "@mydaust/shared";
import { Prisma } from "@mydaust/db";
import { PrismaService } from "../prisma/prisma.service.js";

/** Seed rows derived from the former hardcoded constants. Created once; director edits win after that. */
const DEFAULT_FEES = [
  {
    key: "tuition",
    label: "Tuition",
    minXof: FEE_STRUCTURE.tuitionPerYear,
    maxXof: null,
    period: "year",
    note: "Half per semester · monthly installments available",
    sortOrder: 0,
  },
  {
    key: "housing",
    label: "Housing",
    minXof: FEE_STRUCTURE.housingPerYear,
    maxXof: null,
    period: "year",
    note: "Optional · on-campus residence",
    sortOrder: 1,
  },
  {
    key: "cafeteria",
    label: "Cafeteria",
    minXof: FEE_STRUCTURE.cafeteriaPerYear,
    maxXof: null,
    period: "year",
    note: "Optional · full pension meal plan",
    sortOrder: 2,
  },
  {
    key: "application_fee",
    label: "Application Fee",
    minXof: FEE_STRUCTURE.applicationFee,
    maxXof: null,
    period: "one-time",
    note: "One-time, paid with your application",
    sortOrder: 3,
  },
  {
    key: "insurance",
    label: "Insurance",
    minXof: FEE_STRUCTURE.insurancePerYear,
    maxXof: null,
    period: "year",
    note: "Annual student insurance",
    sortOrder: 4,
  },
];

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent across concurrent API processes: seed each empty configuration
   * table once without touching director-edited or intentionally partial rows.
   */
  private async ensureSeeded() {
    await this.prisma.$transaction(async (tx) => {
      // A transaction-scoped advisory lock serializes only this tiny bootstrap
      // section across every API process.
      await tx.$queryRaw<Array<{ locked: number }>>(
        Prisma.sql`
          SELECT 1::int AS "locked"
          FROM (
            SELECT pg_advisory_xact_lock(hashtext('mydaust.app-config.defaults'))
          ) AS config_seed_lock
        `,
      );
      // Preserve the original seed-only-when-the-table-is-empty policy: a
      // deliberate deletion/partial director configuration is never repaired
      // implicitly by a read.
      if ((await tx.feeItem.count()) === 0) {
        await tx.feeItem.createMany({ data: DEFAULT_FEES });
      }
    });
  }

  async fees() {
    await this.ensureSeeded();
    const [fees, schedule] = await Promise.all([
      this.prisma.feeItem.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.feeSchedule.findFirst({
        where: { status: "approved", academicYear: { status: "active" } },
        orderBy: { revision: "desc" },
        include: { components: true },
      }),
    ]);
    const annual = new Map(
      (schedule?.components ?? []).map((row) => [row.key, row.annualAmountXof]),
    );
    return fees.map((fee) =>
      annual.has(fee.key)
        ? {
            ...fee,
            minXof: annual.get(fee.key)!,
            maxXof: null,
            managedBy: "fee_schedule" as const,
            editable: false,
          }
        : { ...fee, managedBy: "settings" as const, editable: true },
    );
  }

  /** Public: the real SIS programs, so the vitrine apply form offers exactly what exists. */
  async programs(): Promise<{ code: string; name: string }[]> {
    return this.prisma.program.findMany({
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  // --- New-application notification recipients (AppSetting singleton) ---
  private static readonly NOTIFY_KEY = "application_notification_recipients";
  private static readonly DEFAULT_RECIPIENTS = ["sndao@daust.org"];

  async applicationNotificationRecipients(): Promise<string[]> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: AppConfigService.NOTIFY_KEY },
    });
    const val = row?.valueJson as { recipients?: string[] } | null | undefined;
    return val?.recipients?.length
      ? val.recipients
      : AppConfigService.DEFAULT_RECIPIENTS;
  }

  async setNotificationRecipients(recipients: string[], actorId: string) {
    await this.prisma.appSetting.upsert({
      where: { key: AppConfigService.NOTIFY_KEY },
      create: { key: AppConfigService.NOTIFY_KEY, valueJson: { recipients } },
      update: { valueJson: { recipients } },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "AppSetting",
        entityId: AppConfigService.NOTIFY_KEY,
        action: "notification-recipients-updated",
        actorId,
        data: { count: recipients.length },
      },
    });
    return { recipients };
  }

  // --- Email Templates (AppSetting singleton) ---
  private static readonly EMAIL_TEMPLATES_KEY = "email_templates";

  async emailTemplates(): Promise<EmailTemplatesInput> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: AppConfigService.EMAIL_TEMPLATES_KEY },
    });
    const val = row?.valueJson as
      Partial<EmailTemplatesInput> | null | undefined;
    return { ...DEFAULT_EMAIL_TEMPLATES, ...val };
  }

  async setEmailTemplates(templates: EmailTemplatesInput, actorId: string) {
    await this.prisma.appSetting.upsert({
      where: { key: AppConfigService.EMAIL_TEMPLATES_KEY },
      create: {
        key: AppConfigService.EMAIL_TEMPLATES_KEY,
        valueJson: templates,
      },
      update: { valueJson: templates },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "AppSetting",
        entityId: AppConfigService.EMAIL_TEMPLATES_KEY,
        action: "email-templates-updated",
        actorId,
        data: templates,
      },
    });
    return templates;
  }

  // --- Applicant plan picking (AppSetting singleton) ---
  private static readonly PLAN_PICKING_KEY = "admissions.plan_picking";

  async planPicking(): Promise<{ enabled: boolean; deadline: string | null }> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: AppConfigService.PLAN_PICKING_KEY },
    });
    const val = row?.valueJson as
      | { enabled?: boolean; deadline?: string | null }
      | null
      | undefined;
    return {
      enabled: val?.enabled ?? false,
      deadline: val?.deadline ?? null,
    };
  }

  async setPlanPicking(
    config: { enabled: boolean; deadline: string | null },
    actorId: string,
  ) {
    await this.prisma.appSetting.upsert({
      where: { key: AppConfigService.PLAN_PICKING_KEY },
      create: { key: AppConfigService.PLAN_PICKING_KEY, valueJson: config },
      update: { valueJson: config },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "AppSetting",
        entityId: AppConfigService.PLAN_PICKING_KEY,
        action: "plan-picking-updated",
        actorId,
        data: config,
      },
    });
    return config;
  }

  /** Current application fee (fixed amount) for checkout + revenue derivation. */
  async applicationFee(): Promise<number> {
    await this.ensureSeeded();
    const row = await this.prisma.feeItem.findUnique({
      where: { key: "application_fee" },
    });
    return row?.minXof ?? FEE_STRUCTURE.applicationFee;
  }

  async updateFee(key: string, patch: UpdateFeeInput, actorId: string) {
    const scheduleManaged = await this.prisma.feeScheduleComponent.findFirst({
      where: {
        key,
        schedule: {
          status: "approved",
          academicYear: { status: "active" },
        },
      },
      select: { id: true },
    });
    if (scheduleManaged) {
      throw new BadRequestException(
        "Annual student charges are managed in Fees & Payment Schedule and require the finance approval workflow",
      );
    }
    const existing = await this.prisma.feeItem.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException("Unknown fee item");
    if (
      patch.maxXof != null &&
      patch.minXof != null &&
      patch.maxXof < patch.minXof
    ) {
      throw new BadRequestException("maxXof must be ≥ minXof");
    }
    const updated = await this.prisma.feeItem.update({
      where: { key },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.minXof !== undefined ? { minXof: patch.minXof } : {}),
        ...(patch.maxXof !== undefined ? { maxXof: patch.maxXof } : {}),
        ...(patch.period !== undefined ? { period: patch.period } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "FeeItem",
        entityId: key,
        action: "fee-updated",
        actorId,
        data: { from: existing, to: patch },
      },
    });
    return updated;
  }
}
