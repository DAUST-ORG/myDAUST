-- CreateEnum
CREATE TYPE "MealPeriod" AS ENUM ('breakfast', 'lunch', 'dinner');

-- CreateEnum
CREATE TYPE "MealPlanType" AS ENUM ('none', 'half', 'full');

-- CreateEnum
CREATE TYPE "DiningOrderStatus" AS ENUM ('cart', 'paid', 'preparing', 'ready', 'collected', 'cancelled');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('served', 'turned_away');

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "MealPlanType" NOT NULL DEFAULT 'none',
    "term" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'weekend',
    "priceXof" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningOrder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DiningOrderStatus" NOT NULL DEFAULT 'cart',
    "totalXof" INTEGER NOT NULL DEFAULT 0,
    "pickupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "priceXof" INTEGER NOT NULL,

    CONSTRAINT "DiningOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningScan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "period" "MealPeriod" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "result" "ScanResult" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_studentId_key" ON "MealPlan"("studentId");

-- CreateIndex
CREATE INDEX "DiningOrder_studentId_idx" ON "DiningOrder"("studentId");

-- CreateIndex
CREATE INDEX "DiningOrder_status_idx" ON "DiningOrder"("status");

-- CreateIndex
CREATE INDEX "DiningOrderItem_orderId_idx" ON "DiningOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DiningScan_date_period_idx" ON "DiningScan"("date", "period");

-- CreateIndex
CREATE UNIQUE INDEX "DiningScan_studentId_period_date_key" ON "DiningScan"("studentId", "period", "date");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrder" ADD CONSTRAINT "DiningOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrderItem" ADD CONSTRAINT "DiningOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DiningOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrderItem" ADD CONSTRAINT "DiningOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningScan" ADD CONSTRAINT "DiningScan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
