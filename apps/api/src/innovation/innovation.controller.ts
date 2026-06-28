import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { InnovationService } from "./innovation.service.js";

@Controller("innovation")
export class InnovationController {
  constructor(private readonly innovation: InnovationService) {}

  // Student / project member
  @Get("my/project")
  @Roles("student")
  myProject(@CurrentUser() user: AuthUser) {
    return this.innovation.myProject(user.personId);
  }

  @Post("tasks/:id/toggle")
  @Roles("student")
  toggleTask(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.innovation.toggleTask(id, user.personId);
  }

  @Post("projects/:id/submit")
  @Roles("student")
  submit(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { title: string; kind: string; fileUrl?: string; fileName?: string }) {
    return this.innovation.submit(id, user.personId, body);
  }

  // Admin (innovation studio)
  @Get("admin/overview")
  @Roles("innovation", "admin")
  overview() {
    return this.innovation.adminOverview();
  }

  @Get("admin/projects")
  @Roles("innovation", "admin")
  projects() {
    return this.innovation.adminProjects();
  }

  @Get("admin/review-queue")
  @Roles("innovation", "admin")
  reviewQueue() {
    return this.innovation.reviewQueue();
  }

  @Get("admin/projects/:id")
  @Roles("innovation", "admin")
  detail(@Param("id") id: string) {
    return this.innovation.projectDetail(id);
  }

  @Post("admin/projects/:id/advance")
  @Roles("innovation", "admin")
  advance(@Param("id") id: string) {
    return this.innovation.advancePhase(id);
  }

  @Post("admin/submissions/:id/grade")
  @Roles("innovation", "admin")
  grade(@Param("id") id: string, @Body() body: { grade: string; feedback?: string }) {
    return this.innovation.gradeSubmission(id, body.grade, body.feedback);
  }
}
