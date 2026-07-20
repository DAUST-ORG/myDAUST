-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('syllabus', 'lecture_notes', 'assignments', 'quizzes', 'resources');

-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "GradeSubmissionStatus" AS ENUM ('draft', 'submitted', 'approved', 'returned');

-- AlterEnum
ALTER TYPE "PersonKind" ADD VALUE 'parent';

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "essay" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "parentEmail" TEXT,
ADD COLUMN     "parentName" TEXT,
ADD COLUMN     "parentPhone" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "priorGpa" TEXT,
ADD COLUMN     "school" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "term" TEXT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "head" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "gradingSchemeId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "SectionMaterial" ADD COLUMN     "category" "MaterialCategory" NOT NULL DEFAULT 'resources';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admitTerm" TEXT,
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "catalogYear" TEXT,
ADD COLUMN     "emergencyName2" TEXT,
ADD COLUMN     "emergencyPhone2" TEXT,
ADD COLUMN     "enrollmentStatus" TEXT,
ADD COLUMN     "expectedGrad" TEXT,
ADD COLUMN     "insurance" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "minor" TEXT,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "physician" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "standing" TEXT;

-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "semester" TEXT;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'draft',
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'event',
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumEntry" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "yearIndex" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CurriculumEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRequirement" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "catalogYear" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requiredCredits" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "standingRequired" TEXT,
    "majorRestriction" TEXT,
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePrerequisite" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "prereqCourseId" TEXT NOT NULL,
    "minGrade" TEXT,

    CONSTRAINT "CoursePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCorequisite" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "coreqCourseId" TEXT NOT NULL,

    CONSTRAINT "CourseCorequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScheme" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeScaleRow" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "points" DOUBLE PRECISION,
    "minScore" INTEGER,
    "maxScore" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradeScaleRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSubmission" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "GradeSubmissionStatus" NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "GradeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentHold" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "StudentHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAlert" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'warning',
    "warnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffWatch" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianStudent" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianInvite" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "audienceType" TEXT NOT NULL,
    "audienceValue" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePlanInstallment" (
    "id" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueOn" TIMESTAMP(3),
    "amountFullXof" INTEGER NOT NULL,
    "amountTuitionXof" INTEGER NOT NULL,

    CONSTRAINT "FeePlanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE INDEX "AcademicYear_status_idx" ON "AcademicYear"("status");

-- CreateIndex
CREATE INDEX "CalendarEvent_academicYearId_idx" ON "CalendarEvent"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_programId_academicYearId_key" ON "Curriculum"("programId", "academicYearId");

-- CreateIndex
CREATE INDEX "CurriculumEntry_curriculumId_idx" ON "CurriculumEntry"("curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRequirement_programId_catalogYear_category_key" ON "ProgramRequirement"("programId", "catalogYear", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRule_courseId_key" ON "CourseRule"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrerequisite_courseId_prereqCourseId_key" ON "CoursePrerequisite"("courseId", "prereqCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCorequisite_courseId_coreqCourseId_key" ON "CourseCorequisite"("courseId", "coreqCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingScheme_key_key" ON "GradingScheme"("key");

-- CreateIndex
CREATE INDEX "GradeScaleRow_schemeId_idx" ON "GradeScaleRow"("schemeId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSubmission_sectionId_key" ON "GradeSubmission"("sectionId");

-- CreateIndex
CREATE INDEX "GradeSubmission_status_idx" ON "GradeSubmission"("status");

-- CreateIndex
CREATE INDEX "StudentHold_studentId_active_idx" ON "StudentHold"("studentId", "active");

-- CreateIndex
CREATE INDEX "StudentAlert_studentId_idx" ON "StudentAlert"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffWatch_personId_studentId_key" ON "StaffWatch"("personId", "studentId");

-- CreateIndex
CREATE INDEX "GuardianStudent_studentId_idx" ON "GuardianStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianStudent_guardianId_studentId_key" ON "GuardianStudent"("guardianId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianInvite_tokenHash_key" ON "GuardianInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "GuardianInvite_guardianId_idx" ON "GuardianInvite"("guardianId");

-- CreateIndex
CREATE INDEX "Broadcast_senderId_idx" ON "Broadcast"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlanInstallment_academicYearLabel_sequence_key" ON "FeePlanInstallment"("academicYearLabel", "sequence");

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_gradingSchemeId_fkey" FOREIGN KEY ("gradingSchemeId") REFERENCES "GradingScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumEntry" ADD CONSTRAINT "CurriculumEntry_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumEntry" ADD CONSTRAINT "CurriculumEntry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRequirement" ADD CONSTRAINT "ProgramRequirement_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRule" ADD CONSTRAINT "CourseRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_prereqCourseId_fkey" FOREIGN KEY ("prereqCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCorequisite" ADD CONSTRAINT "CourseCorequisite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCorequisite" ADD CONSTRAINT "CourseCorequisite_coreqCourseId_fkey" FOREIGN KEY ("coreqCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeScaleRow" ADD CONSTRAINT "GradeScaleRow_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "GradingScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentHold" ADD CONSTRAINT "StudentHold_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAlert" ADD CONSTRAINT "StudentAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWatch" ADD CONSTRAINT "StaffWatch_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudent" ADD CONSTRAINT "GuardianStudent_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudent" ADD CONSTRAINT "GuardianStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianInvite" ADD CONSTRAINT "GuardianInvite_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
