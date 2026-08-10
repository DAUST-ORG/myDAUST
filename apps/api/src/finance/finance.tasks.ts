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

  // Surfaces stale pendings for bursar review — never auto-cancels (a lost IPN does not mean
  // the customer didn't pay; the bursar verifies in the PayTech dashboard then confirms/cancels).
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcile(): Promise<void> {
    const stale = await this.finance.listStalePendingPayments(60);
    if (stale.length > 0) this.log.warn(`${stale.length} stale pending payment(s) need bursar review`);
  }

  /**
   * Poll PI-SPI for requests whose webhook never landed. Unlike the PayTech sweep above
   * this one does settle: the rail is the authority on whether a request-to-pay was
   * approved, so a lost notification must not leave a paid invoice showing a balance.
   * No-ops when PI-SPI is unconfigured.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePiSpi(): Promise<void> {
    try {
      const changed = await this.finance.reconcilePiSpiRequests();
      if (changed > 0) this.log.log(`Reconciled ${changed} PI-SPI request(s)`);
    } catch (err) {
      this.log.error(
        `PI-SPI reconciliation failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
