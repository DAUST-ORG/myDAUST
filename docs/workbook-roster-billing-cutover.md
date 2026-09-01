# August 29 workbook roster and billing cutover

This runbook governs the one-time replacement of the effective Student roster
and finance baseline with the reviewed August 29, 2026 workbook. It is a
CLI-only operation. It preserves academic history and old financial rows, but
supersedes the old financial rows so only the workbook-backed annual invoice and
paid-to-date reconstruction remain effective.

The source workbook is authoritative for this cutover only. After the cutover,
normal approved Admissions and billing-profile changes become authoritative.

## Non-negotiable gates

Do not confirm the cutover unless all of the following are true:

- all 403 workbook rows have a signed `link_existing`, `create_new`, or
  `reviewed_duplicate` disposition;
- all production Students in the refreshed snapshot have a signed
  `link_workbook`, `keep_exception`, or `archive` disposition;
- every current Applicant is present exactly once with `preserve`;
- every reviewer is an active `admin`, `bursar`, `registrar`, or `admissions`
  Person in the live database;
- every distinct reviewer named anywhere in the manifest has authenticated as
  that active Person and attested the exact canonical manifest SHA-256;
- the dry run has zero blockers and its source/count/XOF controls match the
  signed review;
- no included Student has a pending refund;
- Finance mutations are frozen, and a new encrypted RDS snapshot is verified
  available; and
- Finance, Registrar, and Admissions approve the exact clean plan digest.

A similar name is never identity proof. A production-only Student is never
hard-deleted. Archive preserves the Student, Person, transcript, grades,
enrollments, guardians, documents, and medical records while revoking Student
access.

## Product behavior after deployment

`AnnualBillingProfile` records the academic year, fee schedule, canonical
invoice, workbook provenance, selected services, awards, adjustments, and gross
and net totals. The invoice remains the monetary authority.

The initial approved catalog provides:

- housing: none, double 680,000, individual 1,360,000, double with AC 800,000,
  and individual with AC 1,600,000 XOF;
- cafeteria: none or full 630,000 XOF (half remains unavailable until an active,
  approved positive price exists);
- annual insurance: none or 10,000 XOF; and
- refundable housing caution: none or 10% of the selected housing option.

Awards and manual pricing corrections are explicit invoice adjustments. Catalog
changes and Student profile changes use the existing approval workflow. Student
and guardian views are read-only. Approved profiles synchronize Dining and the
billed option on Housing assignments; changing a room never changes price by
itself. Future Admissions acceptance requires explicit service choices and
applies the supported BAC merit award before creating the enrollment invoice and
payment link.

## Private artifacts

Keep every artifact outside git under an access-controlled directory. Inputs
and outputs must be regular bounded files with mode `0600` or stricter:

1. the original `.xlsx` workbook;
2. its trusted JSON extraction;
3. a fresh exhaustive production Student and current-Applicant snapshot;
4. the review workbook generated from those sources;
5. the completed signed review workbook;
6. the generated exhaustive reviewed manifest;
7. the dry-run receipt and exact plan SHA-256; and
8. any new-Student credential export.

Never put names, emails, passwords, workbook rows, or AWS credentials in CI
logs, tickets, pull requests, or chat. The credential export is an SIS-login
delivery file only; it does not create Google Workspace mailboxes.

## Export the frozen production review snapshot

Build the API, then run the read-only exporter against the intended database:

```bash
DATABASE_URL='postgresql://...' \
CUTOVER_ACADEMIC_YEAR_LABEL='2026–2027' \
CUTOVER_EXPECTED_PRODUCTION_STUDENTS=418 \
CUTOVER_EXPECTED_ACTIVE_STUDENTS=401 \
CUTOVER_EXPECTED_PENDING_PAYMENT_STUDENTS=17 \
CUTOVER_EXPECTED_ARCHIVED_STUDENTS=0 \
CUTOVER_EXPECTED_CURRENT_APPLICANTS=46 \
CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH=/private/production-snapshot.json \
pnpm --filter @mydaust/api run export:workbook-cutover-production-snapshot
```

