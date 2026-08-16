import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  LegacyCohortExtractionMismatchError,
  parseTrustedLegacyCohortExtraction,
  verifyLegacyCohortManifestExtraction,
} from "./legacy-cohort-import.extraction.js";
import {
  parseLegacyCohortManifest,
  verifyLegacyCohortExclusionReviewArtifacts,
} from "./legacy-cohort-import.manifest.js";
import {
  LegacyCohortImportBlockedError,
  executeLegacyCohortImport,
  legacyCohortDryRunExitCode,
  planLegacyCohortImport,
} from "./legacy-cohort-import.runner.js";

const MAX_JSON_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const environmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    LEGACY_COHORT_IMPORT_MANIFEST_PATH: z.string().trim().min(1),
    LEGACY_COHORT_IMPORT_EXTRACTION_PATH: z.string().trim().min(1),
    LEGACY_COHORT_IMPORT_WORKBOOK_PATH: z.string().trim().min(1),
    LEGACY_COHORT_IMPORT_REVIEW_WORKBOOK_PATH: z
      .string()
      .trim()
      .min(1)
      .optional(),
    LEGACY_COHORT_IMPORT_HOLD_NOTES_PATH: z.string().trim().min(1).optional(),
    LEGACY_COHORT_IMPORT_ACTOR_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    LEGACY_COHORT_IMPORT_PLAN_SHA256: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/)
      .transform((value) => value.toLowerCase())
      .optional(),
    CONFIRM: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    if (env.CONFIRM === "1" && !env.LEGACY_COHORT_IMPORT_PLAN_SHA256) {
      ctx.addIssue({
        code: "custom",
        path: ["LEGACY_COHORT_IMPORT_PLAN_SHA256"],
        message: "Confirmation requires the exact clean dry-run plan SHA-256",
      });
    }
  });

async function readBounded(path: string, maxBytes: number, label: string) {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file`);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must use owner-only permissions (chmod 600)`);
  }
  if (metadata.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  return readFile(path);
}

function aggregatePlanForLog(
  plan: Awaited<ReturnType<typeof planLegacyCohortImport>>,
) {
  const { actorId: _actorId, ...rest } = plan;
  return {
    ...rest,
    blockers: plan.blockers.map(({ code, message, details }) => ({
      code,
      message,
      details,
    })),
    warnings: plan.warnings.map(({ code, message }) => ({ code, message })),
  };
}

function safeBlockedDetails(details: Record<string, unknown>) {
  const blockers = Array.isArray(details.blockers)
    ? details.blockers.map((blocker) => {
        if (!blocker || typeof blocker !== "object") return blocker;
        const {
          code,
          message,
          details: blockerDetails,
        } = blocker as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
        };
        return { code, message, details: blockerDetails };
      })
    : undefined;
  return blockers ? { ...details, blockers } : details;
}

