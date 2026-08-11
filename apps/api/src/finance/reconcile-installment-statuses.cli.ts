import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { FinanceService } from "./finance.service.js";

const EVENT = "installment-status-reconciliation";

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: false,
  });
  try {
    return await app.get(FinanceService).markOverdueInstallments();
  } finally {
    await app.close();
  }
}

void main()
  .then((changedCount) => {
    console.log(JSON.stringify({ event: EVENT, ok: true, changedCount }));
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: EVENT,
        ok: false,
        changedCount: null,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
