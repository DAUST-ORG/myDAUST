import { Controller, Get, Query } from "@nestjs/common";
import { CampusService } from "./campus.service.js";

@Controller("campus")
export class CampusController {
  constructor(private readonly campus: CampusService) {}

  @Get("events")
  events() {
    return this.campus.events();
  }

  @Get("library")
  library(@Query("q") q?: string) {
    return this.campus.library(q);
  }
}
