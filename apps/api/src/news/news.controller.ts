import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { NewsArticleInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { NewsService } from "./news.service.js";

@Controller("news")
export class NewsController {
  constructor(private readonly news: NewsService) {}

  /** Public: published article list (no body) for the site's News section. */
  @Public()
  @Get()
  list() {
    return this.news.publishedList();
  }

  /** Public: one published article (full body) for the article view. */
  @Public()
  @Get("article/:slug")
  bySlug(@Param("slug") slug: string) {
    return this.news.publishedBySlug(slug);
  }

  @Get("admin")
  @Roles("communications", "admin")
  adminList() {
    return this.news.adminList();
  }

  @Post()
  @Roles("communications", "admin")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.news.create(NewsArticleInput.parse(body), user.personId);
  }

  @Patch(":id")
  @Roles("communications", "admin")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.news.update(id, NewsArticleInput.parse(body), user.personId);
  }

  @Delete(":id")
  @Roles("communications", "admin")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.news.remove(id, user.personId);
  }
}
