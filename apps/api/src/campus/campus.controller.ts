import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Public, Roles } from "../auth/decorators.js";
import { CampusService } from "./campus.service.js";

const CreateLibraryItemSchema = z.object({
  title: z.string().min(1).max(300),
  author: z.string().min(1).max(200).optional(),
  kind: z.enum(["book", "journal", "ebook", "database"]),
  subject: z.string().min(1).max(120).optional(),
  callNumber: z.string().min(1).max(60).optional(),
});

@Controller("campus")
export class CampusController {
  constructor(private readonly campus: CampusService) {}

  @Public()
  @Get("announcements")
  announcements(@Query("audience") audience?: string) {
    return this.campus.announcements(audience);
  }

  @Get("events")
  events() {
    return this.campus.events();
  }

  @Get("library")
  library(@Query("q") q?: string) {
    return this.campus.library(q);
  }

  @Post("library")
  @Roles("admin", "registrar")
  createLibraryItem(@Body() body: unknown) {
    return this.campus.createLibraryItem(CreateLibraryItemSchema.parse(body));
  }

  @Post("library/:id/toggle")
  @Roles("admin", "registrar")
  toggleLibraryItem(@Param("id") id: string) {
    return this.campus.toggleLibraryItem(id);
  }
}
