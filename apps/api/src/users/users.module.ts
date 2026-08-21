import { Module } from "@nestjs/common";
import { FacultyModule } from "../faculty/faculty.module.js";
import { RegistrarModule } from "../registrar/registrar.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

// Creating a student or a faculty member delegates to the module that owns that record, so
// this screen cannot produce an identity the rest of the product does not recognise.
@Module({
  imports: [FacultyModule, RegistrarModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
