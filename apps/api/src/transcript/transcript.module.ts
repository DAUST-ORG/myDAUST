import { Module } from "@nestjs/common";
import {
  RegistrarTranscriptController,
  StudentTranscriptController,
} from "./transcript.controller.js";
import { TranscriptService } from "./transcript.service.js";

@Module({
  controllers: [StudentTranscriptController, RegistrarTranscriptController],
  providers: [TranscriptService],
  exports: [TranscriptService],
})
export class TranscriptModule {}
