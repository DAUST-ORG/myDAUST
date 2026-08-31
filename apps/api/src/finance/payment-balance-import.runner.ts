import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@mydaust/db";
import { MailService } from "../mail/mail.service.js";
import { deliverStudentActivationInviteAfterCommit } from "./activation-invite-delivery.js";
import type { EnrollmentActivation } from "./admission-payment-gate.js";
import { applyHistoricalCashSettlementInTransaction } from "./historical-cash-settlement.js";
import {
  type PaymentBalanceImportManifest,
  paymentBalanceManifestDigest,
} from "./payment-balance-import.manifest.js";
import {
  type PaymentBalanceHeldRow,
  type PaymentBalanceImportPlan,
  type PaymentBalanceLiveSnapshot,
  type PaymentBalancePlanRow,
  PaymentBalanceLiveSnapshotSchema,
  planPaymentBalanceImport,
} from "./payment-balance-import.planner.js";

const IMPORT_ROLES = new Set(["admin", "bursar"]);
const MAX_TRANSACTION_ATTEMPTS = 3;

type ImportDb = Pick<
  Prisma.TransactionClient,
  | "auditLog"
  | "invoice"
  | "paymentBalanceImportBatch"
  | "paymentBalanceImportRow"
  | "person"
  | "student"
>;

export interface PaymentBalanceImportInvocation {
  actorEmail: string;
}

export interface PaymentBalanceImportExecutionInvocation extends PaymentBalanceImportInvocation {
  expectedPlanSha256: string;
}

interface PriorImportedRow {
  id: string;
  sourceClaimSha256: string | null;
  sourcePaidToDateXof: bigint;
  disposition: string;
  studentId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
}

export interface PaymentBalancePreviouslyImportedRow {
  disposition: "previously_imported";
  sourceRowKey: string;
  sourceTargetPaidXof: number;
  identityDecision: PaymentBalancePlanRow["identityDecision"];
  studentId: string;
  studentNo: string;
  invoiceId: string;
  invoiceNumber: string | null;
  expectedInvoiceRevision: number;
  /** Source-control contribution; intentionally fixed at the original target. */
  expectedLedgerPaidXof: number;
  /** Current live ledger, included in the confirmed deterministic plan anchor. */
  observedLedgerPaidXof: number;
  priorImportedRowId: string;
  priorPaymentId: string | null;
  priorDisposition: "post_delta" | "already_reconciled";
}

export type PaymentBalanceExecutableRow =
  PaymentBalancePlanRow | PaymentBalancePreviouslyImportedRow;

export interface PaymentBalanceDatabasePlan {
  actorId: string;
  alreadyImportedBatchId: string | null;
  sourceWorkbookSha256: string;
  trustedExtractionSha256: string;
  manifestSha256: string;
  planSha256: string;
  capturedAt: string;
  rows: PaymentBalanceExecutableRow[];
  postableRows: number;
  alreadyReconciledRows: number;
  previouslyImportedRows: number;
  heldRows: number;
  sourcePaidTotalXof: number;
  resolvedSourcePaidXof: number;
  heldSourcePaidXof: number;
  baselineLedgerPaidXof: number;
  importedDeltaXof: number;
  holdCounts: Record<string, number>;
}

export interface PaymentBalanceImportResult {
  batchId: string;
  alreadyImported: boolean;
  importedRows: number;
  alreadyReconciledRows: number;
  previouslyImportedRows: number;
  heldRows: number;
  importedXof: number;
  activations: number;
  activationInvitesSent: number;
  activationInvitesPending: number;
}

interface PaymentBalanceCommittedImport {
  result: PaymentBalanceImportResult;
  activationPayloads: EnrollmentActivation[];
}

export class PaymentBalanceImportBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PaymentBalanceImportBlockedError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceClaimSha256(
  sourceWorkbookSha256: string,
  sourceRowKey: string,
): string {
  return sha256(`${sourceWorkbookSha256}\n${sourceRowKey}`);
}

function normalizedStudentNo(studentNo: string): string {
  return studentNo.normalize("NFKC").trim().toUpperCase();
}

function providerRefForClaim(claimSha256: string): string {
  return `BAL-${claimSha256}`;
}

