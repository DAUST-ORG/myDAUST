import "dotenv/config";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  TranscriptImportObjectKeySchema,
  parseHistoricalTranscriptManifest,
  prepareHistoricalImport,
} from "./historical-import.manifest.js";
import {
  HistoricalImportBlockedError,
  executeHistoricalImport,
  planHistoricalImport,
} from "./historical-import.runner.js";
import { HistoricalImportStorage } from "./historical-import.storage.js";

const cliEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TRANSCRIPT_IMPORT_BUCKET: z.string().trim().min(3),
  TRANSCRIPT_IMPORT_MANIFEST_KEY: TranscriptImportObjectKeySchema,
  TRANSCRIPT_IMPORT_ACTOR_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  AWS_REGION: z.string().trim().min(3).default("us-east-1"),
  CONFIRM: z.enum(["0", "1"]).default("0"),
});

function printablePlan(
  plan: Awaited<ReturnType<typeof planHistoricalImport>>,
  context: {
    mode: "dry-run" | "confirm";
    manifestObjectKey: string;
    workbookObjectKey: string;
    workbookSha256: string;
    workbookBytes: number;
  },
) {
  return {
    ...context,
    ...plan,
    actorId: "<authorized>",
    unmatchedCourseCodes: plan.unmatchedCourseCodes.slice(0, 100),
    unmatchedCourseCodeCount: plan.unmatchedCourseCodes.length,
    unmatchedTermLabels: plan.unmatchedTermLabels.slice(0, 100),
    unmatchedTermLabelCount: plan.unmatchedTermLabels.length,
  };
}

async function main(): Promise<void> {
  const env = cliEnvironmentSchema.parse(process.env);
  const mode = env.CONFIRM === "1" ? "confirm" : "dry-run";
  const storage = new HistoricalImportStorage(
    env.TRANSCRIPT_IMPORT_BUCKET,
    env.AWS_REGION,
  );

  const manifestBytes = await storage.getManifest(
    env.TRANSCRIPT_IMPORT_MANIFEST_KEY,
  );
  const manifest = parseHistoricalTranscriptManifest(manifestBytes);
  const workbook = await storage.verifyWorkbook(
    manifest.sourceWorkbook.objectKey,
    manifest.sourceWorkbook.sha256,
  );
  const prepared = prepareHistoricalImport(manifest);
  const invocation = {
    actorEmail: env.TRANSCRIPT_IMPORT_ACTOR_EMAIL,
    manifestObjectKey: env.TRANSCRIPT_IMPORT_MANIFEST_KEY,
  };

  const prisma = new PrismaClient();
  try {
    const plan = await planHistoricalImport(
      prisma,
      manifest,
      prepared,
      invocation,
    );
    console.log(
      JSON.stringify(
        printablePlan(plan, {
          mode,
          manifestObjectKey: env.TRANSCRIPT_IMPORT_MANIFEST_KEY,
          workbookObjectKey: manifest.sourceWorkbook.objectKey,
          workbookSha256: workbook.sha256,
          workbookBytes: workbook.byteLength,
        }),
        null,
        2,
      ),
    );

    if (plan.alreadyImportedBatchId) {
      console.log(
        `Workbook was already imported in batch ${plan.alreadyImportedBatchId}; no changes made.`,
      );
      return;
    }
    if (mode === "dry-run") {
      console.log(
        "Dry run complete. Re-run with CONFIRM=1 to commit atomically.",
      );
      return;
    }

    const result = await executeHistoricalImport(
      prisma,
      manifest,
      prepared,
      invocation,
    );
    console.log(JSON.stringify({ mode, result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof HistoricalImportBlockedError) {
    console.error(
      JSON.stringify(
        { error: error.message, blocked: true, details: error.details },
        null,
        2,
      ),
    );
  } else if (error instanceof z.ZodError) {
    console.error(
      JSON.stringify(
        {
          error: "Transcript import configuration or manifest is invalid",
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
