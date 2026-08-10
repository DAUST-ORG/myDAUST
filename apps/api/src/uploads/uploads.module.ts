import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller.js";
import { UploadsStorage } from "./uploads.storage.js";

@Module({
  controllers: [UploadsController],
  providers: [UploadsStorage],
})
export class UploadsModule {}
