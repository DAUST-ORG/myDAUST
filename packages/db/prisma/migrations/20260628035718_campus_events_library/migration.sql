-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Campus',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryResource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'book',
    "subject" TEXT,
    "callNumber" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LibraryResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "LibraryResource_title_idx" ON "LibraryResource"("title");
