-- CreateTable
CREATE TABLE "FeeItem" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minXof" INTEGER NOT NULL,
    "maxXof" INTEGER,
    "period" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeeItem_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScholarshipTier" (
    "id" TEXT NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "pct" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ScholarshipTier_pkey" PRIMARY KEY ("id")
);
