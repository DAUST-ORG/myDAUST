# Workbook pending-payment activation override

This one-time, CLI-only operation activates the nine workbook-backed Students
left in `pending_payment` by the August 29 workbook cutover. It is not an HTTP
endpoint and it does not record, infer, or fabricate payment.

The command derives its targets exclusively from an imported
`WorkbookCutoverBatch`: a target must have a `production_student` source record
with disposition `link_workbook_row`, a linked canonical workbook row, and a
current `pending_payment` Student. Confirmation fails unless exactly nine such
records exist.

## What changes

For each reviewed target, confirmation performs one atomic lifecycle override:

- `Student.recordStatus` becomes `active` and `enrolledAt` is set;
- the Person receives exactly the `student` role and its `sessionVersion` is
  incremented so no latent pre-activation session can inherit that role;
- the linked Applicant remains at stage `accepted`, while
  `onboardingStatus` becomes `enrolled` and `activatedByPaymentId` remains null;
- the Applicant status bearer is revoked and its active onboarding-link pointer
  is cleared;
- the single active onboarding PaymentLink for each target is cancelled.

The operation leaves invoices, successful payments, balances, passwords,
StudentInvite rows, course enrollments, transcripts, grades, GPA, housing, and
dining unchanged. Any awaiting/submitted proof, initiated/sent PI-SPI request,
pending/refund-pending Payment, mismatched identity, Applicant drift, missing
canonical workbook link, or PaymentLink ownership mismatch blocks the whole
transaction. Finance must resolve or terminally cancel any in-flight attempt,
then produce a new clean dry-run digest; this override never preserves or
retires in-flight cash work.

Each target must also be a never-activated login identity: no password hash,
password-change timestamp, prior login timestamp, StudentInvite, or active
StudentActivationRequest or StudentActivationCard may exist. The operation does
not create a password, invite, or activation card.

## Dry run

Build the API first, then run with an active staff administrator's institutional
email and the exact imported cutover batch ID:

```bash
WORKBOOK_PENDING_ACTIVATION_BATCH_ID=<cutover-batch-uuid> \
WORKBOOK_PENDING_ACTIVATION_ACTOR_EMAIL=<administrator@example.edu> \
pnpm --filter @mydaust/api run activate:workbook-pending-students
```

Dry run is the default. Review only the redacted blocker counts and controls.
The clean result must show nine targets, nine active onboarding links, zero
proof drafts, zero submitted proofs, zero active PI-SPI requests, zero pending
Payments, zero pending refunds, `confirmBlocked: false`, and a `planSha256`.
The batch-anchored roster slice must contain exactly nine pending-payment and
46 archived Students, and the pre-cutover unanchored slice must be empty.
Legitimate Students created after the cutover may remain outside the batch;
their IDs, Person IDs, lifecycle states, and creation timestamps are bound into
one post-cutover non-target fingerprint. All slices must reconcile to the global
status partition, and their exact dry-run state must remain unchanged through
confirmation. Any intervening roster change produces a different plan digest
or blocks confirmation and requires a new dry run. The batch summary persists
the reviewed pre-activation counts and derives the expected post-activation
counts by moving exactly nine Students from pending-payment to active without
changing the physical or archived totals.

## Confirmation

Freeze Admissions and Finance lifecycle mutations through the confirmation,
post-audit, and exact replay. Do not unfreeze after the transaction commit;
unfreeze only after both verification steps report success. Before
confirmation, create a fresh encrypted RDS snapshot for this lifecycle-only
change; the older pre-cutover snapshot is not a substitute. Bind the new
snapshot to the exact clean activation digest with tags:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier daust-prod-pg \
  --db-snapshot-identifier daust-prod-pre-pending-activation-YYYYMMDDTHHMMSSZ

aws rds wait db-snapshot-available \
  --db-snapshot-identifier daust-prod-pre-pending-activation-YYYYMMDDTHHMMSSZ

aws rds add-tags-to-resource \
  --resource-name <new-snapshot-arn> \
  --tags \
    Key=Purpose,Value=workbook-pending-payment-activation \
    Key=ActivationPlanSha256,Value=<exact-clean-plan-sha256> \
    Key=WorkbookCutoverBatchId,Value=<cutover-batch-uuid>

aws rds describe-db-snapshots \
  --db-snapshot-identifier daust-prod-pre-pending-activation-YYYYMMDDTHHMMSSZ \
  --query 'DBSnapshots[0].{Status:Status,Encrypted:Encrypted,KmsKeyId:KmsKeyId,SnapshotArn:DBSnapshotArn}'

aws rds list-tags-for-resource \
  --resource-name <new-snapshot-arn> \
  --query 'TagList[?Key==`Purpose` || Key==`ActivationPlanSha256` || Key==`WorkbookCutoverBatchId`]'
```

Do not confirm unless the snapshot is `available`, `Encrypted` is `true`, its
KMS key is present, and all three tags exactly match the reviewed run. Confirm
only the exact digest from the latest clean dry run:

```bash
CONFIRM=1 \
WORKBOOK_PENDING_ACTIVATION_BATCH_ID=<cutover-batch-uuid> \
WORKBOOK_PENDING_ACTIVATION_ACTOR_EMAIL=<administrator@example.edu> \
WORKBOOK_PENDING_ACTIVATION_PLAN_SHA256=<exact-clean-plan-sha256> \
pnpm --filter @mydaust/api run activate:workbook-pending-students
```

Confirmation locks the cutover batch and every planned lifecycle, payment-link,
attempt, payment, and invoice row. It replans inside a retrying `SERIALIZABLE`
transaction and rejects a changed digest. Success writes exactly nine Student
audit rows, nine Applicant audit rows, and one batch summary audit row.

Both dry run and confirmation first run the original independent workbook
cutover audit; an existing financial, academic, roster, source, or provenance
anomaly therefore prevents the lifecycle transaction from starting. The CLI
immediately runs its post-audit and exact replay. Replay must return
`alreadyApplied: true`, create no audit rows, and leave the global AuditLog count
unchanged. Retain both the original pre-cutover snapshot and the new
plan-bound pre-activation snapshot until Finance, Registrar, and Admissions
sign off.
