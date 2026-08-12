import { Body, Controller, Get, Put } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import {
  DIRECTOR_WIDGET_KEYS,
  FinanceApprovalsService,
} from "./finance-approvals.service.js";
import { FinanceService } from "./finance.service.js";

const WidgetKey = z.enum(DIRECTOR_WIDGET_KEYS);
const WidgetPreferenceInput = z.object({
  widgetKeys: z.array(WidgetKey).max(DIRECTOR_WIDGET_KEYS.length),
});

@Controller("director")
@Roles("admin")
export class DirectorController {
  constructor(
    private readonly finance: FinanceService,
    private readonly approvals: FinanceApprovalsService,
  ) {}

  @Get("overview")
  overview() {
    return this.finance.directorPortalOverview();
  }

  @Get("widgets")
  widgets(@CurrentUser() user: AuthUser) {
    return this.approvals.getDirectorWidgets(user.personId);
  }

  @Put("widgets")
  updateWidgets(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.approvals.setDirectorWidgets(
      user.personId,
      WidgetPreferenceInput.parse(body).widgetKeys,
    );
  }
}
