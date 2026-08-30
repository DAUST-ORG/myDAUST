import { Module } from "@nestjs/common";
import { InfirmaryController } from "./infirmary.controller.js";
import { InfirmaryService } from "./infirmary.service.js";
import { SicknessFlagController } from "./sickness-flag.controller.js";
import { SicknessFlagService } from "./sickness-flag.service.js";

@Module({
  controllers: [InfirmaryController, SicknessFlagController],
  providers: [InfirmaryService, SicknessFlagService],
})
export class InfirmaryModule {}
