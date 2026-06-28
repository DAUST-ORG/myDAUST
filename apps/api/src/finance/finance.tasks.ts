import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { FinanceService } from "./finance.service.js";

/** Background finance jobs. (Wire Sentry cron monitors around these when Sentry lands.) */
@Injectable()
export class FinanceTasks {
  private readonly log = new Logger(FinanceTasks.name);

  constructor(private readonly finance: FinanceService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdue(): Promise<void> {
    const n = await this.finance.markOverdueInstallments();
    if (n > 0) this.log.log(`Marked ${n} installment(s) overdue`);
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcile(): Promise<void> {
    const n = await this.finance.reconcileStalePayments(60);
    if (n > 0) this.log.log(`Reconciled ${n} stale pending payment(s)`);
  }
}
