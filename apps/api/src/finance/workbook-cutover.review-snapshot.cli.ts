import "dotenv/config";
import { isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  assertWorkbookCutoverProductionSnapshotBaseline,
  captureWorkbookCutoverProductionSnapshotReadOnly,
  writeWorkbookCutoverProductionSnapshotFile,
} from "./workbook-cutover.review-snapshot.js";

const AcademicYearLabelSchema = z
  .string()
  .trim()
  .regex(/^\d{4}[-–]\d{4}$/)
  .refine((label) => {
    const match = /^(\d{4})[-–](\d{4})$/.exec(label);
    return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
  }, "Academic year must contain consecutive years");

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().trim().min(1),
    CUTOVER_ACADEMIC_YEAR_LABEL: AcademicYearLabelSchema,
    CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH: z.string().trim().min(1),
  })
  .strict();

async function main(): Promise<void> {
  const env = EnvironmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    CUTOVER_ACADEMIC_YEAR_LABEL: process.env.CUTOVER_ACADEMIC_YEAR_LABEL,
    CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH:
      process.env.CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH,
  });
  if (!isAbsolute(env.CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH)) {
    throw new Error("Production snapshot output path must be absolute");
  }
  const outputPath = resolve(env.CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH);
  const academicYearStart = Number(env.CUTOVER_ACADEMIC_YEAR_LABEL.slice(0, 4));
  const prisma = new PrismaClient();
  try {
    const snapshot = await captureWorkbookCutoverProductionSnapshotReadOnly(
      prisma,
      {
        academicYearLabel: env.CUTOVER_ACADEMIC_YEAR_LABEL,
        academicYearStart,
      },
    );
    assertWorkbookCutoverProductionSnapshotBaseline(snapshot);
    const artifact = await writeWorkbookCutoverProductionSnapshotFile(
      outputPath,
      snapshot,
    );
    console.log(
      JSON.stringify(
        {
          event: "workbook-cutover-production-review-snapshot-exported",
          ok: true,
          mode: "read-only",
          transaction: "REPEATABLE READ / READ ONLY",
          academicYearLabel: snapshot.academicYearLabel,
          sourceAsOfDate: snapshot.sourceAsOfDate,
          capturedAt: snapshot.capturedAt,
          controls: snapshot.controls,
          fileBytes: artifact.bytes,
          fileSha256: artifact.fileSha256,
          canonicalSha256: artifact.canonicalSha256,
          output: "<private-mode-0600-file>",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    const issueCounts = error.issues.reduce<Record<string, number>>(
      (counts, issue) => {
        counts[issue.code] = (counts[issue.code] ?? 0) + 1;
        return counts;
      },
      {},
    );
    console.error(
      JSON.stringify(
        {
          event: "workbook-cutover-production-review-snapshot-exported",
          ok: false,
          blocked: true,
          failureCode: "production_snapshot_validation_failed",
          issueCounts,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(
      JSON.stringify(
        {
          event: "workbook-cutover-production-review-snapshot-exported",
          ok: false,
          blocked: true,
          failureCode: "production_snapshot_export_failed",
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
});
