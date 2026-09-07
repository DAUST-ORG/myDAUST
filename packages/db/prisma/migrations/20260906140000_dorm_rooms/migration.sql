-- Managed dorm registry. New table only; Hall and HousingAssignment rows are
-- untouched, and resident `room` values keep matching by normalized text.
CREATE TABLE IF NOT EXISTS "DormRoom" (
  "id" TEXT NOT NULL,
  "hallId" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "roomNo" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "note" TEXT,
  CONSTRAINT "DormRoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DormRoom_hallId_roomNo_key" ON "DormRoom"("hallId", "roomNo");
CREATE INDEX IF NOT EXISTS "DormRoom_hallId_floor_idx" ON "DormRoom"("hallId", "floor");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DormRoom_hallId_fkey'
  ) THEN
    ALTER TABLE "DormRoom" ADD CONSTRAINT "DormRoom_hallId_fkey"
      FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
