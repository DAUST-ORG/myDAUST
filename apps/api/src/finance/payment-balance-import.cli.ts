import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { auditPaymentBalanceImportBatch } from "./payment-balance-import.audit.js";
import {
  PaymentBalanceExtractionMismatchError,
  parseTrustedPaymentBalanceExtraction,
  verifyPaymentBalanceManifestExtraction,
} from "./payment-balance-import.extraction.js";
import { parsePaymentBalanceImportManifest } from "./payment-balance-import.manifest.js";
import {
  PaymentBalanceImportBlockedError,
  executePaymentBalanceImport,
  planPaymentBalanceImportFromDatabase,
} from "./payment-balance-import.runner.js";

const MAX_MANIFEST_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTION_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PAYMENT_BALANCE_IMPORT_MANIFEST_PATH: z.string().trim().min(1),
    PAYMENT_BALANCE_IMPORT_EXTRACTION_PATH: z.string().trim().min(1),
    PAYMENT_BALANCE_IMPORT_WORKBOOK_PATH: z.string().trim().min(1),
    PAYMENT_BALANCE_IMPORT_ACTOR_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    PAYMENT_BALANCE_IMPORT_PLAN_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    CONFIRM: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    if (env.CONFIRM === "1" && !env.PAYMENT_BALANCE_IMPORT_PLAN_SHA256) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_BALANCE_IMPORT_PLAN_SHA256"],
        message: "CONFIRM=1 requires the exact reviewed dry-run plan SHA-256",
      });
    }
  });

async function readPrivateBounded(
  path: string,
  maxBytes: number,
  label: string,
): Promise<Buffer> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file`);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must be mode 0600 or stricter`);
  }
  if (metadata.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  return readFile(path);
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const env = EnvironmentSchema.parse(process.env);
  const manifestPath = resolve(env.PAYMENT_BALANCE_IMPORT_MANIFEST_PATH);
  const extractionPath = resolve(env.PAYMENT_BALANCE_IMPORT_EXTRACTION_PATH);
  const workbookPath = resolve(env.PAYMENT_BALANCE_IMPORT_WORKBOOK_PATH);
  const [manifestBytes, extractionBytes, workbookBytes] = await Promise.all([
    readPrivateBounded(
      manifestPath,
      MAX_MANIFEST_BYTES,
      "Paid-to-date manifest",
    ),
    readPrivateBounded(
      extractionPath,
      MAX_EXTRACTION_BYTES,
      "Trusted paid-to-date extraction",
    ),
    readPrivateBounded(
      workbookPath,
      MAX_WORKBOOK_BYTES,
      "Paid-to-date source workbook",
    ),
  ]);
  const manifest = parsePaymentBalanceImportManifest(manifestBytes);
  const extraction = parseTrustedPaymentBalanceExtraction(extractionBytes);
  if (digest(extractionBytes) !== manifest.trustedExtraction.sha256) {
    throw new PaymentBalanceImportBlockedError(
      "Trusted extraction SHA-256 does not match the reviewed manifest",
      {},
    );
  }
  verifyPaymentBalanceManifestExtraction(manifest, extraction);
  if (digest(workbookBytes) !== manifest.sourceWorkbook.sha256) {
    throw new PaymentBalanceImportBlockedError(
      "Source workbook SHA-256 does not match the reviewed manifest",
      {},
    );
  }
  if (basename(workbookPath) !== manifest.sourceWorkbook.fileName) {
    throw new PaymentBalanceImportBlockedError(
      "Source workbook file name does not match the reviewed manifest",
      {},
    );
  }

  const prisma = new PrismaClient();
  try {
    const invocation = { actorEmail: env.PAYMENT_BALANCE_IMPORT_ACTOR_EMAIL };
    const plan = await planPaymentBalanceImportFromDatabase(
      prisma,
      manifest,
      invocation,
    );
    console.log(
      JSON.stringify(
        {
          event: "payment-balance-import",
          ok: true,
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          alreadyImportedBatchId: plan.alreadyImportedBatchId,
          sourceWorkbookSha256: plan.sourceWorkbookSha256,
          trustedExtractionSha256: plan.trustedExtractionSha256,
          manifestSha256: plan.manifestSha256,
          planSha256: plan.planSha256,
          capturedAt: plan.capturedAt,
          sourceRows: manifest.sourceRowCount,
          postableRows: plan.postableRows,
          alreadyReconciledRows: plan.alreadyReconciledRows,
          previouslyImportedRows: plan.previouslyImportedRows,
          heldRows: plan.heldRows,
          sourcePaidTotalXof: plan.sourcePaidTotalXof,
          resolvedSourcePaidXof: plan.resolvedSourcePaidXof,
          heldSourcePaidXof: plan.heldSourcePaidXof,
          baselineLedgerPaidXof: plan.baselineLedgerPaidXof,
          importedDeltaXof: plan.importedDeltaXof,
          holdCounts: plan.holdCounts,
          actorId: "<authorized>",
        },
        null,
        2,
      ),
    );
    if (plan.alreadyImportedBatchId || env.CONFIRM === "0") return;
    const result = await executePaymentBalanceImport(prisma, manifest, {
      ...invocation,
      expectedPlanSha256: env.PAYMENT_BALANCE_IMPORT_PLAN_SHA256!,
    });
    console.log(
      JSON.stringify(
        { event: "payment-balance-import", ok: true, mode: "confirm", result },
        null,
        2,
      ),
    );
    const audit = await auditPaymentBalanceImportBatch(prisma, result.batchId);
    const replay = await executePaymentBalanceImport(prisma, manifest, {
      ...invocation,
      expectedPlanSha256: env.PAYMENT_BALANCE_IMPORT_PLAN_SHA256!,
    });
    if (!replay.alreadyImported || replay.batchId !== result.batchId) {
      throw new Error("Exact paid-to-date replay was not a no-op");
    }
    const replayAudit = await auditPaymentBalanceImportBatch(
      prisma,
      result.batchId,
    );
    if (JSON.stringify(audit) !== JSON.stringify(replayAudit)) {
      throw new Error("Exact paid-to-date replay changed post-audit controls");
    }
    console.log(
      JSON.stringify(
        {
          event: "payment-balance-import-post-audit",
          ok: true,
          audit,
          exactReplayNoOp: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof PaymentBalanceImportBlockedError) {
    console.error(
      JSON.stringify(
        {
          event: "payment-balance-import",
          ok: false,
          blocked: true,
          error: error.message,
          details: error.details,
        },
        null,
        2,
      ),
    );
  } else if (error instanceof PaymentBalanceExtractionMismatchError) {
    console.error(
      JSON.stringify(
        {
          event: "payment-balance-import",
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
          event: "payment-balance-import",
          ok: false,
          blocked: true,
          error: "Paid-to-date import configuration or manifest is invalid",
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
