import { Module } from "@nestjs/common";
import { FormsController } from "./forms.controller.js";
import { FormsService } from "./forms.service.js";
import { FormThrottleGuard } from "./form-throttle.guard.js";

@Module({
  controllers: [FormsController],
  providers: [FormsService, FormThrottleGuard],
  exports: [FormsService],
})
export class FormsModule {}
