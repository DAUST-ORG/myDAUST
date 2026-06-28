import { Module } from "@nestjs/common";
import { InnovationController } from "./innovation.controller.js";
import { InnovationService } from "./innovation.service.js";

@Module({
  controllers: [InnovationController],
  providers: [InnovationService],
})
export class InnovationModule {}
