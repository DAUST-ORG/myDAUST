import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { link, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auditWorkbookCutoverBatch } from "./workbook-cutover.audit.js";
import {
  WorkbookCutoverExtractionMismatchError,
  parseWorkbookCutoverProductionSnapshot,
  parseWorkbookCutoverTrustedExtraction,
  verifyWorkbookCutoverManifestExtraction,
  verifyWorkbookCutoverManifestProductionSnapshot,
} from "./workbook-cutover.extraction.js";
import { parseWorkbookCutoverManifest } from "./workbook-cutover.manifest.js";
import {
  WorkbookCutoverBlockedError,
  executeWorkbookCutover,
  planWorkbookCutoverFromDatabase,
  type WorkbookCutoverNewStudentCredential,
} from "./workbook-cutover.runner.js";

const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const CredentialExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal(
      "myDAUST SIS login only; no Google Workspace mailbox was created",
    ),
    confirmationPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.string().datetime({ offset: true }),
    mandatoryPasswordChange: z.literal(true),
    credentials: z
      .array(
        z
          .object({
            sourceKey: z.string().trim().min(1).max(240),
            studentNo: z.string().trim().min(1).max(64),
            loginEmail: z.string().trim().email().max(320),
            firstName: z.string().trim().min(1).max(160),
            lastName: z.string().trim().min(1).max(160),
            temporaryPassword: z.string().min(20).max(256),
          })
          .strict(),
      )
      .max(403),
  })
  .strict();

