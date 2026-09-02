import "dotenv/config";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import {
  WorkbookPendingActivationBlockedError,
  auditWorkbookPendingActivation,
  executeWorkbookPendingActivation,
  planWorkbookPendingActivationFromDatabase,
} from "./workbook-pending-activation.runner.js";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    WORKBOOK_PENDING_ACTIVATION_BATCH_ID: z.string().uuid(),
    WORKBOOK_PENDING_ACTIVATION_ACTOR_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    WORKBOOK_PENDING_ACTIVATION_PLAN_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    CONFIRM: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    if (env.CONFIRM === "1" && !env.WORKBOOK_PENDING_ACTIVATION_PLAN_SHA256) {
      ctx.addIssue({
        code: "custom",
        path: ["WORKBOOK_PENDING_ACTIVATION_PLAN_SHA256"],
        message: "CONFIRM=1 requires the exact reviewed dry-run plan SHA-256",
      });
    }
  });

function countBlockers(values: readonly { code: string }[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value.code] = (counts[value.code] ?? 0) + 1;
    return counts;
  }, {});
}

async function main(): Promise<void> {
  const env = EnvironmentSchema.parse(process.env);
  const prisma = new PrismaClient();
  try {
    const invocation = {
      batchId: env.WORKBOOK_PENDING_ACTIVATION_BATCH_ID,
      actorEmail: env.WORKBOOK_PENDING_ACTIVATION_ACTOR_EMAIL,
    };
    const plan = await planWorkbookPendingActivationFromDatabase(
      prisma,
      invocation,
    );
    console.log(
      JSON.stringify(
        {
          event: "workbook-pending-payment-activation",
          ok: true,
          mode: env.CONFIRM === "1" ? "confirm" : "dry-run",
          batchId: plan.batchId,
          planSha256: plan.planSha256,
          capturedAt: plan.capturedAt,
          alreadyApplied: plan.alreadyApplied,
          confirmBlocked: plan.confirmBlocked,
          blockerCounts: countBlockers(plan.blockers),
          controls: {
            expectedTargets: 9,
            targetCount: plan.targetCount,
            activeLinkCount: plan.activeLinkCount,
            proofDraftCount: plan.proofDraftCount,
            submittedProofCount: plan.submittedProofCount,
            activePiSpiCount: plan.activePiSpiCount,
            pendingPaymentCount: plan.pendingPaymentCount,
            refundPendingCount: plan.refundPendingCount,
            globalStudentCounts: plan.globalStudentCounts,
          },
          actorId: "<authorized>",
        },
        null,
        2,
      ),
    );
    if (env.CONFIRM === "0") {
      if (plan.alreadyApplied) {
        const audit = await auditWorkbookPendingActivation(
          prisma,
          invocation.batchId,
          plan.planSha256,
        );
        console.log(
          JSON.stringify(
            {
              event: "workbook-pending-payment-activation-existing-audit",
              ok: true,
              audit,
            },
            null,
            2,
          ),
        );
      }
      return;
    }
    if (plan.confirmBlocked || plan.blockers.length > 0) {
      throw new WorkbookPendingActivationBlockedError(
        "Confirmation is disabled until every activation control passes",
        { blockerCounts: countBlockers(plan.blockers) },
      );
    }
    const expectedPlanSha256 = env.WORKBOOK_PENDING_ACTIVATION_PLAN_SHA256!;
    const result = await executeWorkbookPendingActivation(prisma, {
      ...invocation,
      expectedPlanSha256,
    });
    const audit = await auditWorkbookPendingActivation(
      prisma,
      invocation.batchId,
      expectedPlanSha256,
    );
    const auditRowsBeforeReplay = await prisma.auditLog.count();
    const replay = await executeWorkbookPendingActivation(prisma, {
      ...invocation,
      expectedPlanSha256,
    });
    const auditRowsAfterReplay = await prisma.auditLog.count();
    if (
      !replay.alreadyApplied ||
      replay.auditRowsCreated !== 0 ||
      auditRowsAfterReplay !== auditRowsBeforeReplay
    ) {
      throw new WorkbookPendingActivationBlockedError(
        "Exact replay created unexpected mutations or audit evidence",
      );
    }
    console.log(
      JSON.stringify(
        {
          event: "workbook-pending-payment-activation-post-audit",
          ok: true,
          result,
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
  if (error instanceof z.ZodError) {
    console.error(
      JSON.stringify({
        event: "workbook-pending-payment-activation",
        ok: false,
        error: "invalid_environment",
        issuePaths: error.issues.map((issue) => issue.path.join(".")),
      }),
    );
  } else if (error instanceof WorkbookPendingActivationBlockedError) {
    console.error(
      JSON.stringify({
        event: "workbook-pending-payment-activation",
        ok: false,
        error: error.name,
        message: error.message,
        details: error.details,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        event: "workbook-pending-payment-activation",
        ok: false,
        error: "unexpected_failure",
      }),
    );
  }
  process.exitCode = 1;
});