async function main(): Promise<void> {
  const env = environmentSchema.parse(process.env);
  const mode = env.CONFIRM === "1" ? "confirm" : "dry-run";
  const manifestPath = resolve(env.LEGACY_COHORT_IMPORT_MANIFEST_PATH);
  const extractionPath = resolve(env.LEGACY_COHORT_IMPORT_EXTRACTION_PATH);
  const workbookPath = resolve(env.LEGACY_COHORT_IMPORT_WORKBOOK_PATH);
  const [manifestBytes, extractionBytes, workbookBytes] = await Promise.all([
    readBounded(manifestPath, MAX_JSON_BYTES, "Legacy cohort manifest"),
    readBounded(extractionPath, MAX_JSON_BYTES, "Legacy cohort extraction"),
    readBounded(workbookPath, MAX_WORKBOOK_BYTES, "Legacy cohort workbook"),
  ]);
  const manifest = parseLegacyCohortManifest(manifestBytes);
  const extraction = parseTrustedLegacyCohortExtraction(extractionBytes);
  verifyLegacyCohortManifestExtraction(manifest, extraction);
  if (manifest.exclusionReview) {
    if (
      !env.LEGACY_COHORT_IMPORT_REVIEW_WORKBOOK_PATH ||
      !env.LEGACY_COHORT_IMPORT_HOLD_NOTES_PATH
    ) {
      throw new LegacyCohortImportBlockedError(
        "Reviewed exclusions require explicit review-workbook and hold-notes paths",
        {},
      );
    }
    const reviewWorkbookPath = resolve(
      env.LEGACY_COHORT_IMPORT_REVIEW_WORKBOOK_PATH,
    );
    const holdNotesPath = resolve(env.LEGACY_COHORT_IMPORT_HOLD_NOTES_PATH);
    const [reviewWorkbookBytes, holdNotesBytes] = await Promise.all([
      readBounded(
        reviewWorkbookPath,
        MAX_WORKBOOK_BYTES,
        "Legacy cohort review workbook",
      ),
      readBounded(holdNotesPath, MAX_JSON_BYTES, "Legacy cohort hold notes"),
    ]);
    verifyLegacyCohortExclusionReviewArtifacts(manifest, {
      reviewWorkbook: {
        fileName: basename(reviewWorkbookPath),
        bytes: reviewWorkbookBytes,
      },
      holdNotes: {
        fileName: basename(holdNotesPath),
        bytes: holdNotesBytes,
      },
    });
  }
  const workbookSha256 = createHash("sha256")
    .update(workbookBytes)
    .digest("hex");
  if (workbookSha256 !== manifest.sourceWorkbook.sha256) {
    throw new LegacyCohortImportBlockedError(
      "Source workbook SHA-256 does not match the reviewed manifest",
      { expected: manifest.sourceWorkbook.sha256, received: workbookSha256 },
    );
  }
  if (basename(workbookPath) !== manifest.sourceWorkbook.fileName) {
    throw new LegacyCohortImportBlockedError(
      "Source workbook file name does not match the reviewed manifest",
      {
        expected: manifest.sourceWorkbook.fileName,
        received: basename(workbookPath),
      },
    );
  }

  const prisma = new PrismaClient();
  const invocation = { actorEmail: env.LEGACY_COHORT_IMPORT_ACTOR_EMAIL };
  try {
    const plan = await planLegacyCohortImport(prisma, manifest, invocation);
    const safePlan = aggregatePlanForLog(plan);
    console.log(
      JSON.stringify(
        {
          event: "legacy-cohort-import",
          ok: plan.blockers.length === 0,
          mode,
          ...safePlan,
          actor: "<authorized>",
        },
        null,
        2,
      ),
    );
    if (plan.alreadyImportedBatchId && mode === "dry-run") {
      console.log(
        "Exact workbook and manifest were already imported; no changes are required.",
      );
      return;
    }
    if (mode === "dry-run") {
      console.log(
        plan.blockers.length === 0
          ? `Dry run is clean. Review and confirm only with plan SHA-256 ${plan.planSha256}.`
          : "Dry run is blocked. Resolve every reported decision before confirmation.",
      );
      process.exitCode = legacyCohortDryRunExitCode(plan);
      return;
    }
    const result = await executeLegacyCohortImport(
      prisma,
      manifest,
      extraction,
      invocation,
      env.LEGACY_COHORT_IMPORT_PLAN_SHA256!,
    );
    console.log(
      JSON.stringify(
        {
          event: "legacy-cohort-import",
          ok: true,
          mode,
          result,
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
  if (error instanceof LegacyCohortImportBlockedError) {
    console.error(
      JSON.stringify({
        event: "legacy-cohort-import",
        ok: false,
        blocked: true,
        error: error.message,
        details: safeBlockedDetails(error.details),
      }),
    );
  } else if (error instanceof LegacyCohortExtractionMismatchError) {
    console.error(
      JSON.stringify({
        event: "legacy-cohort-import",
        ok: false,
        blocked: true,
        error: error.message,
        issues: error.issues,
      }),
    );
  } else if (error instanceof z.ZodError) {
    console.error(
      JSON.stringify({
        event: "legacy-cohort-import",
        ok: false,
        blocked: true,
        error: "Legacy cohort configuration or manifest is invalid",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    );
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
