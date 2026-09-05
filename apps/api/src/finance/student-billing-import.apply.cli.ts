import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  applyBillingPlanInTransaction,
  BillingApplyError,
} from "./student-billing-import.apply.js";
import { parseStudentBillingManifest } from "./student-billing-import.manifest.js";
import type { BillingRepriceAction } from "./student-billing-import.planner.js";
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
  BILLING_IMPORT_ACTOR_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  BILLING_IMPORT_REASON: z.string().trim().min(20),
  /** Set to skip the blocked rows and apply only what plans cleanly. */
  BILLING_IMPORT_ONLY_ACTIONABLE: z.enum(["0", "1"]).default("0"),
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

function summarise(items: readonly { code: string }[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
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
  if (!person.roles.includes("admin")) {
    throw new Error(
      `${email} is not an admin; a fee-schedule revision needs one`,
    );
  }
  return person.id;
}

/** Read back what actually landed, rather than trusting the plan. */
async function verify(prisma: PrismaClient, academicYearLabel: string) {
  const packages = await prisma.invoice.aggregate({
    where: {
      packageType: "standard_full",
      status: { not: "void" },
      academicYearLabel,
    },
    _count: true,
    _sum: { totalAmount: true, amountPaid: true },
  });
  const credits = await prisma.invoice.aggregate({
    where: { packageType: "credit", academicYearLabel },
    _count: true,
    _sum: { totalAmount: true },
  });
  const mismatched = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM "Invoice" i
    JOIN "PaymentPlan" p ON p."invoiceId" = i.id
    WHERE i."packageType" = 'standard_full' AND i.status <> 'void'
      AND i."academicYearLabel" = ${academicYearLabel}
      AND i."totalAmount" <> (
        SELECT COALESCE(sum(ins."amountDue"), 0) FROM "Installment" ins WHERE ins."planId" = p.id
      )`;
  return {
    packages: packages._count,
    packagesBilledXof: Number(packages._sum.totalAmount ?? 0),
    packagesPaidXof: Number(packages._sum.amountPaid ?? 0),
    creditInvoices: credits._count,
    creditsXof: Number(credits._sum.totalAmount ?? 0),
    invoicesWhereInstallmentsDoNotSumToTotal: Number(mismatched[0]?.count ?? 0),
  };
}

async function main(): Promise<void> {
  const env = environmentSchema.parse(process.env);
  const [manifestBytes, workbookBytes] = await Promise.all([
    readBounded(
      resolve(env.BILLING_IMPORT_MANIFEST_PATH),
      MAX_MANIFEST_BYTES,
      "Billing manifest",
    ),
    readBounded(
      resolve(env.BILLING_IMPORT_WORKBOOK_PATH),
      MAX_WORKBOOK_BYTES,
      "Source workbook",
    ),
  ]);
  const { manifest, manifestSha256 } =
    parseStudentBillingManifest(manifestBytes);
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
    const actorId = await resolveActor(prisma, env.BILLING_IMPORT_ACTOR_EMAIL);
    const before = await verify(prisma, manifest.academicYearLabel);
    const dryRun = await planStudentBillingImportFromDatabase(prisma, manifest);
    const { plan } = dryRun;
    const actions = plan.actions.filter(
      (action): action is BillingRepriceAction => action.kind === "reprice",
    );
    const onlyActionable = env.BILLING_IMPORT_ONLY_ACTIONABLE === "1";
    const ok = onlyActionable ? actions.length > 0 : plan.blockers.length === 0;

    console.log(
      JSON.stringify(
        {
          event: "student-billing-apply",
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          onlyActionable,
          ok,
          manifestSha256,
          workbookSha256,
          academicYearLabel: plan.academicYearLabel,
          before,
          repriceActions: actions.length,
          blockerCount: plan.blockers.length,
          blockersByCode: summarise(plan.blockers),
          missingCatalogKeys: dryRun.missingCatalogKeys,
          totals: plan.totals,
        },
        null,
        2,
      ),
    );
    for (const blocker of plan.blockers.slice(0, 50)) {
      console.error(
        `BLOCKER ${blocker.code} row=${blocker.rowNumber ?? "-"} ${blocker.subject}: ${blocker.detail}`,
      );
    }
    if (plan.blockers.length > 50) {
      console.error(
        `... ${plan.blockers.length - 50} further blockers not printed`,
      );
    }

    if (env.CONFIRM !== "1") {
      if (!ok) process.exitCode = studentBillingDryRunExitCode;
      return;
    }
    if (!ok) throw new Error("Refusing to apply: the dry run is not clean");

    const result = await prisma.$transaction(
      (tx) =>
        applyBillingPlanInTransaction(
          tx,
          actions,
          {
            actorId,
            academicYearLabel: manifest.academicYearLabel,
            batchLabel: `workbook-${workbookSha256.slice(0, 12)}`,
          },
          env.BILLING_IMPORT_REASON,
        ),
      { isolationLevel: "Serializable", maxWait: 30_000, timeout: 600_000 },
    );
    const after = await verify(prisma, manifest.academicYearLabel);
    const expectedCredits = before.creditsXof - plan.totals.creditsXof;
    console.log(
      JSON.stringify(
        {
          event: "student-billing-applied",
          result,
          after,
          expected: {
            creditsXof: expectedCredits,
            newCreditInvoices: result.creditsWritten,
          },
        },
        null,
        2,
      ),
    );
    const problems: string[] = [];
    if (after.invoicesWhereInstallmentsDoNotSumToTotal > 0) {
      problems.push(
        `${after.invoicesWhereInstallmentsDoNotSumToTotal} invoice(s) no longer reconcile to their installments`,
      );
    }
    if (after.creditsXof !== expectedCredits) {
      problems.push(
        `credits total ${after.creditsXof} XOF, expected ${expectedCredits} XOF — a duplicate or missing credit`,
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `POST-WRITE CHECK FAILED (the transaction is committed): ${problems.join("; ")}. Investigate before anyone reads a balance.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof BillingApplyError) {
    console.error(`APPLY ABORTED (nothing written): ${error.message}`);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
