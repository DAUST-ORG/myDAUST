import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AcademicsModule } from "./academics/academics.module.js";
import { AdmissionsModule } from "./admissions/admissions.module.js";
import { AppConfigModule } from "./app-config/app-config.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CampusModule } from "./campus/campus.module.js";
import { DiningModule } from "./dining/dining.module.js";
import { HrModule } from "./hr/hr.module.js";
import { MailModule } from "./mail/mail.module.js";
import { CommsModule } from "./comms/comms.module.js";
import { ConfigModule } from "./config/config.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { GuardiansModule } from "./guardians/guardians.module.js";
import { HealthController } from "./health.controller.js";
import { NavModule } from "./nav/nav.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RegistrarModule } from "./registrar/registrar.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    MailModule,
    AppConfigModule,
    AuthModule,
    NavModule,
    FinanceModule,
    GuardiansModule,
    RegistrarModule,
    AcademicsModule,
    CommsModule,
    CampusModule,
    AdmissionsModule,
    DiningModule,
    HrModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
