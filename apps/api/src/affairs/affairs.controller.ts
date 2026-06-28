import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Roles } from "../auth/decorators.js";
import { AffairsService } from "./affairs.service.js";

@Controller("affairs")
@Roles("student_affairs", "admin")
export class AffairsController {
  constructor(private readonly affairs: AffairsService) {}

  @Get("dashboard")
  dashboard() {
    return this.affairs.dashboard();
  }

  @Get("halls")
  halls() {
    return this.affairs.halls();
  }

  @Get("housing/roster")
  roster() {
    return this.affairs.roster();
  }

  @Get("housing/requests")
  requests() {
    return this.affairs.requests();
  }

  @Post("housing/:id/assign")
  assign(@Param("id") id: string, @Body() body: { hallId: string; room: string }) {
    return this.affairs.assignRoom(id, body.hallId, body.room);
  }

  @Get("roommate/subjects")
  roommateSubjects() {
    return this.affairs.roommateSubjects();
  }

  @Get("roommate/matches")
  roommateMatches(@Query("studentId") studentId: string) {
    return this.affairs.roommateMatches(studentId);
  }

  @Get("conduct")
  conduct() {
    return this.affairs.conductCases();
  }

  @Post("conduct")
  createConduct(@Body() body: { subject: string; type: string; severity: string }) {
    return this.affairs.createConductCase(body);
  }

  @Post("conduct/:id/advance")
  advanceConduct(@Param("id") id: string, @Body() body: { stage: string }) {
    return this.affairs.advanceConduct(id, body.stage);
  }

  @Get("clubs")
  clubs() {
    return this.affairs.clubs();
  }

  @Post("clubs/:id/status")
  setClubStatus(@Param("id") id: string, @Body() body: { status: string }) {
    return this.affairs.setClubStatus(id, body.status);
  }

  @Get("budget")
  budget() {
    return this.affairs.budget();
  }
}