type CredentialExport = z.infer<typeof CredentialExportSchema>;

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    WORKBOOK_CUTOVER_MANIFEST_PATH: z.string().trim().min(1),
    WORKBOOK_CUTOVER_EXTRACTION_PATH: z.string().trim().min(1),
    WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_PATH: z.string().trim().min(1),
    WORKBOOK_CUTOVER_WORKBOOK_PATH: z.string().trim().min(1),
    WORKBOOK_CUTOVER_ACTOR_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    WORKBOOK_CUTOVER_PLAN_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH: z
      .string()
      .trim()
      .min(1)
      .optional(),
    FINANCE_MAINTENANCE_ACK: z.enum(["0", "1"]).default("0"),
    CONFIRM: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    if (env.CONFIRM === "1" && !env.WORKBOOK_CUTOVER_PLAN_SHA256) {
      ctx.addIssue({
        code: "custom",
        path: ["WORKBOOK_CUTOVER_PLAN_SHA256"],
        message: "CONFIRM=1 requires the exact reviewed dry-run plan SHA-256",
      });
    }
    if (env.CONFIRM === "1" && env.FINANCE_MAINTENANCE_ACK !== "1") {
      ctx.addIssue({
        code: "custom",
        path: ["FINANCE_MAINTENANCE_ACK"],
        message: "CONFIRM=1 requires an acknowledged Finance mutation freeze",
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

function countIssueCodes(values: readonly string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const code = value.split(":", 1)[0] || "unknown";
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
}

function countZodIssues(error: z.ZodError) {
  return error.issues.reduce<Record<string, number>>((counts, issue) => {
    const root = issue.path.find(
      (segment): segment is string => typeof segment === "string",
    );
    const key = `${root ?? "root"}:${issue.code}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function temporaryPassword(): string {
  return `D!${randomBytes(24).toString("base64url")}9a`;
}

function pendingCredentialPath(finalPath: string, planSha256: string): string {
  return `${finalPath}.pending-${planSha256.slice(0, 12)}`;
}

async function writePendingCredentialExport(input: {
  finalPath: string;
  planSha256: string;
  credentials: readonly {
    sourceKey: string;
    studentNo: string;
    loginEmail: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
  }[];
}): Promise<string> {
  const pendingPath = pendingCredentialPath(input.finalPath, input.planSha256);
  const payload = {
    schemaVersion: 1,
    purpose: "myDAUST SIS login only; no Google Workspace mailbox was created",
    confirmationPlanSha256: input.planSha256,
    generatedAt: new Date().toISOString(),
    mandatoryPasswordChange: true,
    credentials: input.credentials,
  };
  await writeFile(pendingPath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  return pendingPath;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Expected a regular private file");
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function readCredentialExport(path: string): Promise<CredentialExport> {
  const bytes = await readPrivateBounded(
    path,
    MAX_JSON_BYTES,
    "New-Student credential export",
  );
  return CredentialExportSchema.parse(JSON.parse(bytes.toString("utf8")));
}

function assertCredentialExportMatchesPlan(
  payload: CredentialExport,
  planSha256: string,
  expected: readonly {
    sourceKey: string;
    studentNo: string;
    loginEmail: string;
    firstName: string;
    lastName: string;
  }[],
): void {
  const identity = (row: (typeof expected)[number]) => ({
    sourceKey: row.sourceKey,
    studentNo: row.studentNo.trim().toUpperCase(),
    loginEmail: row.loginEmail.trim().toLowerCase(),
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim(),
  });
  const compare = (left: { sourceKey: string }, right: { sourceKey: string }) =>
    left.sourceKey.localeCompare(right.sourceKey);
  const actualIdentities = payload.credentials.map(identity).sort(compare);
  const expectedIdentities = expected.map(identity).sort(compare);
  if (
    payload.confirmationPlanSha256 !== planSha256 ||
    JSON.stringify(actualIdentities) !== JSON.stringify(expectedIdentities)
  ) {
    throw new WorkbookCutoverBlockedError(
      "Credential recovery file does not match the confirmed cutover plan",
      { code: "credential_export_plan_mismatch" },
    );
  }
}

async function assertCredentialExportMatchesCommittedStudents(
  prisma: PrismaClient,
  batchId: string,
  planSha256: string,
  payload: CredentialExport,
): Promise<void> {
  const records = await prisma.workbookCutoverSourceRecord.findMany({
    where: { batchId, disposition: "create_student" },
    orderBy: { sourceKey: "asc" },
    select: {
      sourceKey: true,
      student: {
        select: {
          studentNo: true,
          person: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              passwordHash: true,
              mustChangePassword: true,
            },
          },
        },
      },
    },
  });
  assertCredentialExportMatchesPlan(
    payload,
    planSha256,
    records.map((record) => ({
      sourceKey: record.sourceKey,
      studentNo: record.student?.studentNo ?? "",
      loginEmail: record.student?.person.email ?? "",
      firstName: record.student?.person.firstName ?? "",
      lastName: record.student?.person.lastName ?? "",
    })),
  );
  const credentialsBySource = new Map(
    payload.credentials.map((credential) => [credential.sourceKey, credential]),
  );
  for (const record of records) {
    const credential = credentialsBySource.get(record.sourceKey);
    const passwordHash = record.student?.person.passwordHash;
    if (
      !credential ||
      !passwordHash ||
      record.student?.person.mustChangePassword !== true ||
      !(await bcrypt.compare(credential.temporaryPassword, passwordHash))
    ) {
      throw new WorkbookCutoverBlockedError(
        "Credential recovery file does not unlock the committed new Student accounts",
        { code: "credential_export_password_mismatch" },
      );
    }
  }
}

async function finalizeCredentialExport(
  pendingPath: string,
  finalPath: string,
): Promise<void> {
  const finalExists = await fileExists(finalPath);
  const pendingExists = await fileExists(pendingPath);
  if (!pendingExists && !finalExists) {
    throw new WorkbookCutoverBlockedError(
      "The private credential export disappeared before finalization",
      { code: "credential_export_missing" },
    );
  }
  if (finalExists && pendingExists) {
    const [finalMetadata, pendingMetadata] = await Promise.all([
      stat(finalPath),
      stat(pendingPath),
    ]);
    if (
      finalMetadata.dev !== pendingMetadata.dev ||
      finalMetadata.ino !== pendingMetadata.ino
    ) {
      throw new WorkbookCutoverBlockedError(
        "The final and pending credential exports are not the same private file",
        { code: "credential_export_finalize_conflict" },
      );
    }
    await unlink(pendingPath);
  } else if (pendingExists) {
    await link(pendingPath, finalPath);
    await unlink(pendingPath);
  }
  const metadata = await stat(finalPath);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(
      "Credential export was not written with private permissions",
    );
  }
}

async function requireCredentialExportTargetAbsent(
  finalPath: string,
): Promise<void> {
  try {
    await stat(finalPath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
  throw new WorkbookCutoverBlockedError(
    "Credential export target already exists and will not be overwritten",
    {},
  );
}

async function main(): Promise<void> {
  const env = EnvironmentSchema.parse(process.env);
  const paths = {
    manifest: resolve(env.WORKBOOK_CUTOVER_MANIFEST_PATH),
    extraction: resolve(env.WORKBOOK_CUTOVER_EXTRACTION_PATH),
    productionSnapshot: resolve(env.WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_PATH),
    workbook: resolve(env.WORKBOOK_CUTOVER_WORKBOOK_PATH),
  };
  const [manifestBytes, extractionBytes, productionBytes, workbookBytes] =
    await Promise.all([
      readPrivateBounded(paths.manifest, MAX_JSON_BYTES, "Cutover manifest"),
      readPrivateBounded(
        paths.extraction,
        MAX_JSON_BYTES,
        "Trusted workbook extraction",
      ),
      readPrivateBounded(
        paths.productionSnapshot,
        MAX_JSON_BYTES,
        "Reviewed production snapshot",
      ),
      readPrivateBounded(paths.workbook, MAX_WORKBOOK_BYTES, "Source workbook"),
    ]);
  const manifest = parseWorkbookCutoverManifest(manifestBytes);
  const trustedExtraction =
    parseWorkbookCutoverTrustedExtraction(extractionBytes);
  const reviewedProductionSnapshot =
    parseWorkbookCutoverProductionSnapshot(productionBytes);
  const sourceDigests = {
    workbookSha256: digest(workbookBytes),
    trustedExtractionSha256: digest(extractionBytes),
    reviewedProductionSnapshotSha256: digest(productionBytes),
  };
  if (
    sourceDigests.workbookSha256 !== manifest.sourceWorkbook.sha256 ||
    sourceDigests.trustedExtractionSha256 !==
      manifest.trustedExtraction.sha256 ||
    sourceDigests.reviewedProductionSnapshotSha256 !==
      manifest.productionSnapshot.sha256
  ) {
    throw new WorkbookCutoverBlockedError(
      "A supplied cutover artifact does not match its reviewed SHA-256",
      {},
    );
  }
  if (
    basename(paths.workbook) !== manifest.sourceWorkbook.fileName ||
    basename(paths.extraction) !== manifest.trustedExtraction.fileName ||
    basename(paths.productionSnapshot) !== manifest.productionSnapshot.fileName
  ) {
    throw new WorkbookCutoverBlockedError(
      "A supplied cutover artifact file name does not match the manifest",
      {},
    );
  }
  verifyWorkbookCutoverManifestExtraction(manifest, trustedExtraction);
  verifyWorkbookCutoverManifestProductionSnapshot(
    manifest,
    reviewedProductionSnapshot,
  );
  const sources = {
    trustedExtraction,
    reviewedProductionSnapshot,
    sourceDigests,
  };
  const prisma = new PrismaClient();
  try {
    const invocation = { actorEmail: env.WORKBOOK_CUTOVER_ACTOR_EMAIL };
    const plan = await planWorkbookCutoverFromDatabase(
      prisma,
      manifest,
      sources,
      invocation,
    );
    const blockerCounts = plan.blockers.reduce<Record<string, number>>(
      (counts, blocker) => {
        counts[blocker.code] = (counts[blocker.code] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const warningCounts = plan.warnings.reduce<Record<string, number>>(
      (counts, warning) => {
        counts[warning.code] = (counts[warning.code] ?? 0) + 1;
        return counts;
      },
      {},
    );
    console.log(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover",
          ok: true,
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          alreadyImportedBatchId: plan.alreadyImportedBatchId,
          sourceWorkbookSha256: plan.sourceWorkbookSha256,
          trustedExtractionSha256: plan.trustedExtractionSha256,
          reviewedProductionSnapshotSha256:
            plan.reviewedProductionSnapshotSha256,
          manifestSha256: plan.manifestSha256,
          purePlanSha256: plan.purePlanSha256,
          planSha256: plan.planSha256,
          capturedAt: plan.capturedAt,
          confirmBlocked: plan.confirmBlocked,
          blockerCounts,
          warningCounts,
          controls: plan.controls,
          actorId: "<authorized>",
        },
        null,
        2,
      ),
    );
    if (env.CONFIRM === "0") return;
    if (plan.alreadyImportedBatchId) {
      if (env.WORKBOOK_CUTOVER_PLAN_SHA256 !== plan.planSha256) {
        throw new WorkbookCutoverBlockedError(
          "Exact replay requires the original confirmed cutover plan SHA-256",
          {
            suppliedPlanSha256: env.WORKBOOK_CUTOVER_PLAN_SHA256,
            confirmedPlanSha256: plan.planSha256,
          },
        );
      }
      const replay = await executeWorkbookCutover(prisma, manifest, sources, {
        ...invocation,
        expectedPlanSha256: plan.planSha256,
        newStudentCredentials: [],
      });
      const audit = await auditWorkbookCutoverBatch(prisma, replay.batchId);
      const createdRows = await prisma.workbookCutoverSourceRecord.count({
        where: { batchId: replay.batchId, disposition: "create_student" },
      });
      let credentialExport: string | null = null;
      if (createdRows > 0) {
        if (!env.WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH) {
          throw new WorkbookCutoverBlockedError(
            "Exact replay must name the original private credential export path",
            { code: "credential_export_path_required" },
          );
        }
        const finalPath = resolve(env.WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH);
        const pendingPath = pendingCredentialPath(finalPath, plan.planSha256);
        const finalExists = await fileExists(finalPath);
        const pendingExists = await fileExists(pendingPath);
        if (!finalExists && !pendingExists) {
          throw new WorkbookCutoverBlockedError(
            "The committed new-Student credential export is missing; use the audited account-reset recovery workflow",
            { code: "credential_export_missing" },
          );
        }
        const payload = await readCredentialExport(
          finalExists ? finalPath : pendingPath,
        );
        await assertCredentialExportMatchesCommittedStudents(
          prisma,
          replay.batchId,
          plan.planSha256,
          payload,
        );
        if (!finalExists || pendingExists) {
          await finalizeCredentialExport(pendingPath, finalPath);
        }
        credentialExport = "<private-mode-0600-file>";
      }
      console.log(
        JSON.stringify(
          {
            event: "workbook-roster-billing-cutover-post-audit",
            ok: true,
            result: replay,
            audit,
            exactReplayNoOp: true,
            credentialExport,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (plan.confirmBlocked || plan.blockers.length > 0) {
      throw new WorkbookCutoverBlockedError(
        "Confirmation is disabled until every reviewed decision and live blocker is resolved",
        { blockerCounts },
      );
    }

    const createActions = plan.workbookActions.filter(
      (action) => action.disposition === "create_and_reconstruct",
    );
    if (
      createActions.length > 0 &&
      !env.WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH
    ) {
      throw new WorkbookCutoverBlockedError(
        "Confirmation with new Students requires a private credential export path",
        { credentialRows: createActions.length },
      );
    }
    const finalCredentialPath =
      createActions.length > 0
        ? resolve(env.WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH!)
        : null;
    if (finalCredentialPath) {
      await requireCredentialExportTargetAbsent(finalCredentialPath);
    }
    let generated: CredentialExport["credentials"] = [];
    let pendingPath: string | null = null;
    if (finalCredentialPath) {
      pendingPath = pendingCredentialPath(finalCredentialPath, plan.planSha256);
      if (await fileExists(pendingPath)) {
        const recovered = await readCredentialExport(pendingPath);
        assertCredentialExportMatchesPlan(
          recovered,
          plan.planSha256,
          createActions.map((action) => ({
            sourceKey: action.sourceKey,
            studentNo: action.plannedStudentNo!,
            loginEmail: action.plannedLoginEmail!,
            firstName: action.firstName,
            lastName: action.lastName,
          })),
        );
        generated = recovered.credentials;
      } else {
        generated = createActions.map((action) => ({
          sourceKey: action.sourceKey,
          studentNo: action.plannedStudentNo!,
          loginEmail: action.plannedLoginEmail!,
          firstName: action.firstName,
          lastName: action.lastName,
          temporaryPassword: temporaryPassword(),
        }));
        await writePendingCredentialExport({
          finalPath: finalCredentialPath,
          planSha256: plan.planSha256,
          credentials: generated,
        });
      }
    }
    const credentials: WorkbookCutoverNewStudentCredential[] = generated.map(
      (row) => ({
        sourceKey: row.sourceKey,
        temporaryPassword: row.temporaryPassword,
      }),
    );
    const result = await executeWorkbookCutover(prisma, manifest, sources, {
      ...invocation,
      expectedPlanSha256: env.WORKBOOK_CUTOVER_PLAN_SHA256!,
      newStudentCredentials: credentials,
    });
    const audit = await auditWorkbookCutoverBatch(prisma, result.batchId);
    const replay = await executeWorkbookCutover(prisma, manifest, sources, {
      ...invocation,
      expectedPlanSha256: env.WORKBOOK_CUTOVER_PLAN_SHA256!,
      newStudentCredentials: credentials,
    });
    if (!replay.alreadyImported || replay.batchId !== result.batchId) {
      throw new Error("Exact workbook cutover replay was not a no-op");
    }
    const replayAudit = await auditWorkbookCutoverBatch(prisma, result.batchId);
    if (JSON.stringify(audit) !== JSON.stringify(replayAudit)) {
      throw new Error(
        "Exact workbook cutover replay changed post-audit controls",
      );
    }
    if (pendingPath && finalCredentialPath) {
      await finalizeCredentialExport(pendingPath, finalCredentialPath);
    }
    console.log(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover-post-audit",
          ok: true,
          result,
          audit,
          exactReplayNoOp: true,
          credentialExport:
            result.credentialRows > 0 ? "<private-mode-0600-file>" : null,
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
  if (error instanceof WorkbookCutoverBlockedError) {
    console.error(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover",
          ok: false,
          blocked: true,
          error: error.message,
          detailFields: Object.keys(error.details).sort(),
        },
        null,
        2,
      ),
    );
  } else if (error instanceof WorkbookCutoverExtractionMismatchError) {
    console.error(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover",
          ok: false,
          blocked: true,
          error: "Cutover source verification failed",
          issueCounts: countIssueCodes(error.issues),
        },
        null,
        2,
      ),
    );
  } else if (error instanceof z.ZodError) {
    console.error(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover",
          ok: false,
          blocked: true,
          error: "Cutover configuration or reviewed manifest is invalid",
          issueCounts: countZodIssues(error),
        },
        null,
        2,
      ),
    );
  } else {
    console.error(
      JSON.stringify(
        {
          event: "workbook-roster-billing-cutover",
          ok: false,
          blocked: true,
          error:
            "Unexpected cutover failure; inspect private operator diagnostics",
          errorType: error instanceof Error ? error.name : typeof error,
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
});
