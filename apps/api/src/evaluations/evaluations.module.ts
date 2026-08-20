import { Module } from "@nestjs/common";
import { EvaluationsController } from "./evaluations.controller.js";
import { EvaluationsService } from "./evaluations.service.js";

@Module({
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
