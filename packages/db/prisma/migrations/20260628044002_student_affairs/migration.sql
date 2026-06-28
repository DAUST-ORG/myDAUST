-- CreateEnum
CREATE TYPE "HousingStatus" AS ENUM ('pending', 'assigned');

-- CreateEnum
CREATE TYPE "ConductStage" AS ENUM ('intake', 'investigation', 'mediation', 'hearing', 'resolved');

-- CreateEnum
CREATE TYPE "ConductSeverity" AS ENUM ('low', 'med', 'high');

-- CreateTable
CREATE TABLE "Hall" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "beds" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#153b6a',

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousingAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hallId" TEXT,
    "room" TEXT,
    "status" "HousingStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sleep" TEXT NOT NULL,
    "tidy" TEXT NOT NULL,
    "social" TEXT NOT NULL,
    "study" TEXT NOT NULL,

    CONSTRAINT "RoommateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductCase" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stage" "ConductStage" NOT NULL DEFAULT 'intake',
    "severity" "ConductSeverity" NOT NULL DEFAULT 'med',
    "officer" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDueAt" TIMESTAMP(3),

    CONSTRAINT "ConductCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "members" INTEGER NOT NULL DEFAULT 0,
    "budgetXof" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lead" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoCurricularLine" (
    "id" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "allocatedXof" INTEGER NOT NULL DEFAULT 0,
    "spentXof" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#153b6a',

    CONSTRAINT "CoCurricularLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hall_name_key" ON "Hall"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HousingAssignment_studentId_key" ON "HousingAssignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateProfile_studentId_key" ON "RoommateProfile"("studentId");

-- CreateIndex
CREATE INDEX "ConductCase_stage_idx" ON "ConductCase"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "CoCurricularLine_line_key" ON "CoCurricularLine"("line");

-- AddForeignKey
ALTER TABLE "HousingAssignment" ADD CONSTRAINT "HousingAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousingAssignment" ADD CONSTRAINT "HousingAssignment_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateProfile" ADD CONSTRAINT "RoommateProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
