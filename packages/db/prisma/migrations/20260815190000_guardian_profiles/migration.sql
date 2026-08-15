CREATE TABLE "GuardianProfile" (
    "guardianId" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianProfile_pkey" PRIMARY KEY ("guardianId")
);

ALTER TABLE "GuardianProfile"
ADD CONSTRAINT "GuardianProfile_guardianId_fkey"
FOREIGN KEY ("guardianId") REFERENCES "Person"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
