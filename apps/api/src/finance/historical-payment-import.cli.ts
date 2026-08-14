import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  HistoricalPaymentExtractionMismatchError,
  parseTrustedHistoricalPaymentExtraction,
  verifyHistoricalPaymentManifestExtraction,
} from "./historical-payment-import.extraction.js";
import { parseHistoricalPaymentManifest } from "./historical-payment-import.manifest.js";
import {
  HistoricalPaymentImportBlockedError,
  executeHistoricalPaymentImport,
  historicalPaymentDryRunExitCode,
  planHistoricalPaymentImport,
} from "./historical-payment-import.runner.js";

const MAX_MANIFEST_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTION_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PAYMENT_IMPORT_MANIFEST_PATH: z.string().trim().min(1),
  PAYMENT_IMPORT_EXTRACTION_PATH: z.string().trim().min(1),
  PAYMENT_IMPORT_WORKBOOK_PATH: z.string().trim().min(1),
  PAYMENT_IMPORT_ACTOR_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
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

function printablePlan(
  plan: Awaited<ReturnType<typeof planHistoricalPaymentImport>>,
  mode: "dry-run" | "confirm",
) {
  const { payments, actorId: _actorId, ...summary } = plan;
  const byMethod = new Map<string, { rows: number; amountXof: number }>();
  const byMonth = new Map<string, { rows: number; amountXof: number }>();
  for (const payment of payments) {
    if (payment.skippedAsExistingPaymentId) continue;
    const method = byMethod.get(payment.method) ?? { rows: 0, amountXof: 0 };
    method.rows += 1;
    method.amountXof += payment.amountXof;
    byMethod.set(payment.method, method);
    const monthKey = payment.settledOn.slice(0, 7);
    const month = byMonth.get(monthKey) ?? { rows: 0, amountXof: 0 };
    month.rows += 1;
    month.amountXof += payment.amountXof;
    byMonth.set(monthKey, month);
  }
  return {
    event: "historical-payment-import",
    ok: summary.blockers.length === 0,
    mode,
    ...summary,
    actorId: "<authorized>",
    byMethod: Object.fromEntries([...byMethod.entries()].sort()),
    byMonth: Object.fromEntries([...byMonth.entries()].sort()),
  };
}

async function main(): Promise<void> {
  const env = environmentSchema.parse(process.env);
  const mode = env.CONFIRM === "1" ? "confirm" : "dry-run";
  const manifestPath = resolve(env.PAYMENT_IMPORT_MANIFEST_PATH);
  const extractionPath = resolve(env.PAYMENT_IMPORT_EXTRACTION_PATH);
  const workbookPath = resolve(env.PAYMENT_IMPORT_WORKBOOK_PATH);
  const [manifestBytes, extractionBytes, workbookBytes] = await Promise.all([
    readBounded(manifestPath, MAX_MANIFEST_BYTES, "Payment import manifest"),
    readBounded(
      extractionPath,
      MAX_EXTRACTION_BYTES,
      "Trusted payment extraction",
    ),
    readBounded(workbookPath, MAX_WORKBOOK_BYTES, "Payment source workbook"),
  ]);
  const manifest = parseHistoricalPaymentManifest(manifestBytes);
  const extraction = parseTrustedHistoricalPaymentExtraction(extractionBytes);
  verifyHistoricalPaymentManifestExtraction(manifest, extraction);
  const workbookSha256 = createHash("sha256")
    .update(workbookBytes)
    .digest("hex");
  if (workbookSha256 !== manifest.sourceWorkbook.sha256) {
    throw new HistoricalPaymentImportBlockedError(
      "Source workbook SHA-256 does not match the reviewed manifest",
      {
        expected: manifest.sourceWorkbook.sha256,
        received: workbookSha256,
      },
    );
  }
  if (basename(workbookPath) !== manifest.sourceWorkbook.fileName) {
    throw new HistoricalPaymentImportBlockedError(
      "Source workbook file name does not match the reviewed manifest",
      {
        expected: manifest.sourceWorkbook.fileName,
        received: basename(workbookPath),
      },
    );
  }

  const invocation = {
    actorEmail: env.PAYMENT_IMPORT_ACTOR_EMAIL,
  };
  const prisma = new PrismaClient();
  try {
    const plan = await planHistoricalPaymentImport(
      prisma,
      manifest,
      invocation,
    );
    console.log(JSON.stringify(printablePlan(plan, mode), null, 2));
    if (plan.alreadyImportedBatchId) {
      console.log(
        `Workbook was already imported in batch ${plan.alreadyImportedBatchId}; no changes made.`,
      );
      return;
    }
    if (mode === "dry-run") {
      console.log(
        plan.blockers.length === 0
          ? "Dry run is clean. Re-run with CONFIRM=1 only after reviewing this exact report."
          : "Dry run is blocked. Resolve every reported row before any commit.",
      );
      process.exitCode = historicalPaymentDryRunExitCode(plan);
      return;
    }
    if (plan.blockers.length > 0) {
      throw new HistoricalPaymentImportBlockedError(
        "Confirmation refused because the dry-run plan contains blockers",
        { blockers: plan.blockers.slice(0, 200) },
      );
    }
    const result = await executeHistoricalPaymentImport(
      prisma,
      manifest,
      invocation,
    );
    console.log(
      JSON.stringify(
        { event: "historical-payment-import", ok: true, mode, result },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof HistoricalPaymentImportBlockedError) {
    console.error(
      JSON.stringify(
        {
          event: "historical-payment-import",
          ok: false,
          blocked: true,
          error: error.message,
          details: error.details,
        },
        null,
        2,
      ),
    );
  } else if (error instanceof HistoricalPaymentExtractionMismatchError) {
    console.error(
      JSON.stringify(
        {
          event: "historical-payment-import",
          ok: false,
          blocked: true,
          error: error.message,
          issues: error.issues,
        },
        null,
        2,
      ),
    );
  } else if (error instanceof z.ZodError) {
    console.error(
      JSON.stringify(
        {
          event: "historical-payment-import",
          ok: false,
          blocked: true,
          error: "Payment import configuration or manifest is invalid",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
