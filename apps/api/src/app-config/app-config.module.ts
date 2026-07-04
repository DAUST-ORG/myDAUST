import { Global, Module } from "@nestjs/common";
import { AppConfigController } from "./app-config.controller.js";
import { AppConfigService } from "./app-config.service.js";

// Global so admissions/finance can consume director-configured money values without import cycles.
@Global()
@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
