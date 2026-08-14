import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DAKAR_TIME_ZONE } from "@mydaust/shared";
import { FinanceService } from "./finance.service.js";

/** Background finance jobs. (Wire Sentry cron monitors around these when Sentry lands.) */
@Injectable()
export class FinanceTasks {
  private readonly log = new Logger(FinanceTasks.name);

  constructor(private readonly finance: FinanceService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: DAKAR_TIME_ZONE })
  async markOverdue(): Promise<void> {
    const n = await this.finance.markOverdueInstallments();
    if (n > 0) this.log.log(`Reconciled ${n} installment status row(s)`);
  }

  /**
   * Poll PI-SPI for requests whose webhook never landed. The rail is the authority on
   * whether a request-to-pay was
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