function sumXof(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new PaymentBalanceImportBlockedError(
      "Paid-to-date control total exceeds safe whole XOF",
      {},
    );
  }
  return total;
}

async function requireImportActor(db: ImportDb, actorEmailInput: string) {
  const actorEmail = actorEmailInput.trim().toLowerCase();
  const actor = await db.person.findUnique({
    where: { email: actorEmail },
    select: { id: true, roles: true, status: true },
  });
  if (
    !actor ||
    actor.status !== "active" ||
    !actor.roles.some((role) => IMPORT_ROLES.has(role))
  ) {
    throw new PaymentBalanceImportBlockedError(
      "Import actor must be an active bursar or administrator",
      {},
    );
  }
  return actor;
}

function isMissingBalanceSchema(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  );
}

async function findExistingBatch(
  db: ImportDb,
  manifestSha256: string,
  allowMissingSchema: boolean,
) {
  try {
    return await db.paymentBalanceImportBatch.findUnique({
      where: { manifestSha256 },
      select: {
        id: true,
        status: true,
        sourceSha256: true,
        sourceExtractionSha256: true,
        confirmationPlanSha256: true,
        sourcePaidTotalXof: true,
        importedRows: true,
        alreadyReconciledRows: true,
        previouslyImportedRows: true,
        heldRows: true,
        resolvedSourcePaidXof: true,
        heldSourcePaidXof: true,
        baselineLedgerPaidXof: true,
        importedDeltaXof: true,
      },
    });
  } catch (error) {
    if (allowMissingSchema && isMissingBalanceSchema(error)) return null;
    throw error;
  }
}

async function priorImportedRows(
  db: ImportDb,
  claimHashes: string[],
  allowMissingSchema: boolean,
): Promise<PriorImportedRow[]> {
  if (claimHashes.length === 0) return [];
  try {
    return await db.paymentBalanceImportRow.findMany({
      where: { sourceClaimSha256: { in: claimHashes } },
      select: {
        id: true,
        sourceClaimSha256: true,
        sourcePaidToDateXof: true,
        disposition: true,
        studentId: true,
        invoiceId: true,
        paymentId: true,
      },
    });
  } catch (error) {
    if (allowMissingSchema && isMissingBalanceSchema(error)) return [];
    throw error;
  }
}

export async function capturePaymentBalanceLiveSnapshot(
  db: ImportDb,
  manifest: PaymentBalanceImportManifest,
): Promise<PaymentBalanceLiveSnapshot> {
  const studentNos = [
    ...new Set(
      manifest.rows.flatMap((row) =>
        row.identity.decision === "exact_match" ? [row.identity.studentNo] : [],
      ),
    ),
  ].sort();
  const students = await db.student.findMany({
    where: { studentNo: { in: studentNos } },
    orderBy: { studentNo: "asc" },
    select: {
      id: true,
      studentNo: true,
      recordStatus: true,
      invoices: {
        where: {
          academicYearLabel: manifest.academicYearLabel,
          packageType: "standard_full",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          number: true,
          revision: true,
          status: true,
          packageType: true,
          academicYearLabel: true,
          totalAmount: true,
          amountPaid: true,
          plan: {
            select: {
              installments: {
                orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
                select: {
                  id: true,
                  sequence: true,
                  dueDate: true,
                  amountDue: true,
                  amountPaid: true,
                },
              },
            },
          },
          components: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              amountXof: true,
              allocations: {
                select: { amountXof: true, refundedAmountXof: true },
              },
            },
          },
          payments: {
            where: {
              status: { in: ["success", "refund_pending", "refunded"] },
            },
            orderBy: { id: "asc" },
            select: {
              id: true,
              amount: true,
              status: true,
              providerRef: true,
              refundedAt: true,
            },
          },
          paymentSubmissions: {
            where: { status: { in: ["awaiting_proof", "submitted"] } },
            orderBy: { id: "asc" },
            select: { id: true },
          },
          piSpiRequests: {
            where: { status: { in: ["initiated", "sent"] } },
            orderBy: { id: "asc" },
            select: { id: true },
          },
        },
      },
    },
  });
  return PaymentBalanceLiveSnapshotSchema.parse({
    capturedAt: new Date().toISOString(),
    students: students.map((student) => ({
      id: student.id,
      studentNo: student.studentNo,
      recordStatus: student.recordStatus,
      invoices: student.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        revision: invoice.revision,
        status: invoice.status,
        packageType: "standard_full",
        academicYearLabel: manifest.academicYearLabel,
        totalAmountXof: invoice.totalAmount,
        ledgerPaidXof: invoice.amountPaid,
        installments: (invoice.plan?.installments ?? []).map((installment) => ({
          id: installment.id,
          sequence: installment.sequence,
          dueOn: installment.dueDate.toISOString().slice(0, 10),
          amountDueXof: installment.amountDue,
          ledgerPaidXof: installment.amountPaid,
        })),
        components: invoice.components.map((component) => ({
          id: component.id,
          amountXof: component.amountXof,
          ledgerPaidXof: component.allocations.reduce(
            (sum, allocation) =>
              sum + allocation.amountXof - allocation.refundedAmountXof,
            0,
          ),
        })),
        payments: invoice.payments.map((payment) => ({
          id: payment.id,
          amountXof: payment.amount,
          status: payment.status,
          providerRef: payment.providerRef,
          refundedAt: payment.refundedAt?.toISOString() ?? null,
        })),
        inFlightProofSubmissionIds: invoice.paymentSubmissions.map(
          (submission) => submission.id,
        ),
        inFlightPiSpiRequestIds: invoice.piSpiRequests.map(
          (request) => request.id,
        ),
      })),
    })),
  });
}

