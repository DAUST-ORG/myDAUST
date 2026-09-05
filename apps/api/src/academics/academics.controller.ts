import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  CreateAssignmentInput,
  DropInput,
  EnrollInput,
  GradeSubmissionInput,
  MarkAttendanceInput,
  SubmitAssignmentInput,
  SubmitGradesInput,
  UpdateAssignmentInput,
} from "@mydaust/shared";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AcademicsService } from "./academics.service.js";
import { RegistrarEnrollmentService } from "./registrar-enrollment.service.js";

const MaterialCategoryInput = z.enum([
  "syllabus",
  "lecture_notes",
  "assignments",
  "quizzes",
  "resources",
]);

// Local zod (the api's own instance) — keeps the ESM/CJS dual-package hazard away.
const AddSectionEnrollmentInput = z.object({
  studentId: z.string().uuid(),
  // A registrar add waives academic gates, so the record of why is the only
  // thing standing between an exception and an unexplained roster change.
  reason: z.string().trim().min(1).max(500),
});

const CreateMaterialInput = z.object({
  title: z.string().min(1).max(200),
  kind: z.string().min(1).max(40),
  category: MaterialCategoryInput.optional(),
  folderId: z.string().min(1).optional(),
  fileUrl: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
});

const ReorderMaterialsInput = z.object({
  category: MaterialCategoryInput,
  folderId: z.string().min(1).nullable(),
  orderedIds: z.array(z.string().min(1)).min(1),
});

const MaterialFolderNameInput = z.object({
  name: z.string().trim().min(1).max(80),
});

const CreateMaterialFolderInput = MaterialFolderNameInput.extend({
  category: MaterialCategoryInput,
});

const MoveMaterialInput = z.object({
  folderId: z.string().min(1).nullable(),
});

const CreateProgramInput = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  departmentId: z.string().min(1),
  degree: z.string().max(40).nullable().optional(),
  school: z.string().max(80).nullable().optional(),
  tuition: z.number().int().min(0).max(100_000_000).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

const SEMESTERS = z.array(z.enum(["fall", "spring", "summer"]));
const CreateCourseInput = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(160),
  credits: z.number().int().min(1).max(30),
  departmentId: z.string().min(1),
  status: z.enum(["active", "draft"]).optional(),
  description: z.string().max(2000).nullish(),
  semestersOffered: SEMESTERS.optional(),
  prerequisiteCodes: z.array(z.string().max(20)).optional(),
  corequisiteCodes: z.array(z.string().max(20)).optional(),
});

