import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  CreateAssignmentInput,
  DropInput,
  EnrollInput,
  GradeSubmissionInput,
  MarkAttendanceInput,
  SubmitAssignmentInput,
  SubmitGradesInput,
} from "@mydaust/shared";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AcademicsService } from "./academics.service.js";

const CreateMaterialInput = z.object({
  title: z.string().min(1).max(200),
  kind: z.string().min(1).max(40),
  fileUrl: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
});

const CreatePostInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

const CreateProgramInput = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  departmentId: z.string().min(1),
});

const CreateCourseInput = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(160),
  credits: z.number().int().min(1).max(12),
  departmentId: z.string().min(1),
});

const UpdateStudentInput = z.object({
  fullName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  programCode: z.string().max(20).nullable().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.string().max(20).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  nationality: z.string().max(80).nullable().optional(),
  guardianName: z.string().max(120).nullable().optional(),
  guardianRelation: z.string().max(40).nullable().optional(),
  guardianPhone: z.string().max(40).nullable().optional(),
  advisor: z.string().max(120).nullable().optional(),
  yearLevel: z.number().int().min(1).max(8).nullable().optional(),
  cohort: z.string().max(40).nullable().optional(),
});

@Controller("academics")
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get("current-term")
  currentTerm() {
    return this.academics.currentTerm();
  }

  @Get("sections")
  sections(@Query("termId") termId: string) {
    return this.academics.listSections(termId);
  }

  @Get("my/enrollments")
  @Roles("student")
  myEnrollments(@CurrentUser() user: AuthUser) {
    return this.academics.myEnrollments(user.studentId!);
  }

  @Get("my/summary")
  @Roles("student")
  mySummary(@CurrentUser() user: AuthUser) {
    return this.academics.mySummary(user.studentId!);
  }

  @Get("my/grades")
  @Roles("student")
  myGrades(@CurrentUser() user: AuthUser) {
    return this.academics.myGrades(user.studentId!);
  }

  @Get("admin/stats")
  @Roles("admin", "registrar", "bursar")
  adminStats() {
    return this.academics.adminStats();
  }

  @Get("admin/students")
  @Roles("admin", "registrar", "bursar")
  adminStudents() {
    return this.academics.adminStudents();
  }

  @Get("admin/students/:id")
  @Roles("admin", "registrar", "bursar")
  adminStudentDetail(@Param("id") id: string) {
    return this.academics.adminStudentDetail(id);
  }

  @Get("admin/students/:id/activity")
  @Roles("admin", "registrar", "bursar")
  adminStudentActivity(@Param("id") id: string) {
    return this.academics.adminStudentActivity(id);
  }

  @Patch("admin/students/:id")
  @Roles("admin", "registrar")
  updateStudent(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = UpdateStudentInput.parse(body);
    return this.academics.updateStudent(user.personId, id, input);
  }

  @Post("admin/enrollments/:id/drop")
  @Roles("admin", "registrar")
  adminDrop(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.adminDropEnrollment(id, user.personId);
  }

  @Get("admin/programs")
  @Roles("admin", "registrar")
  adminPrograms() {
    return this.academics.adminPrograms();
  }

  @Post("admin/programs")
  @Roles("admin", "registrar")
  createProgram(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateProgramInput.parse(body);
    return this.academics.adminCreateProgram(user.personId, input);
  }

  @Post("admin/courses")
  @Roles("admin", "registrar")
  createCourse(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateCourseInput.parse(body);
    return this.academics.adminCreateCourse(user.personId, input);
  }

  @Get("admin/applicants")
  @Roles("admin", "registrar")
  adminApplicants() {
    return this.academics.adminApplicants();
  }

  @Get("admin/staff")
  @Roles("admin", "hr", "registrar")
  adminStaff() {
    return this.academics.adminStaff();
  }

  @Get("admin/users")
  @Roles("admin", "it_admin")
  adminUsers() {
    return this.academics.adminUsers();
  }

  @Post("my/enroll")
  @Roles("student")
  enroll(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { sectionId } = EnrollInput.parse(body);
    return this.academics.enroll(user.studentId!, sectionId);
  }

  @Post("my/drop")
  @Roles("student")
  drop(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { enrollmentId } = DropInput.parse(body);
    return this.academics.drop(user.studentId!, enrollmentId);
  }

  @Get("teaching")
  @Roles("faculty", "admin")
  teaching(@CurrentUser() user: AuthUser) {
    return this.academics.mySections(user.personId);
  }

  @Get("teaching/overview")
  @Roles("faculty", "admin")
  teachingOverview(@CurrentUser() user: AuthUser) {
    return this.academics.facultyOverview(user.personId);
  }

  @Get("teaching/schedule")
  @Roles("faculty", "admin")
  teachingSchedule(@CurrentUser() user: AuthUser) {
    return this.academics.mySchedule(user.personId);
  }

  @Get("teaching/advisees")
  @Roles("faculty", "admin")
  teachingAdvisees(@CurrentUser() user: AuthUser) {
    return this.academics.facultyAdvisees(user.personId);
  }

  @Get("sections/:id/insights")
  @Roles("faculty", "admin")
  sectionInsights(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.sectionInsights(id, user.personId, user.roles.includes("admin"));
  }

  @Get("sections/:id/roster")
  @Roles("faculty", "admin")
  roster(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.roster(id, user.personId, user.roles.includes("admin"));
  }

  @Get("sections/:id/gradebook")
  @Roles("faculty", "admin")
  gradebook(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.getGradebook(id, user.personId, user.roles.includes("admin"));
  }

  @Post("sections/:id/grades")
  @Roles("faculty", "admin")
  submitGrades(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = SubmitGradesInput.parse(body);
    return this.academics.submitGrades(id, input, user.personId, user.roles.includes("admin"));
  }

  @Get("sections/:id/attendance")
  @Roles("faculty", "admin")
  attendance(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("date") date: string,
  ) {
    return this.academics.getAttendance(id, date, user.personId, user.roles.includes("admin"));
  }

  @Post("sections/:id/attendance")
  @Roles("faculty", "admin")
  markAttendance(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = MarkAttendanceInput.parse(body);
    return this.academics.markAttendance(id, input, user.personId, user.roles.includes("admin"));
  }

  // --- Assignments + submissions (faculty) ---

  @Get("sections/:id/assignments")
  @Roles("faculty", "admin")
  sectionAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.listSectionAssignments(id, user.personId, user.roles.includes("admin"));
  }

  @Post("sections/:id/assignments")
  @Roles("faculty", "admin")
  createAssignment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = CreateAssignmentInput.parse(body);
    return this.academics.createAssignment(id, input, user.personId, user.roles.includes("admin"));
  }

  @Get("assignments/:id/submissions")
  @Roles("faculty", "admin")
  assignmentSubmissions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.getAssignmentSubmissions(id, user.personId, user.roles.includes("admin"));
  }

  @Post("submissions/:id/grade")
  @Roles("faculty", "admin")
  gradeSubmission(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = GradeSubmissionInput.parse(body);
    return this.academics.gradeSubmission(id, input, user.personId, user.roles.includes("admin"));
  }

  // --- Course materials + class posts (faculty) ---

  @Get("sections/:id/materials")
  @Roles("faculty", "admin")
  sectionMaterials(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.listSectionMaterials(id, user.personId, user.roles.includes("admin"));
  }

  @Post("sections/:id/materials")
  @Roles("faculty", "admin")
  createSectionMaterial(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = CreateMaterialInput.parse(body);
    return this.academics.createSectionMaterial(id, input, user.personId, user.roles.includes("admin"));
  }

  @Post("materials/:id/toggle")
  @Roles("faculty", "admin")
  toggleSectionMaterial(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.toggleSectionMaterial(id, user.personId, user.roles.includes("admin"));
  }

  @Get("sections/:id/posts")
  @Roles("faculty", "admin")
  sectionPosts(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.listSectionPosts(id, user.personId, user.roles.includes("admin"));
  }

  @Post("sections/:id/posts")
  @Roles("faculty", "admin")
  createSectionPost(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = CreatePostInput.parse(body);
    return this.academics.createSectionPost(id, input, user.personId, user.name, user.roles.includes("admin"));
  }

  // --- Assignments (student) ---

  @Get("my/assignments")
  @Roles("student")
  myAssignments(@CurrentUser() user: AuthUser) {
    return this.academics.myAssignments(user.studentId!);
  }

  @Post("my/assignments/:id/submit")
  @Roles("student")
  submitAssignment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = SubmitAssignmentInput.parse(body);
    return this.academics.submitAssignment(user.studentId!, id, input);
  }

  @Get("my/sections/:id")
  @Roles("student")
  courseDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.courseDetail(user.studentId!, id);
  }
}
