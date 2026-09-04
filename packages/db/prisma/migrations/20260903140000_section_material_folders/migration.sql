-- One-level, section-scoped folders for course materials. Existing materials
-- remain unfiled because the new foreign key is nullable.
CREATE TABLE "SectionMaterialFolder" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionMaterialFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SectionMaterial" ADD COLUMN "folderId" TEXT;

CREATE UNIQUE INDEX "SectionMaterialFolder_sectionId_category_normalizedName_key"
    ON "SectionMaterialFolder"("sectionId", "category", "normalizedName");
CREATE INDEX "SectionMaterialFolder_sectionId_category_name_idx"
    ON "SectionMaterialFolder"("sectionId", "category", "name");
CREATE INDEX "SectionMaterial_folderId_sortOrder_idx"
    ON "SectionMaterial"("folderId", "sortOrder");

ALTER TABLE "SectionMaterialFolder"
    ADD CONSTRAINT "SectionMaterialFolder_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SectionMaterial"
    ADD CONSTRAINT "SectionMaterial_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "SectionMaterialFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
