-- Campus helpdesk persistence. Phase 4: support tickets covering admissions,
-- academics, student affairs, IT/portal support, and a catch-all Other bucket.
-- This migration is additive only: four new enum types, three new tables,
-- matching foreign keys, indexes, and CHECK constraints for title/description
-- length and the GitHub sync state machine. The pre-existing IT backlog keeps
-- its own narrow workflow and is unaffected.

-- CreateEnum
CREATE TYPE "HelpdeskCategory" AS ENUM (
    'admissions',
    'academics',
    'student_affairs',
    'it_portal',
    'other'
);

-- CreateEnum
CREATE TYPE "HelpdeskPriority" AS ENUM (
    'low',
    'normal',
    'high'
);

-- CreateEnum
CREATE TYPE "HelpdeskStatus" AS ENUM (
    'new',
    'in_progress',
    'waiting_on_requester',
    'resolved'
);

-- CreateEnum
CREATE TYPE "HelpdeskRoutingType" AS ENUM (
    'support',
    'engineering'
);

-- CreateTable
CREATE TABLE "HelpdeskTicket" (
    "id"                TEXT NOT NULL,
    "requesterId"       TEXT NOT NULL,
    "studentId"         TEXT,
    "assigneeId"        TEXT,
    "title"             TEXT NOT NULL,
    "description"       TEXT NOT NULL,
    "category"          "HelpdeskCategory" NOT NULL,
    "priority"          "HelpdeskPriority" NOT NULL DEFAULT 'normal',
    "status"            "HelpdeskStatus" NOT NULL DEFAULT 'new',
    "routingType"       "HelpdeskRoutingType" NOT NULL DEFAULT 'support',
    "githubIssueNumber" INTEGER,
    "githubIssueUrl"    TEXT,
    "githubSyncState"   TEXT NOT NULL DEFAULT 'pending',
    "githubSyncError"   TEXT,
    "githubSyncedAt"    TIMESTAMP(3),
    "resolvedAt"        TIMESTAMP(3),
    "version"           INTEGER NOT NULL DEFAULT 1,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskComment" (
    "id"         TEXT NOT NULL,
    "ticketId"   TEXT NOT NULL,
    "authorId"   TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskAttachment" (
    "id"         TEXT NOT NULL,
    "ticketId"   TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "url"        TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "size"       INTEGER NOT NULL,
    "mimeType"   TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpdeskTicket_requesterId_idx" ON "HelpdeskTicket"("requesterId");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_status_idx" ON "HelpdeskTicket"("status");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_category_status_idx" ON "HelpdeskTicket"("category", "status");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_routingType_githubSyncState_idx"
    ON "HelpdeskTicket"("routingType", "githubSyncState");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_studentId_idx" ON "HelpdeskTicket"("studentId");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_assigneeId_idx" ON "HelpdeskTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "HelpdeskComment_ticketId_idx" ON "HelpdeskComment"("ticketId");

-- CreateIndex
CREATE INDEX "HelpdeskComment_authorId_idx" ON "HelpdeskComment"("authorId");

-- CreateIndex
CREATE INDEX "HelpdeskAttachment_ticketId_idx" ON "HelpdeskAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "HelpdeskAttachment_uploaderId_idx" ON "HelpdeskAttachment"("uploaderId");

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskAttachment" ADD CONSTRAINT "HelpdeskAttachment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskAttachment" ADD CONSTRAINT "HelpdeskAttachment_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Length guards match the API contracts exactly: title 3..160,
-- description/comment 1..8000 after Zod trimming. Attachment names remain 1..500.
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_title_length_check"
    CHECK (char_length("title") BETWEEN 3 AND 160);

ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_description_length_check"
    CHECK (char_length("description") BETWEEN 1 AND 8000);

ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_body_length_check"
    CHECK (char_length("body") BETWEEN 1 AND 8000);

ALTER TABLE "HelpdeskAttachment" ADD CONSTRAINT "HelpdeskAttachment_name_length_check"
    CHECK (char_length("name") BETWEEN 1 AND 500);

ALTER TABLE "HelpdeskAttachment" ADD CONSTRAINT "HelpdeskAttachment_mimeType_length_check"
    CHECK (char_length("mimeType") BETWEEN 1 AND 255);

-- Only the visible sync states are allowed. Missing GitHub configuration remains pending;
-- successful issue creation is linked; transport/API failures are failed and retryable.
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_githubSyncState_check"
    CHECK ("githubSyncState" IN ('pending', 'linked', 'failed'));
