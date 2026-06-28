-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('homework', 'quiz', 'exam', 'project');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('assigned', 'submitted', 'graded');

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssignmentType" NOT NULL DEFAULT 'homework',
    "maxPoints" INTEGER NOT NULL DEFAULT 100,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'submitted',
    "text" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_sectionId_idx" ON "Assignment"("sectionId");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_idx" ON "Submission"("assignmentId");

-- CreateIndex
CREATE INDEX "Submission_enrollmentId_idx" ON "Submission"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_enrollmentId_key" ON "Submission"("assignmentId", "enrollmentId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
