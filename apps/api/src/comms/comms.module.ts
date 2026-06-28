import { Module } from "@nestjs/common";
import { CommsController } from "./comms.controller.js";
import { CommsService } from "./comms.service.js";

@Module({
  controllers: [CommsController],
  providers: [CommsService],
})
export class CommsModule {}
