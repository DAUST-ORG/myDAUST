import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { parseStudentBillingManifest } from "./student-billing-import.manifest.js";
import {
  planStudentBillingImportFromDatabase,
  studentBillingDryRunExitCode,
} from "./student-billing-import.runner.js";

const MAX_MANIFEST_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BILLING_IMPORT_MANIFEST_PATH: z.string().trim().min(1),
  BILLING_IMPORT_WORKBOOK_PATH: z.string().trim().min(1),
  CONFIRM: z.enum(["0", "1"]).default("0"),
});

async function readBounded(path: string, maxBytes: number, label: string) {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file`);
  if (metadata.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  return readFile(path);
}

function summarise(
  blockers: readonly { code: string }[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const blocker of blockers) {
    counts.set(blocker.code, (counts.get(blocker.code) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

async function main(): Promise<void> {
  const env = environmentSchema.parse(process.env);
  const manifestPath = resolve(env.BILLING_IMPORT_MANIFEST_PATH);
  const workbookPath = resolve(env.BILLING_IMPORT_WORKBOOK_PATH);
  const [manifestBytes, workbookBytes] = await Promise.all([
    readBounded(manifestPath, MAX_MANIFEST_BYTES, "Billing manifest"),
    readBounded(workbookPath, MAX_WORKBOOK_BYTES, "Billing source workbook"),
  ]);

  const { manifest, manifestSha256 } =
    parseStudentBillingManifest(manifestBytes);
  const workbookSha256 = createHash("sha256")
    .update(workbookBytes)
    .digest("hex");
  if (workbookSha256 !== manifest.sourceWorkbookSha256) {
    throw new Error(
      `Workbook digest ${workbookSha256} does not match the manifest's ${manifest.sourceWorkbookSha256}; the manifest was prepared against a different file`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const dryRun = await planStudentBillingImportFromDatabase(prisma, manifest);
    const { plan } = dryRun;
    console.log(
      JSON.stringify(
        {
          event: "student-billing-import",
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          ok: dryRun.ok,
          manifestSha256,
          workbookSha256,
          academicYearLabel: plan.academicYearLabel,
          rowCount: plan.rowCount,
          totals: plan.totals,
          missingCatalogKeys: dryRun.missingCatalogKeys,
          blockerCount: plan.blockers.length,
          blockersByCode: summarise(plan.blockers),
          warningCount: plan.warnings.length,
        },
        null,
        2,
      ),
    );
    for (const blocker of plan.blockers.slice(0, 100)) {
      console.error(
        `BLOCKER ${blocker.code} row=${blocker.rowNumber ?? "-"} ${blocker.subject}: ${blocker.detail}`,
      );
    }
    if (plan.blockers.length > 100) {
      console.error(
        `... ${plan.blockers.length - 100} further blockers not printed`,
      );
    }
    for (const warning of plan.warnings) console.error(`WARNING ${warning}`);

    if (env.CONFIRM === "1") {
      throw new Error(
        "CONFIRM=1 is refused: the billing import write path is not implemented. This tool plans only.",
      );
    }
    if (!dryRun.ok) process.exitCode = studentBillingDryRunExitCode;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
