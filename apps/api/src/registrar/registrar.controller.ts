import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
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
  level: z.enum(["warning", "critical"]).optional(),
});

const CalendarEventInput = z.object({
  academicYearId: z.string().min(1).max(64),
  title: z.string().min(1).max(160),
  type: z.string().max(40).default("event"),
  startsOn: z.string().min(8),
  endsOn: z.string().min(8).optional(),
  note: z.string().max(500).optional(),
});

const CalendarEventPatch = z.object({
  title: z.string().min(1).max(160).optional(),
  type: z.string().max(40).optional(),
  startsOn: z.string().min(8).optional(),
  endsOn: z.string().min(8).nullish(),
  note: z.string().max(500).nullish(),
});

const GradeRowInput = z.object({
  grade: z.string().min(1).max(20),
  points: z.number().min(0).max(5).nullish(),
  minScore: z.number().int().min(0).max(100).nullish(),
  maxScore: z.number().int().min(0).max(100).nullish(),
});
const GradeRowPatch = GradeRowInput.partial();

const RequisitesInput = z.object({
  prerequisites: z
    .array(z.object({ code: z.string().min(1).max(20), minGrade: z.string().max(4).nullish() }))
    .max(20),
  corequisites: z.array(z.string().min(1).max(20)).max(20),
});

const TermPatch = z.object({
  status: z.enum(["active", "planning", "draft"]).optional(),
  startDate: z.string().min(8).optional(),
  endDate: z.string().min(8).optional(),
  addDeadline: z.string().min(8).nullish(),
  dropDeadline: z.string().min(8).nullish(),
});

const CurriculumInput = z.object({
  programCode: z.string().min(1).max(20),
  academicYearId: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        yearIndex: z.number().int().min(1).max(8),
        semester: z.string().min(1).max(20),
        courseCode: z.string().min(1).max(20),
      }),
    )
    .max(200),
});

const nz = z.string().trim().max(160).nullish();
const CreateStudentInput = z.object({
  studentNo: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().email().max(160),
  dateOfBirth: z.string().min(8).nullish(),
  programCode: z.string().trim().max(40).nullish(),
  gender: nz, phone: nz, address: nz, city: nz, nationality: nz,
  preferredName: nz, nationalId: nz, maritalStatus: nz, personalEmail: nz,
  bloodType: nz, allergies: nz, insurance: nz, physician: nz,
  guardianName: nz, guardianPhone: nz, emergencyName2: nz, emergencyPhone2: nz,
  advisor: nz, cohort: nz, major: nz, minor: nz, admitTerm: nz, expectedGrad: nz,
  enrollmentStatus: nz, catalogYear: nz,
  yearLevel: z.number().int().min(1).max(8).nullish(),
});

const StudentDocumentInput = z.object({
  slot: z.string().trim().min(1).max(40),
  url: z.string().trim().min(1).max(500),
  name: z.string().trim().max(200).nullish(),
});

@Controller("registrar")
@Roles("admin", "registrar")
export class RegistrarController {
  constructor(private readonly registrar: RegistrarService) {}

