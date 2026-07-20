import { PrismaClient } from "@prisma/client";
import { seedSisReference } from "./sis-reference.js";

/**
 * Loads SIS reference data into an ALREADY-BOOTSTRAPPED database.
 *
 * bootstrap-prod.ts refuses to run once a database holds students, so a prod
 * environment that was bootstrapped before the SIS redesign has no grading
 * scales, catalogue years, degree requirements or fee schedule — leaving those
 * screens empty. This script loads exactly that reference data and nothing else.
 *
 * Safe against production: it writes only official configuration, touches no
 * student, invoice or payment row, and is idempotent (upserts keyed on natural
 * unique columns), so re-running is a no-op rather than a duplicate.
 *
 *   DATABASE_URL=... pnpm --filter @mydaust/db run load:sis-reference
 */
const prisma = new PrismaClient();

async function main() {
  const [students, invoices, payments] = await Promise.all([
    prisma.student.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
  ]);
  console.log(
    `Target database: ${students} students, ${invoices} invoices, ${payments} payments (all left untouched).`,
  );

  await seedSisReference(prisma);

  const [schemes, years, requirements, fees] = await Promise.all([
    prisma.gradingScheme.count(),
    prisma.academicYear.count(),
    prisma.programRequirement.count(),
    prisma.feePlanInstallment.count(),
  ]);
  console.log(
    `Loaded: ${schemes} grading schemes, ${years} catalogue years, ${requirements} requirement buckets, ${fees} fee installments.`,
  );

  // The money rows must be exactly as we found them.
  const [studentsAfter, invoicesAfter, paymentsAfter] = await Promise.all([
    prisma.student.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
  ]);
  if (studentsAfter !== students || invoicesAfter !== invoices || paymentsAfter !== payments) {
    throw new Error(
      `Refusing to finish: row counts changed (students ${students}->${studentsAfter}, ` +
        `invoices ${invoices}->${invoicesAfter}, payments ${payments}->${paymentsAfter}).`,
    );
  }
  console.log("Verified: no student, invoice or payment row was created or removed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
