import { Module } from "@nestjs/common";
import { AffairsController } from "./affairs.controller.js";
import { AffairsService } from "./affairs.service.js";

@Module({
  controllers: [AffairsController],
  providers: [AffairsService],
})
export class AffairsModule {}