  @Post("students")
  createStudent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.createStudent(user.personId, CreateStudentInput.parse(body));
  }

  @Get("students/:id/documents")
  listDocuments(@Param("id") id: string) {
    return this.registrar.listDocuments(id);
  }

  @Post("students/:id/documents")
  addDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = StudentDocumentInput.parse(body);
    return this.registrar.addDocument(user.personId, id, input);
  }

  @Delete("student-documents/:documentId")
  removeDocument(@CurrentUser() user: AuthUser, @Param("documentId") documentId: string) {
    return this.registrar.removeDocument(user.personId, documentId);
  }

  @Get("departments")
  departments() {
    return this.registrar.listDepartments();
  }

  @Post("departments")
  upsertDepartment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.upsertDepartment(user.personId, DepartmentInput.parse(body));
  }

  @Delete("departments/:id")
  deleteDepartment(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.registrar.deleteDepartment(user.personId, id);
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

  @Post("grading-schemes/:schemeId/rows")
  addGradeRow(@CurrentUser() user: AuthUser, @Param("schemeId") schemeId: string, @Body() body: unknown) {
    const r = GradeRowInput.parse(body);
    return this.registrar.addGradeRow(user.personId, schemeId, {
      grade: r.grade,
      points: r.points ?? null,
      minScore: r.minScore ?? null,
      maxScore: r.maxScore ?? null,
    });
  }

  @Patch("grading-schemes/rows/:rowId")
  updateGradeRow(@CurrentUser() user: AuthUser, @Param("rowId") rowId: string, @Body() body: unknown) {
    return this.registrar.updateGradeRow(user.personId, rowId, GradeRowPatch.parse(body));
  }

  @Delete("grading-schemes/rows/:rowId")
  deleteGradeRow(@CurrentUser() user: AuthUser, @Param("rowId") rowId: string) {
    return this.registrar.deleteGradeRow(user.personId, rowId);
  }

  @Get("rules")
  rules() {
    return this.registrar.listCourseRules();
  }

  @Patch("rules/:courseId")
  setRule(@CurrentUser() user: AuthUser, @Param("courseId") courseId: string, @Body() body: unknown) {
    return this.registrar.setCourseRule(user.personId, courseId, CourseRuleInput.parse(body));
  }

  @Put("rules/:courseId/requisites")
  setRequisites(@CurrentUser() user: AuthUser, @Param("courseId") courseId: string, @Body() body: unknown) {
    return this.registrar.setCourseRequisites(user.personId, courseId, RequisitesInput.parse(body));
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
  studentSuccess(
    @CurrentUser() user: AuthUser,
    @Query("minGpa") minGpa?: string,
    @Query("minAttendance") minAttendance?: string,
  ) {
    return this.registrar.studentSuccess(
      user.personId,
      minGpa ? Number(minGpa) : undefined,
      minAttendance ? Number(minAttendance) : undefined,
    );
  }

  @Post("student-success/warn")
  warn(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = WarnInput.parse(body);
    return this.registrar.warnStudent(user.personId, input.studentId, input.reason, input.level);
  }

  @Get("student-success/watching")
  watching(@CurrentUser() user: AuthUser) {
    return this.registrar.listWatching(user.personId);
  }

  @Post("student-success/watch/:studentId")
  watch(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.registrar.watchStudent(user.personId, studentId);
  }

  @Delete("student-success/watch/:studentId")
  unwatch(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.registrar.unwatchStudent(user.personId, studentId);
  }

  @Get("student-success/warnings")
  warnings() {
    return this.registrar.listWarnings();
  }

  @Get("calendar")
  calendar(@Query("academicYearId") academicYearId?: string) {
    return this.registrar.listCalendar(academicYearId);
  }

  @Post("calendar")
  createCalendarEvent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registrar.createCalendarEvent(user.personId, CalendarEventInput.parse(body));
  }

  @Patch("calendar/:id")
  updateCalendarEvent(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.registrar.updateCalendarEvent(user.personId, id, CalendarEventPatch.parse(body));
  }

  @Delete("calendar/:id")
  deleteCalendarEvent(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.registrar.deleteCalendarEvent(user.personId, id);
  }

  @Get("terms")
  terms() {
    return this.registrar.listTerms();
  }

  @Patch("terms/:id")
  updateTerm(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.registrar.updateTerm(user.personId, id, TermPatch.parse(body));
  }

  @Get("curriculum")
  curriculum(@Query("programCode") programCode: string, @Query("academicYearId") academicYearId: string) {
    return this.registrar.getCurriculum(programCode, academicYearId);
  }

  @Put("curriculum")
  saveCurriculum(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CurriculumInput.parse(body);
    return this.registrar.saveCurriculum(user.personId, input.programCode, input.academicYearId, input.entries);
  }
}
