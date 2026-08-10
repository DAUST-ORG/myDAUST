-- AlterTable
ALTER TABLE "SectionMaterial" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SectionMaterial_sectionId_sortOrder_idx" ON "SectionMaterial"("sectionId", "sortOrder");

-- DropIndex
DROP INDEX "SectionMaterial_sectionId_idx";