const UpdateProgramInput = z.object({
  name: z.string().min(1).max(120).optional(),
  departmentId: z.string().min(1).optional(),
  degree: z.string().max(40).nullable().optional(),
  school: z.string().max(80).nullable().optional(),
  tuition: z.number().int().min(0).max(100_000_000).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

const UpdateCourseInput = z.object({
  title: z.string().min(1).max(160).optional(),
  credits: z.number().int().min(1).max(30).optional(),
  departmentId: z.string().min(1).optional(),
  status: z.enum(["active", "draft"]).optional(),
  description: z.string().max(2000).nullish(),
  semestersOffered: SEMESTERS.optional(),
  prerequisiteCodes: z.array(z.string().max(20)).optional(),
  corequisiteCodes: z.array(z.string().max(20)).optional(),
});

const TIME_RE = /^\d{2}:\d{2}$/;
const CreateSectionInput = z.object({
  courseCode: z.string().min(1).max(20),
  termId: z.string().min(1),
  sectionCode: z.string().min(1).max(10),
  instructorId: z.string().max(64).nullable().optional(),
  capacity: z.number().int().min(1).max(1000),
  days: z.string().min(1).max(10),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  room: z.string().max(40).nullable().optional(),
  recommended: z.boolean().optional(),
});
const UpdateSectionInput = z.object({
  sectionCode: z.string().min(1).max(10).optional(),
  termId: z.string().min(1).optional(),
  instructorId: z.string().max(64).nullable().optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  days: z.string().min(1).max(10).optional(),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  room: z.string().max(40).nullable().optional(),
  // Closing a section removes it from registration; seats remaining is a separate concern.
  status: z.enum(["open", "closed"]).optional(),
  // Staff-curated flag surfaced to students in the registration catalogue.
  recommended: z.boolean().optional(),
});

const UpdateStudentInput = z.object({
  fullName: z.string().min(1).max(120).optional(),
  // The DAUST sign-in identity is read-only account metadata. Reject legacy
  // clients that still attempt to alter it through profile edits.
  email: z.never().optional(),
  programCode: z.string().max(20).nullable().optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
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
  preferredName: z.string().max(80).nullish(),
  nationalId: z.string().max(60).nullish(),
  maritalStatus: z.string().max(30).nullish(),
  // Contact email is managed exclusively through the account-management tab,
  // which applies lifecycle guards and a dedicated audit event.
  personalEmail: z.never().optional(),
  bloodType: z.string().max(8).nullish(),
  allergies: z.string().max(300).nullish(),
  insurance: z.string().max(120).nullish(),
  physician: z.string().max(120).nullish(),
  emergencyName2: z.string().max(120).nullish(),
  emergencyPhone2: z.string().max(40).nullish(),
  major: z.string().max(120).nullish(),
  admitTerm: z.string().max(40).nullish(),
  expectedGrad: z.string().max(40).nullish(),
  enrollmentStatus: z.string().max(40).nullish(),
  catalogYear: z.string().max(20).nullish(),
});

const AdminStudentRosterQueryInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => [25, 50, 100].includes(value), {
      message: "pageSize must be 25, 50, or 100",
    })
    .default(50),
  search: z.string().trim().max(100).optional(),
  program: z.string().trim().max(20).optional(),
  // Academic level is a derived value (see AcademicsService.adminStudentRoster). We
  // accept it here so the API surface is uniform with the other filters; the service
  // decides whether a request needs the derived-fetch path.
  level: z.string().trim().max(20).optional(),
  // Student.gender is free-text (legacy data). Case-insensitive substring match,
  // bounded length so an attacker cannot probe arbitrary sizes.
  gender: z.string().trim().max(40).optional(),
  // Student.nationality is free-text country names typed by registrars. Same shape
  // as `gender`.
  nationality: z.string().trim().max(40).optional(),
  // Standing is derived from the approved academic catalog after transcript
  // totals are calculated, so the service applies this filter after hydration.
  standing: z.string().trim().max(40).optional(),
  login: z.enum(["active", "must_change", "not_activated"]).optional(),
  sort: z
    .enum(["name", "program", "level", "gpa", "balance", "status"])
    .default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

const StandingOverrideInput = z.object({
  standingCode: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(1000),
  expiresAt: z.string().datetime().nullable().optional(),
});

const ClearStandingOverrideInput = z.object({
  reason: z.string().trim().min(1).max(1000),
});

const RegistrationTermQuery = z.string().uuid().optional();
const EnrollBundleInput = z
  .object({
    sectionIds: z.array(z.string().uuid()).min(1).max(30),
  })
  .strict()
  .superRefine(({ sectionIds }, ctx) => {
    if (new Set(sectionIds).size !== sectionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each section may appear only once",
        path: ["sectionIds"],
      });
    }
  });

@Controller("academics")
export class AcademicsController {
  constructor(
    private readonly academics: AcademicsService,
    private readonly registrarEnrollment: RegistrarEnrollmentService,
  ) {}

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

