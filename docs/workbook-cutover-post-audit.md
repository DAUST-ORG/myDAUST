# Workbook cutover independent post-audit

`auditWorkbookCutoverBatch(prisma, batchId)` is the fail-closed, read-only audit
for the August 29 roster and billing cutover. Run it after the confirmed batch
commits and before Finance maintenance ends. An exception is a release blocker;
do not repair production by hand or release the maintenance window around it.

The audit verifies:

- every workbook row, original production Student, and current Applicant is
  represented exactly once by a signed, applied source disposition, including
  the reviewed baseline counts of 403, 417, and 42 respectively;
- the included and reviewed-exclusion monetary partitions add back to
  1,514,469,978 XOF billed and 286,551,264 XOF paid;
- every original production Student and Applicant ID still exists;
- every distinct signed reviewer is covered by one exact authenticated
  attestation for the imported manifest, with the current statement and a
  valid identity/role snapshot at confirmation time;
- the original production Students' transcript, enrollment, immutable grade
  snapshot, credit, and GPA fingerprints still match the pre-cutover evidence;
- each included workbook row has one active workbook-backed billing profile and
  canonical invoice, four installments, explainable gross/net components and
  adjustments, and exact payment/component/installment allocations;
- prior effective invoices and payments remain as voided/superseded rows with
  immutable, hash-checked provenance (including their components, adjustments,
  plans, installments, and allocation rows), while no unaccounted effective
  legacy finance row remains;
- every reviewed in-flight proof submission, payment link, PI-SPI request, and
  pending payment was cancelled, and no refund-pending payment remains;
- Dining and Housing agree with the annual billing profile;
- archived Students lost the student role, had their session version bumped,
  and are suspended only when no other institutional role remains;
- every reconstruction payment, batch import, and Applicant activation has
  exact audit evidence; activated students then use the mainline Student ID +
  date-of-birth self-service activation flow; and
- the plan and manifest digests each identify one batch, so an exact replay has
  no second mutation target. The runner's replay integration test must also
  assert that a second confirmation creates zero rows and zero AuditLog records.

## Required runner audit contract

The runner must write exactly one `WorkbookCutoverBatch / imported` AuditLog.
Its `data` object (or a nested `postAuditEvidence` object) must contain:

```text
activations
activationApplicantIds[]
academicFingerprints[]
originalProductionStudentIds[]
originalApplicantIds[]
supersededInvoiceIds[]
supersededPaymentIds[]
cancelledPaymentSubmissionIds[]
cancelledPaymentLinkIds[]
cancelledPiSpiRequestIds[]
cancelledPendingPaymentIds[]
archivedCapabilityCancellations[]
reviewerAttestationIds[]
```

The same batch AuditLog must retain the workbook, trusted-extraction, roster
snapshot, identity-manifest, confirmation-plan, live-snapshot, and billing
catalog hashes, the source as-of date, and the deterministic planner controls.
The auditor compares all persisted anchors and every included, excluded, held,
archive, exception, Applicant, XOF, and account-credit control.

Each academic row contains `studentId`, `personId`, and the eight fields returned
by `captureWorkbookCutoverAcademicFingerprint`. The confirming runner must call
that shared helper before mutation and the auditor calls it again afterward.

Each reconstruction payment has one `Payment / workbook-cutover-reconstructed`
AuditLog with `batchId`, `sourceRecordId`, and `sourceClaimSha256` in `data`.
Each cutover archive uses the existing
`Student / student-archived-access-revoked` action and adds `batchId`,
`sourceRecordId`, `personId`, and `previousSessionVersion` to `data`.

Each `new_invoice` financial-provenance event stores the complete planner
reconstruction spec at `snapshotJson.reconstruction` (the root object is also
accepted). The auditor compares its source key, billed/paid/credit controls,
recognition semantics, four installment dates and due/paid cells, and component
gross/net snapshots to the resulting ledger rows.

The canonical reconstruction payment accounting values are:

```text
method       legacy_unknown
provider     workbook_cutover
source       paid_to_date_workbook
settledAt    null
recognizedOn 2026-08-29
```

The audit performs no writes. Retain the encrypted pre-cutover snapshot and keep
Finance in maintenance until this audit and the portal checks both pass and
Finance, Registrar, and Admissions sign off.
