import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { CampusService } from "./campus.service.js";

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
}