  @Get("my/schedule")
  @Roles("student")
  mySchedule(@CurrentUser() user: AuthUser) {
    return this.academics.studentSchedule(user.studentId!);
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

  @Get("my/registration")
  @Roles("student")
  myRegistration(
    @CurrentUser() user: AuthUser,
    @Query("termId") termId?: string,
  ) {
    return this.academics.registrationCatalog(
      user.studentId!,
      RegistrationTermQuery.parse(termId),
    );
  }

  @Get("my/degree")
  @Roles("student")
  myDegree(@CurrentUser() user: AuthUser) {
    return this.academics.degreeAudit(user.studentId!);
  }

  @Get("my/attendance")
  @Roles("student")
  myAttendance(@CurrentUser() user: AuthUser) {
    return this.academics.myAttendance(user.studentId!);
  }

  @Get("my/profile")
  @Roles("student")
  myProfile(@CurrentUser() user: AuthUser) {
    return this.academics.myProfile(user.studentId!);
  }

  @Get("my/housing")
  @Roles("student")
  myHousing(@CurrentUser() user: AuthUser) {
    return this.academics.myHousing(user.studentId!);
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

  @Get("admin/student-roster")
  @Roles("admin", "registrar", "bursar")
  adminStudentRoster(@Query() query: Record<string, string | undefined>) {
    const parsed = AdminStudentRosterQueryInput.parse(query);
    return this.academics.adminStudentRoster({
      ...parsed,
      search: parsed.search || undefined,
      program:
        parsed.program && parsed.program !== "all" ? parsed.program : undefined,
      level: parsed.level && parsed.level !== "all" ? parsed.level : undefined,
      gender:
        parsed.gender && parsed.gender !== "all" ? parsed.gender : undefined,
      nationality:
        parsed.nationality && parsed.nationality !== "all"
          ? parsed.nationality
          : undefined,
      standing:
        parsed.standing && parsed.standing !== "all"
          ? parsed.standing
          : undefined,
      login: parsed.login,
    });
  }

  @Get("admin/student-directory")
  @Roles("admin", "registrar", "bursar")
  adminStudentDirectory() {
    return this.academics.adminStudentDirectory();
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
  updateStudent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateStudentInput.parse(body);
    return this.academics.updateStudent(user.personId, id, input);
  }

  @Put("admin/students/:id/standing-override")
  @Roles("admin", "registrar")
  setStandingOverride(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.academics.setStudentStandingOverride(
      user.personId,
      id,
      StandingOverrideInput.parse(body),
    );
  }

  @Delete("admin/students/:id/standing-override")
  @Roles("admin", "registrar")
  clearStandingOverride(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.academics.clearStudentStandingOverride(
      user.personId,
      id,
      ClearStandingOverrideInput.parse(body).reason,
    );
  }

  @Get("director/standing-overrides")
  @Roles("admin")
  currentStandingOverrides() {
    return this.academics.currentStandingOverrides();
  }

  @Post("admin/enrollments/:id/drop")
  @Roles("admin", "registrar")
  adminDrop(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.adminDropEnrollment(id, user.personId);
  }

  @Get("admin/sections/:id/enrollments")
  @Roles("admin", "registrar")
  sectionEnrollments(@Param("id") id: string) {
    return this.registrarEnrollment.sectionEnrollments(id);
  }

  @Post("admin/sections/:id/enrollments")
  @Roles("admin", "registrar")
  addSectionEnrollment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = AddSectionEnrollmentInput.parse(body);
    return this.registrarEnrollment.enrollStudent(
      id,
      input.studentId,
      user.personId,
      input.reason,
    );
  }

  @Get("admin/programs")
  // Read-only reference data: the applicant list and modal render programme names.
  @Roles("admin", "registrar", "admissions")
  adminPrograms() {
    return this.academics.adminPrograms();
  }

  @Post("admin/programs")
  @Roles("admin", "registrar")
  createProgram(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateProgramInput.parse(body);
    return this.academics.adminCreateProgram(user.personId, input);
  }

  @Get("admin/programs/:code")
  @Roles("admin", "registrar", "bursar")
  programDetail(@Param("code") code: string) {
    return this.academics.programDetail(code);
  }

  @Patch("admin/programs/:code")
  @Roles("admin", "registrar")
  updateProgram(
    @CurrentUser() user: AuthUser,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    const input = UpdateProgramInput.parse(body);
    return this.academics.updateProgram(user.personId, code, input);
  }

  @Post("admin/courses")
  @Roles("admin", "registrar")
  createCourse(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateCourseInput.parse(body);
    return this.academics.adminCreateCourse(user.personId, input);
  }

  @Get("admin/courses/:code")
  @Roles("admin", "registrar", "bursar")
  adminCourseDetail(@Param("code") code: string) {
    return this.academics.adminCourseDetail(code);
  }

  @Patch("admin/courses/:code")
  @Roles("admin", "registrar")
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    const input = UpdateCourseInput.parse(body);
    return this.academics.updateCourse(user.personId, code, input);
  }

  @Delete("admin/courses/:code")
  @Roles("admin", "registrar")
  deleteCourse(@CurrentUser() user: AuthUser, @Param("code") code: string) {
    return this.academics.deleteCourse(user.personId, code);
  }

  @Post("admin/sections")
  @Roles("admin", "registrar")
  createSection(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateSectionInput.parse(body);
    return this.academics.createSection(user.personId, input);
  }

  @Patch("admin/sections/:id")
  @Roles("admin", "registrar")
  updateSection(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateSectionInput.parse(body);
    return this.academics.updateSection(user.personId, id, input);
  }

  @Delete("admin/sections/:id")
  @Roles("admin", "registrar")
  deleteSection(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.deleteSection(user.personId, id);
  }

  @Get("admin/applicants")
  // The only applicant list; without admissions here the officer's home screen never loads.
  @Roles("admin", "registrar", "admissions")
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

