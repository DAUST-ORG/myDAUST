import { existsSync, mkdirSync } from "node:fs";
import { Module } from "@nestjs/common";
import { UPLOADS_DIR } from "./uploads.constants.js";
import { UploadsController } from "./uploads.controller.js";

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
