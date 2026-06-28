import { Module } from "@nestjs/common";
import { DiningController } from "./dining.controller.js";
import { DiningService } from "./dining.service.js";

@Module({
  controllers: [DiningController],
  providers: [DiningService],
})
export class DiningModule {}
