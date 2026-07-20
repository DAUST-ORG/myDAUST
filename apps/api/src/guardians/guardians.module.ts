import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module.js";
import { MailModule } from "../mail/mail.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import {
  GuardianInvitesController,
  GuardiansController,
  ParentController,
} from "./guardians.controller.js";
import { GuardiansService } from "./guardians.service.js";

@Module({
  imports: [PrismaModule, MailModule, FinanceModule],
  controllers: [GuardiansController, GuardianInvitesController, ParentController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