  @Post("my/enrollments/bundle")
  @Roles("student")
  enrollBundle(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { sectionIds } = EnrollBundleInput.parse(body);
    return this.academics.enrollBundle(user.studentId!, sectionIds);
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

  @Get("sections/:id/insights")
  @Roles("faculty", "admin")
  sectionInsights(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.sectionInsights(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/roster")
  @Roles("faculty", "admin")
  roster(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.roster(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/gradebook")
  @Roles("faculty", "admin")
  gradebook(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.getGradebook(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("sections/:id/grades")
  @Roles("faculty", "admin")
  submitGrades(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = SubmitGradesInput.parse(body);
    return this.academics.submitGrades(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/attendance")
  @Roles("faculty", "admin")
  attendance(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("date") date: string,
  ) {
    return this.academics.getAttendance(
      id,
      date,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/attendance/sessions")
  @Roles("faculty", "admin")
  attendanceSessions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.attendanceSessions(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("sections/:id/attendance")
  @Roles("faculty", "admin")
  markAttendance(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = MarkAttendanceInput.parse(body);
    return this.academics.markAttendance(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  // --- Assignments + submissions (faculty) ---

  @Get("sections/:id/assignments")
  @Roles("faculty", "admin")
  sectionAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.listSectionAssignments(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("sections/:id/assignments")
  @Roles("faculty", "admin")
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = CreateAssignmentInput.parse(body);
    return this.academics.createAssignment(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Patch("sections/:id/assignments/:assignmentId")
  @Roles("faculty", "admin")
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param("id") _sectionId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = UpdateAssignmentInput.parse(body);
    return this.academics.updateAssignment(
      assignmentId,
      user.personId,
      user.roles.includes("admin"),
      input,
    );
  }

  @Delete("sections/:id/assignments/:assignmentId")
  @Roles("faculty", "admin")
  deleteAssignment(
    @CurrentUser() user: AuthUser,
    @Param("id") _sectionId: string,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.academics.deleteAssignment(
      assignmentId,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("assignments/:id/submissions")
  @Roles("faculty", "admin")
  assignmentSubmissions(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.academics.getAssignmentSubmissions(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("submissions/:id/grade")
  @Roles("faculty", "admin")
  gradeSubmission(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = GradeSubmissionInput.parse(body);
    return this.academics.gradeSubmission(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  // --- Course materials + class posts (faculty) ---

  @Get("sections/:id/material-folders")
  @Roles("faculty", "admin")
  sectionMaterialFolders(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.academics.listSectionMaterialFolders(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("sections/:id/material-folders")
  @Roles("faculty", "admin")
  createSectionMaterialFolder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = CreateMaterialFolderInput.parse(body);
    return this.academics.createSectionMaterialFolder(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Patch("material-folders/:id")
  @Roles("faculty", "admin")
  renameSectionMaterialFolder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = MaterialFolderNameInput.parse(body);
    return this.academics.renameSectionMaterialFolder(
      id,
      input.name,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Delete("material-folders/:id")
  @Roles("faculty", "admin")
  deleteSectionMaterialFolder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.academics.deleteSectionMaterialFolder(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/materials")
  @Roles("faculty", "admin")
  sectionMaterials(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.listSectionMaterials(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("sections/:id/materials")
  @Roles("faculty", "admin")
  createSectionMaterial(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = CreateMaterialInput.parse(body);
    return this.academics.createSectionMaterial(
      id,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Post("materials/:id/toggle")
  @Roles("faculty", "admin")
  toggleSectionMaterial(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.academics.toggleSectionMaterial(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Patch("materials/:id/folder")
  @Roles("faculty", "admin")
  moveSectionMaterial(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = MoveMaterialInput.parse(body);
    return this.academics.moveSectionMaterial(
      id,
      input.folderId,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Delete("materials/:id")
  @Roles("faculty", "admin")
  deleteSectionMaterial(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.academics.deleteSectionMaterial(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Patch("sections/:id/materials/reorder")
  @Roles("faculty", "admin")
  reorderSectionMaterials(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = ReorderMaterialsInput.parse(body);
    return this.academics.reorderSectionMaterials(
      id,
      input.category,
      input.folderId,
      input.orderedIds,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  // --- Assignments (student) ---

  @Get("my/assignments")
  @Roles("student")
  myAssignments(@CurrentUser() user: AuthUser) {
    return this.academics.myAssignments(user.studentId!);
  }

  @Post("my/assignments/:id/submit")
  @Roles("student")
  submitAssignment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = SubmitAssignmentInput.parse(body);
    return this.academics.submitAssignment(user.studentId!, id, input);
  }

  @Get("my/sections/:id")
  @Roles("student")
  courseDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.courseDetail(user.studentId!, id);
  }

  @Get("my/courses")
  @Roles("student")
  myCourses(@CurrentUser() user: AuthUser) {
    return this.academics.myCourses(user.studentId!);
  }

  @Get("my/sections/:id/materials")
  @Roles("student")
  mySectionMaterials(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.academics.studentSectionMaterials(user.studentId!, id);
  }

  // --- Major selection (first-login prompt) ---

  @Get("my/major-status")
  @Roles("student")
  myMajorStatus(@CurrentUser() user: AuthUser) {
    return this.academics.majorSelectionStatus(user.studentId!);
  }

  @Get("my/available-programs")
  @Roles("student")
  myAvailablePrograms() {
    return this.academics.availablePrograms();
  }

  @Post("my/major")
  @Roles("student")
  chooseMyMajor(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = z
      .object({ programCode: z.string().max(20).nullable() })
      .parse(body);
    return this.academics.chooseMyMajor(user.studentId!, input.programCode);
  }
}
