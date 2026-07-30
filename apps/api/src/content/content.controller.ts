import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { SiteOverridesInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { ContentService } from "./content.service.js";

@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** Public: the vitrine fetches the published override doc at load, no auth. */
  @Public()
  @Get("published")
  published() {
    return this.content.published();
  }

  @Get("draft")
  @Roles("communications", "admin")
  draft() {
    return this.content.draft();
  }

  /** Public: token-gated draft for cross-domain preview (token acts as the capability). */
  @Public()
  @Get("preview/:token")
  preview(@Param("token") token: string) {
    return this.content.byPreviewToken(token);
  }

  @Post("preview")
  @Roles("communications", "admin")
  makePreview(@CurrentUser() user: AuthUser) {
    return this.content.setPreview(user.personId);
  }

  @Put("draft")
  @Roles("communications", "admin")
  save(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.content.saveDraft(SiteOverridesInput.parse(body), user.personId);
  }

  @Post("publish")
  @Roles("communications", "admin")
  publish(@CurrentUser() user: AuthUser) {
    return this.content.publish(user.personId);
  }
}
