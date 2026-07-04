import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
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

  @Post("admin/projects/:id/members")
  @Roles("innovation", "admin")
  addMember(@Param("id") id: string, @Body() body: { email: string; role?: string }) {
    return this.innovation.addMember(id, body.email, body.role ?? "member");
  }

  @Delete("admin/projects/:id/members/:personId")
  @Roles("innovation", "admin")
  removeMember(@Param("id") id: string, @Param("personId") personId: string) {
    return this.innovation.removeMember(id, personId);
  }

  @Get("my/project/global-tasks")
  @Roles("student")
  myGlobalTasks(@CurrentUser() user: AuthUser) {
    return this.innovation.myProjectGlobalTasks(user.personId);
  }

  @Get("admin/global-tasks")
  @Roles("innovation", "admin")
  globalTasks() {
    return this.innovation.globalTasksOverview();
  }

  @Post("admin/global-tasks")
  @Roles("innovation", "admin")
  createGlobalTask(@Body() body: { title: string; kind?: string; dueDate?: string }) {
    return this.innovation.createGlobalTask(body);
  }

  @Get("admin/projects/:id/global-tasks")
  @Roles("innovation", "admin")
  projectGlobalTasks(@Param("id") id: string) {
    return this.innovation.projectGlobalTasks(id);
  }

  @Post("admin/global-tasks/:taskId/projects/:projectId/toggle")
  @Roles("innovation", "admin")
  toggleGlobalTask(@Param("taskId") taskId: string, @Param("projectId") projectId: string) {
    return this.innovation.toggleGlobalTaskStatus(taskId, projectId);
  }

  @Post("admin/projects/:id/advisor")
  @Roles("innovation", "admin")
  setAdvisor(@Param("id") id: string, @Body() body: { advisor: string }) {
    return this.innovation.setAdvisor(id, body.advisor ?? "");
  }
}