`CUTOVER_PRODUCTION_SNAPSHOT_OUTPUT_PATH` must be absolute and absent. The
exporter performs all production reads in one PostgreSQL `REPEATABLE READ`
transaction after issuing `SET TRANSACTION READ ONLY`. It captures every
Student, their Person/access fields and academic-history fingerprints, plus
every current Applicant; it never writes to the database. First obtain a
counts-only live inventory, then pass all five expected controls shown above.
The exporter fails closed if any count drifts before the coherent snapshot is
captured. The resulting snapshot digest, not an older hard-coded roster count,
is the immutable review anchor. It exclusive-creates a bounded JSON artifact
at mode `0600`. Standard output contains counts and SHA-256 digests only, never
identities. Do not edit the snapshot by hand.

## Convert the signed review workbook into a manifest

Build dependencies first:

```bash
pnpm --filter @mydaust/shared run build
DATABASE_URL='postgresql://x:x@localhost:5432/x' pnpm --filter @mydaust/db run build
pnpm --filter @mydaust/api run build
```

Then run the offline manifest builder:

```bash
REVIEW_WORKBOOK_PATH=/private/completed-review.xlsx \
CUTOVER_EXTRACTION_PATH=/private/trusted-extraction.json \
CUTOVER_PRODUCTION_SNAPSHOT_PATH=/private/production-snapshot.json \
CUTOVER_MANIFEST_OUTPUT_PATH=/private/reviewed-cutover-manifest.json \
pnpm --filter @mydaust/api run build:workbook-cutover-manifest
```

The builder performs no database or network access. It validates the frozen
sheet names, exact headers, literal source cells, source keys, identities, reviewer
fields, financial controls, duplicate claims, and source conservation. It
derives deterministic review-signature hashes, then exclusive-creates the
manifest at mode `0600`. Any incomplete or contradictory row blocks output.
The output path must not already exist; an exact rebuild to a different private
path must produce the same canonical manifest digest.
The `Completion` columns are display formulas only; the builder recomputes every
gate and rejects formulas in the signed Decision, Evidence/Reason, Reviewer, and
Review Date cells. All snapshot-declared Applicant preservation rows require
the same signed reason/reviewer/date fields as the roster decisions.

The workbook supplies four installment due amounts, not calendar dates. The
final manifest binds those amounts to the already-approved 2026–2027 schedule
dates: `2026-08-25`, `2026-11-05`, `2027-01-05`, and `2027-03-05`. It does not
create or supersede a fee-schedule revision. Each row's four due amounts remain
the exact workbook values. Comparison row 306 is deliberately retained
as an operational warning: the workbook selects a 68,000 XOF refundable caution
on the double-housing price basis while Housing itself is false. The importer
does not silently add a housing charge.

If live Students or current Applicants changed after the review snapshot,
refresh the snapshot and review workbook. Do not edit the JSON source arrays by
hand.

## Authenticated reviewer attestation

Typed reviewer emails and deterministic row signatures in the offline review
workbook establish what was reviewed; they do not prove who typed them. Before
confirmation, every distinct email named in any workbook, production-Student,
Applicant, or financial-adjustment decision must be adopted by its actual
myDAUST Person.

After the manifest builder prints the canonical `manifestSha256`, each named
reviewer signs into myDAUST with their own account and opens the attestation
screen for their role:

- Finance: `/finance/workbook-cutover-attestation`
- Registrar: `/admin/workbook-cutover-attestation`
- Admissions: `/admissions/workbook-cutover-attestation`
- Administrator: `/director/workbook-cutover-attestation`

The reviewer pastes that exact 64-character digest, checks its current status,
reads the server-provided statement, explicitly affirms it, and records the
attestation. The request contains no reviewer email: the server re-reads the
signed-in `Person`, requires `status=active`, snapshots the authorized role and
normalized institutional login email, and writes immutable evidence plus an
AuditLog row in one transaction. Repeating the same valid attestation is an
idempotent no-op.

Attestations are digest-specific. Any change to a decision, source, review
workbook, snapshot, extraction, or manifest produces a new canonical digest and
requires every named reviewer to attest again. Revocation is terminal for the
old digest; it cannot be undone or re-attested. Generate a corrected manifest
instead. Suspending a reviewer, removing every authorized role, changing the
normalized login identity, revoking evidence, or superseding the attestation
statement all fail closed.

The dry run reports only aggregate blocker codes such as
`reviewer_attestation_missing` and `reviewer_attestation_revoked`; it does not
print reviewer names or emails. Its `planSha256` binds the exact attestation IDs,
identity hashes, statement hashes, role snapshots, timestamps, and revocation
state. Attesting or revoking after a dry run therefore invalidates that plan and
requires a new dry run.