function exactReplayPlan(
  actorId: string,
  manifest: PaymentBalanceImportManifest,
  manifestSha256: string,
  existing: NonNullable<Awaited<ReturnType<typeof findExistingBatch>>>,
): PaymentBalanceDatabasePlan {
  if (
    existing.status !== "imported" ||
    existing.sourceSha256 !== manifest.sourceWorkbook.sha256 ||
    existing.sourceExtractionSha256 !== manifest.trustedExtraction.sha256 ||
    Number(existing.sourcePaidTotalXof) !== manifest.sourcePaidTotalXof
  ) {
    throw new PaymentBalanceImportBlockedError(
      "Manifest digest is already attached to a different or incomplete batch",
      { batchId: existing.id, status: existing.status },
    );
  }
  return {
    actorId,
    alreadyImportedBatchId: existing.id,
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    manifestSha256,
    planSha256: existing.confirmationPlanSha256,
    capturedAt: "already-imported",
    rows: [],
    postableRows: Number(existing.importedRows),
    alreadyReconciledRows: Number(existing.alreadyReconciledRows),
    previouslyImportedRows: Number(existing.previouslyImportedRows),
    heldRows: Number(existing.heldRows),
    sourcePaidTotalXof: Number(existing.sourcePaidTotalXof),
    resolvedSourcePaidXof: Number(existing.resolvedSourcePaidXof),
    heldSourcePaidXof: Number(existing.heldSourcePaidXof),
    baselineLedgerPaidXof: Number(existing.baselineLedgerPaidXof),
    importedDeltaXof: Number(existing.importedDeltaXof),
    holdCounts: {},
  };
}

