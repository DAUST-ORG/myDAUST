import { Module } from "@nestjs/common";
import { FacultyController } from "./faculty.controller.js";
import { FacultyService } from "./faculty.service.js";

@Module({
  controllers: [FacultyController],
  providers: [FacultyService],
  // UsersModule delegates faculty creation here rather than duplicating it.
  exports: [FacultyService],
})
export class FacultyModule {}
