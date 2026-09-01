# Legacy Cohort Import

This importer is reserved for reviewed migrations from the retired admissions
platform. It creates the normal payment-gated Applicant, Student, invoice, and
guardian records, but preserves each reviewed `F...` identifier as the
permanent `Student.studentNo`. It never reads or advances
`StudentNumberSequence`, so normal future acceptances continue using `S...`
identifiers.

The command is dry-run-only unless `CONFIRM=1` and the exact clean plan digest
from the latest dry run are both supplied. It must not be used until the source
workbook, trusted extraction, and reviewed manifest agree byte-for-byte.

## Inputs and decisions

Keep all inputs under the gitignored `private-imports/` directory with
owner-only permissions (`chmod 600`); the command rejects more permissive
files:

1. The preserved source workbook. Its filename and SHA-256 must match the
   manifest.
2. A trusted extraction containing only immutable source coordinates, unique
   row fingerprints, paid/unpaid labels, source F-IDs, and source payment
   amounts. Its canonical digest must match the manifest.
3. A reviewed manifest that assigns every physical source row exactly once.
4. When the manifest contains `excludedSources`, the exact review workbook and
   immutable hold-notes file named and hashed by `exclusionReview`. Both paths
   are mandatory at runtime and both files are SHA-256 verified before any
   database access.

The reviewed manifest must resolve all of the following before confirmation:

- one explicit, unique `F<academic-year><sequence>` ID per person group;
- exact grouping of repeated rows and direct duplicate-to-canonical links;
- an academic year, final student email, and at least one guardian (a reviewed
  legacy record may deliberately leave its program unassigned);
- guardian creation or an exact reviewed existing-parent link;
- a disposition for every paid and unpaid source row;
- payment amount, settlement date, method, and reference evidence.

Unknown legacy payment evidence must be represented truthfully. A reviewed
unknown method uses the accounting-only `legacy_unknown` value. An unknown date
uses a documented administrative estimate and records
`dateAccuracy: "administrative_estimate"`; an unknown reference opts into the
deterministic import reference. The manifest must name every unknown field and
include a substantial review reason. Payer-facing endpoints never offer
`legacy_unknown`.

Known external references must be unique across the batch. Two unreferenced
payments for the same student with the same date, method, and amount are blocked
unless they are grouped into one payment, marked as a duplicate source row, or
each carries a reviewed `confirmed_distinct` decision.

## Pre-deployment identity audit

Run the case-insensitive Student ID collision audit before applying the schema.
The migration deliberately fails instead of rewriting an existing identifier:

```sql
SELECT lower("studentNo") AS canonical_id, count(*)
FROM "Student"
GROUP BY lower("studentNo")
HAVING count(*) > 1;
```

Every application writer now stores new Student IDs in trimmed uppercase form;
the database also enforces uniqueness on `lower("studentNo")`.

## Dry run

Build the API first, then run without `CONFIRM` (or with `CONFIRM=0`):

```bash
pnpm --filter @mydaust/api build

LEGACY_COHORT_IMPORT_MANIFEST_PATH=/absolute/private/path/reviewed-manifest.json \
LEGACY_COHORT_IMPORT_EXTRACTION_PATH=/absolute/private/path/trusted-extraction.json \
LEGACY_COHORT_IMPORT_WORKBOOK_PATH=/absolute/private/path/source.xlsx \
LEGACY_COHORT_IMPORT_REVIEW_WORKBOOK_PATH=/absolute/private/path/review-v3.xlsx \
LEGACY_COHORT_IMPORT_HOLD_NOTES_PATH=/absolute/private/path/hold-notes.json \
LEGACY_COHORT_IMPORT_ACTOR_EMAIL=reviewing-admin@daust.net \
pnpm --filter @mydaust/api import:legacy-cohort
```

A clean dry run prints aggregate counts, warnings, and a `planSha256`. It does
not create any database record. Any blocker prevents confirmation. Review the
counts and digest without copying source PII into tickets or chat.

## Confirmation

Confirmation is one serializable transaction. Re-run the same command with the
reviewed plan digest:

```bash
CONFIRM=1 \
LEGACY_COHORT_IMPORT_PLAN_SHA256=<exact-clean-plan-sha256> \
LEGACY_COHORT_IMPORT_MANIFEST_PATH=/absolute/private/path/reviewed-manifest.json \
LEGACY_COHORT_IMPORT_EXTRACTION_PATH=/absolute/private/path/trusted-extraction.json \
LEGACY_COHORT_IMPORT_WORKBOOK_PATH=/absolute/private/path/source.xlsx \
LEGACY_COHORT_IMPORT_REVIEW_WORKBOOK_PATH=/absolute/private/path/review-v3.xlsx \
LEGACY_COHORT_IMPORT_HOLD_NOTES_PATH=/absolute/private/path/hold-notes.json \
LEGACY_COHORT_IMPORT_ACTOR_EMAIL=reviewing-admin@daust.net \
pnpm --filter @mydaust/api import:legacy-cohort
```

The transaction re-runs all live collision and accounting checks. Any changed
fee schedule, program, email, F-ID, workbook ownership, or deterministic payment
reference invalidates the review and rolls back the whole cohort. Exact reruns
of a completed workbook/manifest are no-ops.

## Accounting and notifications

Each historical cash entry is appended to the canonical Payment ledger,
allocated to installments and fee components, and passed through the same
enrollment gate as live settlements. A student activates only after net verified
cash reaches the dynamic first installment. By default, unpaid and partially
paid students remain `pending_payment`.

An exceptional retired-platform migration can instead declare the strict
reviewed policy `onboardingPolicy.disposition:
"activate_all_legacy_students"`. It requires `reviewed: true` and a substantial
reason. The importer still posts every historical cash entry first through the
canonical settlement path. It then activates only the included records still
pending, leaves `activatedByPaymentId` empty for those override activations,
cancels their onboarding links, grants the Student role, and writes a dedicated
audit event. Payment-gate activations retain their actual activating Payment.
Normal admissions and manifests using `respect_payment_gate` are unchanged.

The reviewed manifest must use `notificationPolicy: "suppress_all"`. The
importer sends no acceptance email, receipt, or account-setup invitation. When
historical cash activates a student, it creates no password, invite, setup
secret, or email delivery. The audit records
`legacy-cohort-activation-card-required`; the student must later use the
same public `/activate-student` page with an individually issued activation card
as every other student. Exact reruns of a completed batch remain no-ops and
never send email.

Durable provenance records the batch, manifest and extraction digests, permanent
F-ID, person grouping digest, Applicant/Student/invoice links, each source
coordinate and fingerprint, duplicate disposition, and any linked Payment.
The workbook, extraction, and reviewed manifest remain outside source control
and must be retained together in the restricted records archive under their
recorded hashes.
