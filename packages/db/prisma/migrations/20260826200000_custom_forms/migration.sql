-- CreateEnum
CREATE TYPE "CustomFormStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('text', 'textarea', 'select', 'checkbox', 'date');

-- CreateTable
CREATE TABLE "CustomForm" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "CustomFormStatus" NOT NULL DEFAULT 'draft',
    "requiresAuth" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxResponses" INTEGER,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "publicToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSection" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "conditionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "optionsJson" JSONB,
    "conditionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "personId" TEXT,
    "respondentName" TEXT,
    "respondentEmail" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponseAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponseAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomForm_publicToken_key" ON "CustomForm"("publicToken");

-- CreateIndex
CREATE INDEX "CustomForm_status_idx" ON "CustomForm"("status");

-- CreateIndex
CREATE INDEX "CustomForm_createdById_idx" ON "CustomForm"("createdById");

-- CreateIndex
CREATE INDEX "FormSection_formId_sortOrder_idx" ON "FormSection"("formId", "sortOrder");

-- CreateIndex
CREATE INDEX "FormField_sectionId_sortOrder_idx" ON "FormField"("sectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_formId_personId_key" ON "FormResponse"("formId", "personId");

-- CreateIndex
CREATE INDEX "FormResponse_formId_idx" ON "FormResponse"("formId");

-- CreateIndex
CREATE INDEX "FormResponse_personId_idx" ON "FormResponse"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponseAnswer_responseId_fieldId_key" ON "FormResponseAnswer"("responseId", "fieldId");

-- CreateIndex
CREATE INDEX "FormResponseAnswer_responseId_idx" ON "FormResponseAnswer"("responseId");

-- CreateIndex
CREATE INDEX "FormResponseAnswer_fieldId_idx" ON "FormResponseAnswer"("fieldId");

-- AddForeignKey
ALTER TABLE "CustomForm" ADD CONSTRAINT "CustomForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSection" ADD CONSTRAINT "FormSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "FormSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponseAnswer" ADD CONSTRAINT "FormResponseAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponseAnswer" ADD CONSTRAINT "FormResponseAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
