import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { RegistrarService } from "./registrar.service.js";

// Local zod (the api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const DepartmentInput = z.object({
  id: z.string().min(1).max(64).optional(),
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(120),
  head: z.string().max(120).nullish(),
});

const AcademicYearInput = z.object({ label: z.string().min(4).max(20) });

const CourseRuleInput = z.object({
  standingRequired: z.string().max(60).nullish(),
  majorRestriction: z.string().max(120).nullish(),
  capacity: z.number().int().min(0).max(1000).nullish(),
  waitlistEnabled: z.boolean().optional(),
});

const GradeDecisionInput = z.object({
  decision: z.enum(["approved", "returned"]),
  note: z.string().max(500).optional(),
});

const WarnInput = z.object({
  studentId: z.string().min(1).max(64),
  reason: z.string().min(1).max(300),
});

const CalendarEventInput = z.object({
  academicYearId: z.string().min(1).max(64),
  title: z.string().min(1).max(160),
  type: z.string().max(40).default("event"),
  startsOn: z.string().min(8),
  endsOn: z.string().min(8).optional(),
  note: z.string().max(500).optional(),
});

@Controller("registrar")
@Roles("admin", "registrar")
export class RegistrarController {
  constructor(private readonly registrar: RegistrarService) {}

  @Get("departments")
  departments() {
    return this.registrar.listDepartments();
  }

  @Post("departments")
  upsertDepartment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.upsertDepartment(user.personId, DepartmentInput.parse(body));
  }

  @Get("academic-years")
  academicYears() {
    return this.registrar.listAcademicYears();
  }

  @Post("academic-years")
  createAcademicYear(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.createAcademicYear(user.personId, AcademicYearInput.parse(body).label);
  }

  @Post("academic-years/:id/activate")
  activateAcademicYear(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.registrar.activateAcademicYear(user.personId, id);
  }

  @Get("grading-schemes")
  gradingSchemes() {
    return this.registrar.listGradingSchemes();
  }

  @Get("rules")
  rules() {
    return this.registrar.listCourseRules();
  }

  @Patch("rules/:courseId")
  setRule(@CurrentUser() user: AuthUser, @Param("courseId") courseId: string, @Body() body: unknown) {
    return this.registrar.setCourseRule(user.personId, courseId, CourseRuleInput.parse(body));
  }

  @Get("grade-approvals")
  gradeApprovals() {
    return this.registrar.listGradeSubmissions();
  }

  @Post("grade-approvals/:id/decide")
  decide(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = GradeDecisionInput.parse(body);
    return this.registrar.decideGradeSubmission(user.personId, id, input.decision, input.note);
  }

  @Get("student-success")
  studentSuccess(@Query("minGpa") minGpa?: string, @Query("minAttendance") minAttendance?: string) {
    return this.registrar.studentSuccess(
      minGpa ? Number(minGpa) : undefined,
      minAttendance ? Number(minAttendance) : undefined,
    );
  }

  @Post("student-success/warn")
  warn(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = WarnInput.parse(body);
    return this.registrar.warnStudent(user.personId, input.studentId, input.reason);
  }

  @Get("calendar")
  calendar(@Query("academicYearId") academicYearId?: string) {
    return this.registrar.listCalendar(academicYearId);
  }

  @Post("calendar")
  createCalendarEvent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.createCalendarEvent(user.personId, CalendarEventInput.parse(body));
  }
}
