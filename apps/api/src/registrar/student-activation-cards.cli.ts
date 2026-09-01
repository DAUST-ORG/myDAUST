import "dotenv/config";
import { createHash } from "node:crypto";
import { link, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import {
  DEFAULT_STUDENT_ACTIVATION_URL,
  STUDENT_ACTIVATION_CARD_REVOKE_REASONS,
  STUDENT_ACTIVATION_CARD_TTL_MS,
  STUDENT_ACTIVATION_URL_ALLOWLIST,
  StudentActivationCardBlockedError,
  type StudentActivationCardRevokeReason,
  assertCleanGenerationPlan,
  executeStudentActivationCardGeneration,
  executeStudentActivationCardRevocation,
  findGeneratedBatchByPlan,
  generationPlanSummary,
  issueActivationCards,
  planStudentActivationCardGeneration,
  planStudentActivationCardRevocation,
  renderStudentActivationCardsPdf,
  revocationPlanSummary,
} from "./student-activation-cards.js";

type Operation = "generate" | "revoke";

export interface StudentActivationCardCliConfig {
  operation: Operation;
  confirm: boolean;
  actorEmail: string;
  expectedPlanSha256?: string;
  activationUrl: string;
  outputPath?: string;
  codeKey?: Uint8Array;
  revokeBatchId?: string;
  revokeReason?: StudentActivationCardRevokeReason;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new StudentActivationCardBlockedError(`${key} is required`);
  }
  return value;
}

function parsePlanSha256(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CARD_PLAN_SHA256 must be a SHA-256 digest",
    );
  }
  return normalized;
}

function parseActivationUrl(value: string): string {
  if (
    !STUDENT_ACTIVATION_URL_ALLOWLIST.includes(
      value as (typeof STUDENT_ACTIVATION_URL_ALLOWLIST)[number],
    )
  ) {
    throw new StudentActivationCardBlockedError(
      `Student activation URL must exactly match one of: ${STUDENT_ACTIVATION_URL_ALLOWLIST.join(", ")}`,
    );
  }
  return value;
}

function parseCodeKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CODE_KEY_V1 is not a 32-byte base64url key",
    );
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CODE_KEY_V1 is not a 32-byte base64url key",
    );
  }
  return key;
}

export function parseStudentActivationCardCliConfig(
  env: NodeJS.ProcessEnv,
): StudentActivationCardCliConfig {
  const operationValue =
    env.STUDENT_ACTIVATION_CARD_OPERATION?.trim() || "generate";
  if (operationValue !== "generate" && operationValue !== "revoke") {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CARD_OPERATION must be generate or revoke",
    );
  }
  const confirmValue = env.CONFIRM?.trim() || "0";
  if (confirmValue !== "0" && confirmValue !== "1") {
    throw new StudentActivationCardBlockedError("CONFIRM must be 0 or 1");
  }
  const confirm = confirmValue === "1";
  const expectedPlanSha256 = parsePlanSha256(
    env.STUDENT_ACTIVATION_CARD_PLAN_SHA256,
  );
  if (confirm && !expectedPlanSha256) {
    throw new StudentActivationCardBlockedError(
      "CONFIRM=1 requires the exact reviewed dry-run plan SHA-256",
    );
  }
  const actorEmail = required(
    env,
    "STUDENT_ACTIVATION_CARD_ACTOR_EMAIL",
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail)) {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CARD_ACTOR_EMAIL is invalid",
    );
  }
  const activationUrl = parseActivationUrl(
    env.STUDENT_ACTIVATION_CARD_ACTIVATION_URL?.trim() ||
      DEFAULT_STUDENT_ACTIVATION_URL,
  );

  if (operationValue === "generate") {
    let outputPath: string | undefined;
    let codeKey: Uint8Array | undefined;
    if (confirm) {
      const configuredPath = required(
        env,
        "STUDENT_ACTIVATION_CARD_OUTPUT_PATH",
      );
      if (!isAbsolute(configuredPath) || extname(configuredPath) !== ".pdf") {
        throw new StudentActivationCardBlockedError(
          "STUDENT_ACTIVATION_CARD_OUTPUT_PATH must be an absolute .pdf path",
        );
      }
      outputPath = resolve(configuredPath);
      codeKey = parseCodeKey(required(env, "STUDENT_ACTIVATION_CODE_KEY_V1"));
    }
    return {
      operation: "generate",
      confirm,
      actorEmail,
      expectedPlanSha256,
      activationUrl,
      outputPath,
      codeKey,
    };
  }

  const revokeBatchId = required(
    env,
    "STUDENT_ACTIVATION_CARD_REVOKE_BATCH_ID",
  );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      revokeBatchId,
    )
  ) {
    throw new StudentActivationCardBlockedError(
      "STUDENT_ACTIVATION_CARD_REVOKE_BATCH_ID must be a UUID",
    );
  }
  const revokeReason = required(env, "STUDENT_ACTIVATION_CARD_REVOKE_REASON");
  if (
    !STUDENT_ACTIVATION_CARD_REVOKE_REASONS.includes(
      revokeReason as StudentActivationCardRevokeReason,
    )
  ) {
    throw new StudentActivationCardBlockedError(
      `STUDENT_ACTIVATION_CARD_REVOKE_REASON must be one of ${STUDENT_ACTIVATION_CARD_REVOKE_REASONS.join(", ")}`,
    );
  }
  return {
    operation: "revoke",
    confirm,
    actorEmail,
    expectedPlanSha256,
    activationUrl,
    revokeBatchId,
    revokeReason: revokeReason as StudentActivationCardRevokeReason,
  };
}

