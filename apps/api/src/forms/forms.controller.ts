import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  Header,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { CreateCustomFormInput, AuthRespondInput, PublicRespondInput } from "@mydaust/shared";
import { Public } from "../auth/decorators.js";
import { CurrentUser, type AuthUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FormsService } from "./forms.service.js";
import { FormThrottleGuard } from "./form-throttle.guard.js";

const IdParam = z.object({ id: z.string().uuid() });
const TokenParam = z.object({ token: z.string().min(1) });
const RidParam = z.object({ id: z.string().uuid(), rid: z.string().uuid() });

@Controller("forms")
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  // ─── Registrar CRUD ─────────────────────────────────────────────────────

  @Post()
  @Roles("registrar", "admin")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateCustomFormInput.parse(body);
    return this.forms.create(user, input);
  }

  @Get()
  @Roles("registrar", "admin")
  list(@CurrentUser() user: AuthUser) {
    return this.forms.list(user);
  }

  @Get(":id")
  @Roles("registrar", "admin")
  getDetail(@Param() params: unknown) {
    const { id } = IdParam.parse(params);
    return this.forms.getDetail(id);
  }

  @Put(":id")
  @Roles("registrar", "admin")
  update(@Param() params: unknown, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { id } = IdParam.parse(params);
    const input = CreateCustomFormInput.parse(body);
    return this.forms.update(id, user, input);
  }

  @Post(":id/publish")
  @Roles("registrar", "admin")
  publish(@Param() params: unknown, @CurrentUser() user: AuthUser) {
    const { id } = IdParam.parse(params);
    return this.forms.publish(id, user);
  }

  @Post(":id/close")
  @Roles("registrar", "admin")
  close(@Param() params: unknown, @CurrentUser() user: AuthUser) {
    const { id } = IdParam.parse(params);
    return this.forms.close(id, user);
  }

  @Delete(":id")
  @Roles("registrar", "admin")
  deleteForm(@Param() params: unknown, @CurrentUser() user: AuthUser) {
    const { id } = IdParam.parse(params);
    return this.forms.deleteForm(id, user);
  }

  // ─── Responses (registrar view) ─────────────────────────────────────────

  @Get(":id/responses")
  @Roles("registrar", "admin")
  listResponses(@Param() params: unknown) {
    const { id } = IdParam.parse(params);
    return this.forms.listResponses(id);
  }

  @Get(":id/responses/:rid")
  @Roles("registrar", "admin")
  getResponse(@Param() params: unknown) {
    const { id, rid } = RidParam.parse(params);
    return this.forms.getResponse(id, rid);
  }

  @Get(":id/export")
  @Roles("registrar", "admin")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="responses.csv"')
  async exportCsv(@Param() params: unknown, @Res() res: Response) {
    const { id } = IdParam.parse(params);
    const csv = await this.forms.exportCsv(id);
    res.send(csv);
  }

  // ─── Public form access ─────────────────────────────────────────────────

  @Public()
  @Get("public/:token")
  getPublicForm(@Param() params: unknown) {
    const { token } = TokenParam.parse(params);
    return this.forms.getPublicForm(token);
  }

  @Public()
  @UseGuards(FormThrottleGuard)
  @Post("public/:token/respond")
  respondPublic(@Param() params: unknown, @Body() body: unknown) {
    const { token } = TokenParam.parse(params);
    const input = PublicRespondInput.parse(body);
    return this.forms.respondPublic(token, input);
  }

  @Public()
  @UseGuards(FormThrottleGuard)
  @Put("public/:token/respond/:rid")
  editPublicResponse(
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ token: z.string(), rid: z.string().uuid() }).parse(params);
    const input = PublicRespondInput.parse(body);
    return this.forms.editPublicResponse(parsed.token, parsed.rid, input);
  }

  // ─── Auth form access ───────────────────────────────────────────────────

  @Get(":id/respond")
  getFormForRespondent(@Param() params: unknown, @CurrentUser() user: AuthUser) {
    const { id } = IdParam.parse(params);
    return this.forms.getFormForRespondent(id, user);
  }

  @Post(":id/respond")
  respondAuth(@Param() params: unknown, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { id } = IdParam.parse(params);
    const input = AuthRespondInput.parse(body);
    return this.forms.respondAuth(id, user, input);
  }

  @Put(":id/respond/:rid")
  editAuthResponse(
    @Param() params: unknown,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const { id, rid } = RidParam.parse(params);
    const input = AuthRespondInput.parse(body);
    return this.forms.editAuthResponse(id, rid, user, input);
  }
}