function mergePriorRows(
  plan: PaymentBalanceImportPlan,
  priorRows: PriorImportedRow[],
  snapshot: PaymentBalanceLiveSnapshot,
  manifest: PaymentBalanceImportManifest,
): PaymentBalanceExecutableRow[] {
  const priorByClaim = new Map(
    priorRows.flatMap((row) =>
      row.sourceClaimSha256 ? [[row.sourceClaimSha256, row] as const] : [],
    ),
  );
  const sourceByKey = new Map(
    manifest.rows.map((source) => [source.sourceRowKey, source]),
  );
  return plan.rows.map((row) => {
    const claim = sourceClaimSha256(
      plan.sourceWorkbookSha256,
      row.sourceRowKey,
    );
    const prior = priorByClaim.get(claim);
    if (!prior) return row;
    const source = sourceByKey.get(row.sourceRowKey);
    if (
      !source ||
      source.identity.decision !== "exact_match" ||
      !prior.studentId ||
      !prior.invoiceId ||
      Number(prior.sourcePaidToDateXof) !== row.sourceTargetPaidXof ||
      !["post_delta", "already_reconciled"].includes(prior.disposition) ||
      (prior.disposition === "post_delta" && !prior.paymentId) ||
      (prior.disposition === "already_reconciled" && prior.paymentId !== null)
    ) {
      throw new PaymentBalanceImportBlockedError(
        "A previously resolved source row conflicts with the current reviewed plan",
        { sourceRowKey: row.sourceRowKey, priorImportedRowId: prior.id },
      );
    }
    if (source.identity.decision !== "exact_match") {
      throw new PaymentBalanceImportBlockedError(
        "A previously resolved source row lost its exact identity decision",
        { sourceRowKey: row.sourceRowKey, priorImportedRowId: prior.id },
      );
    }
    const sourceStudentNo = source.identity.studentNo;
    const students = snapshot.students.filter(
      (student) => normalizedStudentNo(student.studentNo) === sourceStudentNo,
    );
    const student = students.length === 1 ? students[0]! : null;
    const invoice = student?.invoices.find(
      (candidate) =>
        candidate.id === prior.invoiceId &&
        candidate.status !== "void" &&
        candidate.totalAmountXof > 0 &&
        candidate.packageType === "standard_full" &&
        candidate.academicYearLabel === manifest.academicYearLabel,
    );
    if (
      !student ||
      student.id !== prior.studentId ||
      !invoice ||
      invoice.ledgerPaidXof < row.sourceTargetPaidXof
    ) {
      throw new PaymentBalanceImportBlockedError(
        "A previously resolved source row no longer matches its immutable student invoice",
        { sourceRowKey: row.sourceRowKey, priorImportedRowId: prior.id },
      );
    }
    return {
      disposition: "previously_imported",
      sourceRowKey: row.sourceRowKey,
      sourceTargetPaidXof: row.sourceTargetPaidXof,
      identityDecision: source.identity,
      studentId: student.id,
      studentNo: sourceStudentNo,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      expectedInvoiceRevision: invoice.revision,
      expectedLedgerPaidXof: row.sourceTargetPaidXof,
      observedLedgerPaidXof: invoice.ledgerPaidXof,
      priorImportedRowId: prior.id,
      priorPaymentId: prior.paymentId,
      priorDisposition: prior.disposition as
        "post_delta" | "already_reconciled",
    };
  });
}

function databasePlanFromRows(
  actorId: string,
  manifest: PaymentBalanceImportManifest,
  purePlan: PaymentBalanceImportPlan,
  rows: PaymentBalanceExecutableRow[],
): PaymentBalanceDatabasePlan {
  const postable = rows.filter((row) => row.disposition === "post_delta");
  const already = rows.filter(
    (row) => row.disposition === "already_reconciled",
  );
  const previous = rows.filter(
    (row) => row.disposition === "previously_imported",
  );
  const held = rows.filter(
    (row): row is PaymentBalanceHeldRow => row.disposition === "held",
  );
  const heldSourcePaidXof = sumXof(held.map((row) => row.sourceTargetPaidXof));
  const baselineLedgerPaidXof = sumXof(
    rows.flatMap((row) =>
      row.disposition === "post_delta" ||
      row.disposition === "already_reconciled" ||
      row.disposition === "previously_imported"
        ? [row.expectedLedgerPaidXof]
        : [],
    ),
  );
  const importedDeltaXof = sumXof(
    postable.map((row) =>
      row.disposition === "post_delta" ? row.deltaXof : 0,
    ),
  );
  const resolvedSourcePaidXof = manifest.sourcePaidTotalXof - heldSourcePaidXof;
  if (
    rows.length !== manifest.sourceRowCount ||
    baselineLedgerPaidXof + importedDeltaXof !== resolvedSourcePaidXof
  ) {
    throw new PaymentBalanceImportBlockedError(
      "Paid-to-date execution plan failed its control equations",
      {},
    );
  }
  const planSha256 = sha256(
    canonicalJson({
      schemaVersion: 1,
      purePlanSha256: purePlan.planSha256,
      manifestSha256: purePlan.manifestSha256,
      rows,
    }),
  );
  const holdCounts: Record<string, number> = {};
  for (const row of held)
    holdCounts[row.code] = (holdCounts[row.code] ?? 0) + 1;
  return {
    actorId,
    alreadyImportedBatchId: null,
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    manifestSha256: purePlan.manifestSha256,
    planSha256,
    capturedAt: purePlan.capturedAt,
    rows,
    postableRows: postable.length,
    alreadyReconciledRows: already.length,
    previouslyImportedRows: previous.length,
    heldRows: held.length,
    sourcePaidTotalXof: manifest.sourcePaidTotalXof,
    resolvedSourcePaidXof,
    heldSourcePaidXof,
    baselineLedgerPaidXof,
    importedDeltaXof,
    holdCounts,
  };
}

