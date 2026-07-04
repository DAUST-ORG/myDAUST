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
  assign(@Param("id") id: string, @Body() body: { hallId: string; room: string; feeXof?: number }) {
    return this.affairs.assignRoom(id, body.hallId, body.room, body.feeXof);
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

  @Get("international")
  international() {
    return this.affairs.internationalCases();
  }

  @Post("international/:id/task")
  toggleTask(@Param("id") id: string, @Body() body: { index: number; done: boolean }) {
    return this.affairs.toggleOnboardingTask(id, body.index, body.done);
  }

  @Get("events-board")
  eventsBoard() {
    return this.affairs.eventsBoard();
  }

  @Post("events-board")
  createBoardEvent(
    @Body()
    body: {
      title: string;
      category: string;
      location: string;
      organizer: string;
      attendees?: number;
      budgetXof?: number;
      startsAt: string;
      status: string;
    },
  ) {
    return this.affairs.createBoardEvent(body);
  }

  @Get("abroad")
  abroad() {
    return this.affairs.abroadPrograms();
  }

  @Post("abroad/:id/seat")
  adjustSeat(@Param("id") id: string, @Body() body: { delta: 1 | -1 }) {
    return this.affairs.adjustAbroadSeat(id, body.delta);
  }

  @Get("maintenance")
  maintenance() {
    return this.affairs.maintenanceTickets();
  }

  @Post("maintenance")
  createMaintenance(@Body() body: { hallId: string; room?: string; kind: string; note?: string; severity: string }) {
    return this.affairs.createMaintenanceTicket(body);
  }

  @Post("maintenance/:id/resolve")
  resolveMaintenance(@Param("id") id: string) {
    return this.affairs.resolveMaintenanceTicket(id);
  }
}
