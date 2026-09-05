import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { parseOpeningBalanceManifest } from "./opening-balance-import.manifest.js";
import {
  executeOpeningBalanceImport,
  openingBalanceDryRunExitCode,
  planOpeningBalanceFromDatabase,
} from "./opening-balance-import.runner.js";

const MAX_MANIFEST_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 250 * 1024 * 1024;

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENING_BALANCE_MANIFEST_PATH: z.string().trim().min(1),
  OPENING_BALANCE_WORKBOOK_PATH: z.string().trim().min(1),
  OPENING_BALANCE_ACTOR_EMAIL: z
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

function summarise(
  blockers: readonly { code: string }[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const blocker of blockers) {
    counts.set(blocker.code, (counts.get(blocker.code) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

async function resolveActor(
  prisma: PrismaClient,
  email: string,
): Promise<string> {
  const person = await prisma.person.findUnique({
    where: { email },
    select: { id: true, roles: true },
  });
  if (!person) throw new Error(`No person is registered for ${email}`);
  if (!person.roles.some((role) => role === "bursar" || role === "admin")) {
    throw new Error(`${email} is neither a bursar nor an admin`);
  }
  return person.id;
}

async function main(): Promise<void> {
  const env = environmentSchema.parse(process.env);
  const manifestPath = resolve(env.OPENING_BALANCE_MANIFEST_PATH);
  const workbookPath = resolve(env.OPENING_BALANCE_WORKBOOK_PATH);
  const [manifestBytes, workbookBytes] = await Promise.all([
    readBounded(manifestPath, MAX_MANIFEST_BYTES, "Opening-balance manifest"),
    readBounded(workbookPath, MAX_WORKBOOK_BYTES, "Source workbook"),
  ]);

  const { manifest, manifestSha256 } =
    parseOpeningBalanceManifest(manifestBytes);
  const workbookSha256 = createHash("sha256")
    .update(workbookBytes)
    .digest("hex");
  if (workbookSha256 !== manifest.sourceWorkbookSha256) {
    throw new Error(
      `Workbook digest ${workbookSha256} does not match the manifest's ${manifest.sourceWorkbookSha256}`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const actorId = await resolveActor(prisma, env.OPENING_BALANCE_ACTOR_EMAIL);
    const plan = await planOpeningBalanceFromDatabase(prisma, manifest);
    const ok = plan.blockers.length === 0;
    console.log(
      JSON.stringify(
        {
          event: "opening-balance-import",
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          ok,
          manifestSha256,
          workbookSha256,
          academicYearLabel: plan.academicYearLabel,
          asOfDate: plan.asOfDate,
          reconstruction: {
            settlementDatesKnown: false,
            paymentMethodsKnown: false,
            externalReferencesKnown: false,
          },
          rowCount: plan.rowCount,
          postableRows: plan.postable.length,
          alreadyRecordedRows: plan.alreadyRecorded.length,
          totals: plan.totals,
          blockerCount: plan.blockers.length,
          blockersByCode: summarise(plan.blockers),
        },
        null,
        2,
      ),
    );
    for (const blocker of plan.blockers.slice(0, 100)) {
      console.error(
        `BLOCKER ${blocker.code} row=${blocker.rowKey ?? "-"} ${blocker.subject}: ${blocker.detail}`,
      );
    }
    if (plan.blockers.length > 100) {
      console.error(
        `... ${plan.blockers.length - 100} further blockers not printed`,
      );
    }

    if (env.CONFIRM !== "1") {
      if (!ok) process.exitCode = openingBalanceDryRunExitCode;
      return;
    }
    if (!ok) {
      throw new Error("Refusing to post: the dry run is not clean");
    }
    const result = await executeOpeningBalanceImport(prisma, manifest, {
      manifestSha256,
      actorId,
    });
    console.log(
      JSON.stringify({ event: "opening-balance-posted", ...result }, null, 2),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
