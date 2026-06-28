-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'absent');

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_sectionId_date_idx" ON "AttendanceRecord"("sectionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_enrollmentId_date_key" ON "AttendanceRecord"("enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
