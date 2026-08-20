-- Course evaluations. Additive only: two enums, three new tables, no changes to any
-- existing table and no backfill.
--
-- The response/receipt split is the anonymity guarantee and is structural rather than
-- procedural: CourseEvaluationResponse has no student or enrollment column at all, and
-- CourseEvaluationReceipt holds no answer data, so the two cannot be joined by anyone
-- with database access. Do not add a shared key between them.

CREATE TYPE "CourseEvaluationKind" AS ENUM ('midterm', 'final');
CREATE TYPE "CourseEvaluationStatus" AS ENUM ('draft', 'open', 'closed');

CREATE TABLE "CourseEvaluationWindow" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "kind" "CourseEvaluationKind" NOT NULL,
    "status" "CourseEvaluationStatus" NOT NULL DEFAULT 'draft',
    "boundsOpenAt" TIMESTAMP(3) NOT NULL,
    "boundsCloseAt" TIMESTAMP(3) NOT NULL,
    "minResponsesToRelease" INTEGER NOT NULL DEFAULT 5,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEvaluationWindow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CourseEvaluationWindow_bounds_ordered" CHECK ("boundsOpenAt" < "boundsCloseAt"),
    CONSTRAINT "CourseEvaluationWindow_min_responses_positive" CHECK ("minResponsesToRelease" >= 1)
);

CREATE UNIQUE INDEX "CourseEvaluationWindow_termId_kind_key"
    ON "CourseEvaluationWindow"("termId", "kind");

CREATE TABLE "CourseEvaluationSchedule" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEvaluationSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CourseEvaluationSchedule_window_ordered" CHECK ("opensAt" < "closesAt")
);

CREATE UNIQUE INDEX "CourseEvaluationSchedule_windowId_sectionId_key"
    ON "CourseEvaluationSchedule"("windowId", "sectionId");

CREATE TABLE "CourseEvaluationResponse" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "clarity" INTEGER NOT NULL,
    "workload" INTEGER NOT NULL,
    "comment" TEXT,
    "submittedOn" DATE NOT NULL,

    CONSTRAINT "CourseEvaluationResponse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CourseEvaluationResponse_ratings_in_range" CHECK (
        "overall" BETWEEN 1 AND 5 AND "clarity" BETWEEN 1 AND 5 AND "workload" BETWEEN 1 AND 5
    )
);

CREATE INDEX "CourseEvaluationResponse_windowId_sectionId_idx"
    ON "CourseEvaluationResponse"("windowId", "sectionId");

CREATE TABLE "CourseEvaluationReceipt" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEvaluationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseEvaluationReceipt_windowId_enrollmentId_key"
    ON "CourseEvaluationReceipt"("windowId", "enrollmentId");

ALTER TABLE "CourseEvaluationWindow" ADD CONSTRAINT "CourseEvaluationWindow_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationSchedule" ADD CONSTRAINT "CourseEvaluationSchedule_windowId_fkey"
    FOREIGN KEY ("windowId") REFERENCES "CourseEvaluationWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationSchedule" ADD CONSTRAINT "CourseEvaluationSchedule_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationResponse" ADD CONSTRAINT "CourseEvaluationResponse_windowId_fkey"
    FOREIGN KEY ("windowId") REFERENCES "CourseEvaluationWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationResponse" ADD CONSTRAINT "CourseEvaluationResponse_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationReceipt" ADD CONSTRAINT "CourseEvaluationReceipt_windowId_fkey"
    FOREIGN KEY ("windowId") REFERENCES "CourseEvaluationWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEvaluationReceipt" ADD CONSTRAINT "CourseEvaluationReceipt_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
