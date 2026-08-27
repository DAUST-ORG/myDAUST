import { Module } from "@nestjs/common";
import { InfirmaryController } from "./infirmary.controller.js";
import { InfirmaryService } from "./infirmary.service.js";

@Module({
  controllers: [InfirmaryController],
  providers: [InfirmaryService],
})
export class InfirmaryModule {}