export async function writePrivatePdfExclusive(
  outputPath: string,
  bytes: Uint8Array,
): Promise<void> {
  let created = false;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(outputPath, "wx", 0o600);
    created = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(0o600);
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
      throw new StudentActivationCardBlockedError(
        "Activation-card artifact is not an owner-only regular file",
      );
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    handle = undefined;
    if (created) await unlink(outputPath).catch(() => undefined);
    throw error;
  } finally {
    await handle?.close();
  }
  await syncDirectory(dirname(outputPath));
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function removePrivateArtifact(path: string): Promise<void> {
  await unlink(path);
  await syncDirectory(dirname(path));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
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

async function assertPrivatePdfDigest(
  path: string,
  expectedSha256: string,
): Promise<void> {
  const metadata = await stat(path);
  if (
    !metadata.isFile() ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size <= 0 ||
    metadata.size > 50 * 1024 * 1024
  ) {
    throw new StudentActivationCardBlockedError(
      "Activation-card artifact is not a bounded owner-only regular file",
    );
  }
  const digest = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (digest !== expectedSha256) {
    throw new StudentActivationCardBlockedError(
      "Activation-card artifact does not match the committed output SHA-256",
    );
  }
}

export async function promotePrivatePdfExclusive(
  pendingPath: string,
  outputPath: string,
): Promise<void> {
  await link(pendingPath, outputPath);
  await syncDirectory(dirname(outputPath));
  await removePrivateArtifact(pendingPath);
}

export async function recoverOrVerifyCommittedArtifact(input: {
  outputPath: string;
  expectedSha256: string;
}): Promise<{ recovered: boolean }> {
  const pendingPath = `${input.outputPath}.pending`;
  const [outputExists, pendingExists] = await Promise.all([
    pathExists(input.outputPath),
    pathExists(pendingPath),
  ]);
  if (outputExists) {
    await assertPrivatePdfDigest(input.outputPath, input.expectedSha256);
    if (pendingExists) {
      await assertPrivatePdfDigest(pendingPath, input.expectedSha256);
      await removePrivateArtifact(pendingPath);
    }
    return { recovered: false };
  }
  if (pendingExists) {
    await assertPrivatePdfDigest(pendingPath, input.expectedSha256);
    await promotePrivatePdfExclusive(pendingPath, input.outputPath);
    return { recovered: true };
  }
  throw new StudentActivationCardBlockedError(
    "The batch is committed but no matching PDF is available at the configured output path; revoke the batch before generating replacement cards",
  );
}

async function assertOutputTargetAbsent(outputPath: string): Promise<void> {
  try {
    await stat(outputPath);
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
  throw new StudentActivationCardBlockedError(
    "Activation-card output already exists and will not be overwritten",
  );
}

async function runGenerate(
  prisma: PrismaClient,
  config: StudentActivationCardCliConfig & { operation: "generate" },
): Promise<void> {
  if (config.confirm) {
    const replay = await findGeneratedBatchByPlan(
      prisma,
      config.expectedPlanSha256!,
    );
    if (replay) {
      if (
        replay.status !== "active" ||
        replay.revokedAt ||
        replay.expiresAt.getTime() <= Date.now()
      ) {
        throw new StudentActivationCardBlockedError(
          "The reviewed generation batch is no longer active; do not distribute its PDF. Run a new dry run for replacement cards",
        );
      }
      const artifact = await recoverOrVerifyCommittedArtifact({
        outputPath: config.outputPath!,
        expectedSha256: replay.outputSha256,
      });
      console.log(
        JSON.stringify({
          event: "student-activation-card-generation",
          ok: true,
          mode: "confirm",
          alreadyGenerated: true,
          batchId: replay.id,
          generatedCount: replay.generatedCount,
          outputSha256: replay.outputSha256,
          expiresAt: replay.expiresAt.toISOString(),
          status: replay.status,
          outputPath: config.outputPath,
          recoveredArtifact: artifact.recovered,
        }),
      );
      return;
    }
  }
  const plan = await planStudentActivationCardGeneration(prisma, {
    actorEmail: config.actorEmail,
    activationUrl: config.activationUrl,
  });
  const blockerCount = Object.values(plan.blockerCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  console.log(
    JSON.stringify(
      {
        event: "student-activation-card-generation",
        ok: blockerCount === 0 && plan.eligibleCount > 0,
        mode: config.confirm ? "confirm" : "dry-run",
        ...generationPlanSummary(plan),
      },
      null,
      2,
    ),
  );
  if (!config.confirm) {
    if (blockerCount === 0 && plan.eligibleCount > 0) {
      console.log(
        `Dry run is clean. Review and confirm only with plan SHA-256 ${plan.planSha256}.`,
      );
    } else {
      console.log(
        "Dry run is blocked. Resolve every aggregate blocker before confirmation.",
      );
      process.exitCode = 2;
    }
    return;
  }
  if (config.expectedPlanSha256 !== plan.planSha256) {
    throw new StudentActivationCardBlockedError(
      "Live eligibility does not match the reviewed dry-run plan",
    );
  }
  assertCleanGenerationPlan(plan);
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + STUDENT_ACTIVATION_CARD_TTL_MS,
  );
  const issuedCards = issueActivationCards(plan, config.codeKey!);
  const artifact = await renderStudentActivationCardsPdf({
    cards: issuedCards,
    activationUrl: config.activationUrl,
    issuedAt,
    expiresAt,
    planSha256: plan.planSha256,
  });
  const outputSha256 = createHash("sha256")
    .update(artifact.bytes)
    .digest("hex");
  const outputPath = config.outputPath!;
  const pendingPath = `${outputPath}.pending`;
  let databaseCommitted = false;
  try {
    await assertOutputTargetAbsent(outputPath);
    await assertOutputTargetAbsent(pendingPath);
    // The plaintext exists before commit only as an owner-only hidden pending
    // file with no PDF extension. The printable target is created exclusively
    // only after this exact code set commits.
    await writePrivatePdfExclusive(pendingPath, artifact.bytes);
    const result = await executeStudentActivationCardGeneration(prisma, {
      actorEmail: config.actorEmail,
      activationUrl: config.activationUrl,
      expectedPlanSha256: config.expectedPlanSha256,
      plan,
      issuedCards,
      issuedAt,
      expiresAt,
      outputSha256,
      pageCount: artifact.pageCount,
    });
    if (result.alreadyGenerated) {
      await removePrivateArtifact(pendingPath);
      throw new StudentActivationCardBlockedError(
        "A concurrent activation-card batch won confirmation; this uncommitted PDF was destroyed. Use the committed artifact or revoke that batch before retrying",
      );
    } else {
      databaseCommitted = true;
      try {
        await promotePrivatePdfExclusive(pendingPath, outputPath);
      } catch {
        throw new StudentActivationCardBlockedError(
          `The batch committed but PDF promotion failed. The matching owner-only artifact remains at ${pendingPath}; re-run this exact confirmation to recover it, or revoke the batch`,
        );
      }
    }
    console.log(
      JSON.stringify({
        event: "student-activation-card-generation",
        ok: true,
        mode: "confirm",
        alreadyGenerated: result.alreadyGenerated,
        batchId: result.id,
        generatedCount: result.generatedCount,
        expiresAt: result.expiresAt.toISOString(),
        outputPath: result.alreadyGenerated ? undefined : outputPath,
        outputSha256: result.outputSha256,
        pageCount: result.alreadyGenerated ? undefined : artifact.pageCount,
      }),
    );
  } catch (error) {
    if (!databaseCommitted) {
      if (await pathExists(pendingPath).catch(() => false)) {
        await removePrivateArtifact(pendingPath).catch(() => undefined);
      }
    }
    throw error;
  }
}

async function runRevoke(
  prisma: PrismaClient,
  config: StudentActivationCardCliConfig & { operation: "revoke" },
): Promise<void> {
  const plan = await planStudentActivationCardRevocation(prisma, {
    actorEmail: config.actorEmail,
    batchId: config.revokeBatchId!,
    reason: config.revokeReason!,
  });
  console.log(
    JSON.stringify(
      {
        event: "student-activation-card-revocation",
        ok: true,
        mode: config.confirm ? "confirm" : "dry-run",
        ...revocationPlanSummary(plan),
      },
      null,
      2,
    ),
  );
  if (!config.confirm) {
    console.log(
      plan.alreadyRevoked
        ? "Batch is already revoked; confirmation is a no-op."
        : `Dry run is clean. Review and confirm only with plan SHA-256 ${plan.planSha256}.`,
    );
    return;
  }
  if (config.expectedPlanSha256 !== plan.planSha256) {
    throw new StudentActivationCardBlockedError(
      "Live batch state does not match the reviewed revocation plan",
    );
  }
  const result = await executeStudentActivationCardRevocation(prisma, {
    actorEmail: config.actorEmail,
    batchId: config.revokeBatchId!,
    reason: config.revokeReason!,
    expectedPlanSha256: config.expectedPlanSha256,
  });
  console.log(
    JSON.stringify({
      event: "student-activation-card-revocation",
      ok: true,
      mode: "confirm",
      ...result,
    }),
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new StudentActivationCardBlockedError("DATABASE_URL is required");
  }
  const config = parseStudentActivationCardCliConfig(process.env);
  const prisma = new PrismaClient();
  try {
    if (config.operation === "generate") {
      await runGenerate(prisma, {
        ...config,
        operation: "generate",
      });
    } else {
      await runRevoke(prisma, { ...config, operation: "revoke" });
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const errorName = error instanceof Error ? error.name : typeof error;
    const candidateCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{2,20}$/.test(error.code)
        ? error.code
        : undefined;
    console.error(
      JSON.stringify({
        event: "student-activation-cards",
        ok: false,
        blocked: error instanceof StudentActivationCardBlockedError,
        error:
          error instanceof StudentActivationCardBlockedError
            ? error.message
            : "Activation-card operation failed",
        errorName,
        errorCode: candidateCode,
      }),
    );
    process.exitCode = 1;
  });
}