## Dry run

Run from the deployed revision that contains the cutover migrations and CLI:

```bash
CONFIRM=0 \
WORKBOOK_CUTOVER_WORKBOOK_PATH=/private/source.xlsx \
WORKBOOK_CUTOVER_EXTRACTION_PATH=/private/trusted-extraction.json \
WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_PATH=/private/production-snapshot.json \
WORKBOOK_CUTOVER_MANIFEST_PATH=/private/reviewed-cutover-manifest.json \
WORKBOOK_CUTOVER_ACTOR_EMAIL=authorized-operator@example.edu \
pnpm --filter @mydaust/api run cutover:workbook
```

The dry run is read-only and captures, in one consistent snapshot:

- every Student and current Applicant source record;
- academic fingerprints for transcript entries, enrollments, immutable grade
  snapshots, credits, and GPA;
- all-year invoice, credit, installment, component, payment, refund, proof,
  payment-link, and PI-SPI state;
- the approved fee schedule, annual term, service/award catalog, and locked
  Student-number sequence; and
- Student-number and login-email collision inventories.

Review only the redacted counts, blocker/warning codes, XOF controls, source
digests, and `planSha256`. Any state change covered by the plan produces a
different confirmation digest.

## Maintenance, snapshot, and confirmation

Freeze Finance writes before the final dry run. Create a new encrypted manual
snapshot and verify its encryption, status, and tags:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier daust-prod-pg \
  --db-snapshot-identifier daust-prod-pre-workbook-cutover-YYYYMMDDTHHMMSSZ

aws rds wait db-snapshot-available \
  --db-snapshot-identifier daust-prod-pre-workbook-cutover-YYYYMMDDTHHMMSSZ
```

Confirm only the exact latest clean digest:

```bash
CONFIRM=1 \
FINANCE_MAINTENANCE_ACK=1 \
WORKBOOK_CUTOVER_PLAN_SHA256=<exact-clean-plan-sha256> \
WORKBOOK_CUTOVER_WORKBOOK_PATH=/private/source.xlsx \
WORKBOOK_CUTOVER_EXTRACTION_PATH=/private/trusted-extraction.json \
WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_PATH=/private/production-snapshot.json \
WORKBOOK_CUTOVER_MANIFEST_PATH=/private/reviewed-cutover-manifest.json \
WORKBOOK_CUTOVER_CREDENTIAL_EXPORT_PATH=/private/new-student-credentials.json \
WORKBOOK_CUTOVER_ACTOR_EMAIL=authorized-operator@example.edu \
pnpm --filter @mydaust/api run cutover:workbook
```

Confirmation replans inside one `SERIALIZABLE` transaction, retries only
serialization/unique-key races up to three times, and requires the exact plan
digest. It cancels unsettled payment attempts, voids effective legacy invoices,
cancels effective legacy payments, retains and hash-snapshots every superseded
row, creates one canonical workbook invoice/profile per included Student,
reconstructs column-Q cash with no invented settlement date and recognition date
`2026-08-29`, synchronizes the enrollment gate and operations, and archives only
explicitly reviewed production exceptions.

New Student numbers and `@mydaust.com` SIS login identities are preallocated in
the dry-run plan. The runner advances the locked sequence atomically, requires a
collision-free identity, creates a random one-time password with mandatory
change, and writes the credential export with exclusive-create mode `0600`.

The CLI then runs the independent post-audit and an exact replay. The replay
must return the original batch with zero mutations, zero new AuditLog rows, and
zero new credentials.

## Acceptance and rollback boundary

Keep Finance maintenance active until all checks in
`docs/workbook-cutover-post-audit.md` pass and the following portal checks are
complete:

- Registrar/Admin, Finance, Student, and Guardian see the same annual profile,
  services, awards, bill, paid amount, credit, and outstanding amount;
- Dining and Housing show no billing-profile mismatch warnings;
- archived accounts cannot authenticate and active academic records are
  unchanged; and
- Admissions can accept a test Applicant only after explicit billing-profile
  selection, with the expected BAC award and payment gate.

A failed transaction rolls back atomically. After a successful confirmation,
do not attempt ad-hoc reverse SQL: preserve maintenance, capture evidence, and
decide with Finance whether to correct forward or restore the full snapshot.
Restoring the snapshot is an outage operation and discards unrelated writes
made after it. Retain the snapshot until Finance, Registrar, and Admissions all
sign off.
