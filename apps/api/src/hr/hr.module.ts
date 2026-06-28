import { Module } from "@nestjs/common";
import { HrController } from "./hr.controller.js";
import { HrService } from "./hr.service.js";

@Module({
  controllers: [HrController],
  providers: [HrService],
})
export class HrModule {}