async function planWithDb(
  db: ImportDb,
  manifest: PaymentBalanceImportManifest,
  invocation: PaymentBalanceImportInvocation,
  allowMissingSchema: boolean,
): Promise<PaymentBalanceDatabasePlan> {
  const actor = await requireImportActor(db, invocation.actorEmail);
  const manifestSha256 = paymentBalanceManifestDigest(manifest);
  const existing = await findExistingBatch(
    db,
    manifestSha256,
    allowMissingSchema,
  );
  if (existing)
    return exactReplayPlan(actor.id, manifest, manifestSha256, existing);
  const snapshot = await capturePaymentBalanceLiveSnapshot(db, manifest);
  const purePlan = planPaymentBalanceImport(manifest, snapshot);
  const claimHashes = purePlan.rows.map((row) =>
    sourceClaimSha256(manifest.sourceWorkbook.sha256, row.sourceRowKey),
  );
  const prior = await priorImportedRows(db, claimHashes, allowMissingSchema);
  return databasePlanFromRows(
    actor.id,
    manifest,
    purePlan,
    mergePriorRows(purePlan, prior, snapshot, manifest),
  );
}

export async function planPaymentBalanceImportFromDatabase(
  db: ImportDb,
  manifest: PaymentBalanceImportManifest,
  invocation: PaymentBalanceImportInvocation,
): Promise<PaymentBalanceDatabasePlan> {
  return planWithDb(db, manifest, invocation, true);
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  );
}

