-- Dining back office: dietary profiles, inventory, meal budgets, menu schedule.
-- Additive only: five new tables reusing the existing "MealPeriod" enum. No
-- existing table is altered and no data moves. Money stays integer XOF;
-- stock quantities are DOUBLE PRECISION because kilograms are fractional.

-- CreateTable
CREATE TABLE "DietaryProfile" (
    "id"           TEXT NOT NULL,
    "studentId"    TEXT NOT NULL,
    "restrictions" TEXT[] NOT NULL DEFAULT '{}',
    "allergies"    TEXT[] NOT NULL DEFAULT '{}',
    "notes"        TEXT,
    "updatedById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DietaryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "unit"           TEXT NOT NULL DEFAULT 'pcs',
    "qtyOnHand"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderLevel"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerUnitXof" INTEGER NOT NULL DEFAULT 0,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryItem_cost_non_negative" CHECK ("costPerUnitXof" >= 0),
    CONSTRAINT "InventoryItem_qty_non_negative" CHECK ("qtyOnHand" >= 0)
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id"        TEXT NOT NULL,
    "itemId"    TEXT NOT NULL,
    "delta"     DOUBLE PRECISION NOT NULL,
    "reason"    TEXT NOT NULL,
    "actorId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryMovement_delta_non_zero" CHECK ("delta" <> 0)
);

-- CreateTable
CREATE TABLE "MealBudget" (
    "id"                TEXT NOT NULL,
    "date"              DATE NOT NULL,
    "period"            "MealPeriod" NOT NULL,
    "plannedServings"   INTEGER NOT NULL,
    "costPerServingXof" INTEGER NOT NULL,
    "notes"             TEXT,
    "createdById"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealBudget_servings_positive" CHECK ("plannedServings" > 0),
    CONSTRAINT "MealBudget_cost_non_negative" CHECK ("costPerServingXof" >= 0)
);

-- CreateTable
CREATE TABLE "MenuSchedule" (
    "id"         TEXT NOT NULL,
    "date"       DATE NOT NULL,
    "period"     "MealPeriod" NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "plannedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MenuSchedule_qty_non_negative" CHECK ("plannedQty" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "DietaryProfile_studentId_key" ON "DietaryProfile"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_key" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_idx" ON "InventoryMovement"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MealBudget_date_period_key" ON "MealBudget"("date", "period");

-- CreateIndex
CREATE INDEX "MealBudget_date_idx" ON "MealBudget"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MenuSchedule_date_period_menuItemId_key" ON "MenuSchedule"("date", "period", "menuItemId");

-- CreateIndex
CREATE INDEX "MenuSchedule_date_idx" ON "MenuSchedule"("date");

-- AddForeignKey
ALTER TABLE "DietaryProfile" ADD CONSTRAINT "DietaryProfile_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuSchedule" ADD CONSTRAINT "MenuSchedule_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
