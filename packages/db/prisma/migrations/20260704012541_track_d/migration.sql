-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "attendees" INTEGER,
ADD COLUMN     "budgetXof" INTEGER,
ADD COLUMN     "organizer" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'upcoming';

-- CreateTable
CREATE TABLE "SectionMaterial" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Document',
    "fileUrl" TEXT,
    "fileName" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionPost" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingCase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "visaStatus" TEXT NOT NULL DEFAULT 'Pending',
    "arrivalDate" TIMESTAMP(3),
    "tasks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbroadProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "seatsTaken" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "AbroadProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "room" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Document',
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "GlobalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGlobalTask" (
    "id" TEXT NOT NULL,
    "globalTaskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectGlobalTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SectionMaterial_sectionId_idx" ON "SectionMaterial"("sectionId");

-- CreateIndex
CREATE INDEX "SectionPost_sectionId_idx" ON "SectionPost"("sectionId");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_hallId_idx" ON "MaintenanceTicket"("hallId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGlobalTask_globalTaskId_projectId_key" ON "ProjectGlobalTask"("globalTaskId", "projectId");

-- AddForeignKey
ALTER TABLE "SectionMaterial" ADD CONSTRAINT "SectionMaterial_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionPost" ADD CONSTRAINT "SectionPost_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGlobalTask" ADD CONSTRAINT "ProjectGlobalTask_globalTaskId_fkey" FOREIGN KEY ("globalTaskId") REFERENCES "GlobalTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGlobalTask" ADD CONSTRAINT "ProjectGlobalTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