export async function executePaymentBalanceImport(
  prisma: PrismaClient,
  manifest: PaymentBalanceImportManifest,
  invocation: PaymentBalanceImportExecutionInvocation,
): Promise<PaymentBalanceImportResult> {
  if (!/^[a-f0-9]{64}$/.test(invocation.expectedPlanSha256)) {
    throw new PaymentBalanceImportBlockedError(
      "Confirmation requires the exact dry-run plan SHA-256",
      {},
    );
  }
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      const committed = await prisma.$transaction(
        async (tx) => {
          const plan = await planWithDb(tx, manifest, invocation, false);
          if (plan.alreadyImportedBatchId) {
            return {
              result: {
                batchId: plan.alreadyImportedBatchId,
                alreadyImported: true,
                importedRows: 0,
                alreadyReconciledRows: plan.alreadyReconciledRows,
                previouslyImportedRows: plan.previouslyImportedRows,
                heldRows: plan.heldRows,
                importedXof: 0,
                activations: 0,
                activationInvitesSent: 0,
                activationInvitesPending: 0,
              },
              activationPayloads: [],
            } satisfies PaymentBalanceCommittedImport;
          }
          if (plan.planSha256 !== invocation.expectedPlanSha256) {
            throw new PaymentBalanceImportBlockedError(
              "Live paid-to-date plan changed after the reviewed dry run",
              {
                expectedPlanSha256: invocation.expectedPlanSha256,
                livePlanSha256: plan.planSha256,
              },
            );
          }
          const batch = await tx.paymentBalanceImportBatch.create({
            data: {
              sourceFileName: manifest.sourceWorkbook.fileName,
              sourceSha256: manifest.sourceWorkbook.sha256,
              sourceExtractionSha256: manifest.trustedExtraction.sha256,
              manifestSha256: plan.manifestSha256,
              confirmationPlanSha256: plan.planSha256,
              academicYearLabel: manifest.academicYearLabel,
              sourceAsOfDate: new Date(
                `${manifest.sourceAsOfDate}T00:00:00.000Z`,
              ),
              sourceSheet: manifest.rows[0]!.sourceSheet,
              sourceRowCount: manifest.sourceRowCount,
              sourcePaidTotalXof: BigInt(manifest.sourcePaidTotalXof),
              createdById: plan.actorId,
            },
          });
          const manifestRows = new Map(
            manifest.rows.map((row) => [row.sourceRowKey, row]),
          );
          const activationPayloads: EnrollmentActivation[] = [];
          for (const row of plan.rows) {
            const source = manifestRows.get(row.sourceRowKey)!;
            const claimSha256 = sourceClaimSha256(
              manifest.sourceWorkbook.sha256,
              row.sourceRowKey,
            );
            const rowBase = {
              batchId: batch.id,
              sourceSheet: source.sourceSheet,
              sourceRowNumber: source.sourceRowNumber,
              sourceRowKey: source.sourceRowKey,
              sourceRowKeySha256: claimSha256,
              rowFingerprintSha256: source.sourceRecordSha256,
              sourcePaidToDateXof: BigInt(source.amountPaidXof),
              identityDecision: source.identity.decision,
              matchMethod:
                source.identity.decision === "exact_match"
                  ? source.identity.matchMethod
                  : null,
            };
            if (row.disposition === "held") {
              await tx.paymentBalanceImportRow.create({
                data: {
                  ...rowBase,
                  disposition: "held",
                  holdCode: row.code,
                  holdReason: row.message,
                },
              });
              continue;
            }
            if (row.disposition === "previously_imported") {
              await tx.paymentBalanceImportRow.create({
                data: {
                  ...rowBase,
                  disposition: "previously_imported",
                  studentId: row.studentId,
                  invoiceId: row.invoiceId,
                  invoiceRevision: row.expectedInvoiceRevision,
                  baselineLedgerPaidXof: BigInt(row.expectedLedgerPaidXof),
                  deltaXof: 0n,
                  priorImportedRowId: row.priorImportedRowId,
                },
              });
              continue;
            }
            if (row.disposition === "already_reconciled") {
              await tx.paymentBalanceImportRow.create({
                data: {
                  ...rowBase,
                  disposition: "already_reconciled",
                  studentId: row.studentId,
                  invoiceId: row.invoiceId,
                  invoiceRevision: row.expectedInvoiceRevision,
                  baselineLedgerPaidXof: BigInt(row.expectedLedgerPaidXof),
                  deltaXof: 0n,
                  sourceClaimSha256: claimSha256,
                },
              });
              continue;
            }

            const liveInvoice = await tx.invoice.findUnique({
              where: { id: row.invoiceId },
              select: { revision: true, amountPaid: true },
            });
            if (
              !liveInvoice ||
              liveInvoice.revision !== row.expectedInvoiceRevision ||
              liveInvoice.amountPaid !== row.expectedLedgerPaidXof
            ) {
              throw new PaymentBalanceImportBlockedError(
                "Target invoice changed inside the confirmed import transaction",
                { sourceRowKey: row.sourceRowKey, invoiceId: row.invoiceId },
              );
            }
            const paymentId = randomUUID();
            const settlement = await applyHistoricalCashSettlementInTransaction(
              tx,
              {
                paymentId,
                invoiceId: row.invoiceId,
                studentId: row.studentId,
                amountXof: row.deltaXof,
                method: "legacy_unknown",
                provider: "balance_reconciliation",
                source: "paid_to_date_workbook",
                providerRef: providerRefForClaim(claimSha256),
                settledAt: null,
                actorId: plan.actorId,
                ipnPayload: {
                  sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
                  manifestSha256: plan.manifestSha256,
                  sourceAsOfDate: manifest.sourceAsOfDate,
                  sourceRowKeySha256: claimSha256,
                  sourceSheet: source.sourceSheet,
                  sourceRowNumber: source.sourceRowNumber,
                  targetPaidToDateXof: source.amountPaidXof,
                  baselineLedgerPaidXof: row.expectedLedgerPaidXof,
                },
                auditAction: "paid-to-date-balance-imported",
                auditData: {
                  batchId: batch.id,
                  sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
                  manifestSha256: plan.manifestSha256,
                  sourceAsOfDate: manifest.sourceAsOfDate,
                  sourceClaimSha256: claimSha256,
                  sourceRowKeySha256: claimSha256,
                  sourceRowNumber: source.sourceRowNumber,
                  targetPaidToDateXof: source.amountPaidXof,
                  baselineLedgerPaidXof: row.expectedLedgerPaidXof,
                  importedDeltaXof: row.deltaXof,
                },
                plannedInstallmentAllocations: row.installmentAllocations,
                plannedComponentAllocations: row.componentAllocations,
              },
            );
            if (settlement.activation) {
              activationPayloads.push(settlement.activation);
            }
            await tx.paymentBalanceImportRow.create({
              data: {
                ...rowBase,
                disposition: "post_delta",
                studentId: row.studentId,
                invoiceId: row.invoiceId,
                invoiceRevision: row.expectedInvoiceRevision,
                baselineLedgerPaidXof: BigInt(row.expectedLedgerPaidXof),
                deltaXof: BigInt(row.deltaXof),
                paymentId,
                sourceClaimSha256: claimSha256,
              },
            });
          }

          await tx.paymentBalanceImportBatch.update({
            where: { id: batch.id },
            data: {
              status: "imported",
              importedRows: plan.postableRows,
              alreadyReconciledRows: plan.alreadyReconciledRows,
              previouslyImportedRows: plan.previouslyImportedRows,
              heldRows: plan.heldRows,
              resolvedSourcePaidXof: BigInt(plan.resolvedSourcePaidXof),
              heldSourcePaidXof: BigInt(plan.heldSourcePaidXof),
              baselineLedgerPaidXof: BigInt(plan.baselineLedgerPaidXof),
              importedDeltaXof: BigInt(plan.importedDeltaXof),
              importedAt: new Date(),
            },
          });
          await tx.auditLog.create({
            data: {
              entity: "PaymentBalanceImportBatch",
              entityId: batch.id,
              action: "imported",
              actorId: plan.actorId,
              data: {
                sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
                sourceExtractionSha256: manifest.trustedExtraction.sha256,
                manifestSha256: plan.manifestSha256,
                confirmationPlanSha256: plan.planSha256,
                sourceAsOfDate: manifest.sourceAsOfDate,
                sourceRowCount: manifest.sourceRowCount,
                importedRows: plan.postableRows,
                alreadyReconciledRows: plan.alreadyReconciledRows,
                previouslyImportedRows: plan.previouslyImportedRows,
                heldRows: plan.heldRows,
                sourcePaidTotalXof: plan.sourcePaidTotalXof,
                importedDeltaXof: plan.importedDeltaXof,
                activations: activationPayloads.length,
              },
            },
          });
          return {
            result: {
              batchId: batch.id,
              alreadyImported: false,
              importedRows: plan.postableRows,
              alreadyReconciledRows: plan.alreadyReconciledRows,
              previouslyImportedRows: plan.previouslyImportedRows,
              heldRows: plan.heldRows,
              importedXof: plan.importedDeltaXof,
              activations: activationPayloads.length,
              activationInvitesSent: 0,
              activationInvitesPending: 0,
            },
            activationPayloads,
          } satisfies PaymentBalanceCommittedImport;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 300_000,
        },
      );

      if (committed.activationPayloads.length === 0) return committed.result;

      // The setup secret exists only in memory after the money transaction commits.
      // Delivery is best-effort like ordinary Finance settlement: the shared helper
      // marks successful delivery or writes a durable pending audit for Admissions.
      const mail = new MailService();
      const deliveries = await Promise.allSettled(
        committed.activationPayloads.map((activation) =>
          deliverStudentActivationInviteAfterCommit(prisma, mail, activation),
        ),
      );
      let activationInvitesSent = 0;
      let activationInvitesPending = 0;
      for (const delivery of deliveries) {
        if (delivery.status === "fulfilled" && delivery.value === "sent") {
          activationInvitesSent += 1;
        } else {
          activationInvitesPending += 1;
        }
      }
      return {
        ...committed.result,
        activationInvitesSent,
        activationInvitesPending,
      };
    } catch (error) {
      if (
        attempt < MAX_TRANSACTION_ATTEMPTS &&
        isRetryableTransactionError(error)
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new PaymentBalanceImportBlockedError(
    "Paid-to-date import exhausted transaction retries",
    {},
  );
}
