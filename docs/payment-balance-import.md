# Paid-to-date payment balance import

This operator-only CLI reconciles an authoritative workbook `Amount Paid`
column to the canonical payment ledger. It posts only a positive delta between
the reviewed target and the current invoice cash ledger. It never deletes cash,
guesses an identity, invents a settlement date/reference, changes billing, or
creates account credit.

The payment is recorded as accounting-only `legacy_unknown`, with
`settledAt = null`, exact installment and component allocations, admission-gate
sync, and durable source-row provenance. Every source row is either imported,
already reconciled, previously imported, or explicitly held.

The reviewed manifest separately records `sourceAsOfDate` as a `YYYY-MM-DD`
calendar date. Date-based collection and operating-budget reports recognize
only the imported delta on that source-as-of date, clearly labeled as a
paid-to-date balance reconciliation. It is not copied into `Payment.settledAt`,
and reconciliation events are excluded from settlement-day and run-rate
calculations so an aggregate historical balance cannot fabricate collection
velocity.

The first pass that either posts a delta or proves a row already reconciled
reserves that physical source-row claim. A later exhaustive manifest may resolve
held rows and tolerates newer cash on previously resolved invoices, but it cannot
remap a resolved row or post its workbook cash a second time.

## Required artifacts

- Original `.xlsx` workbook, mode `0600`.
- Trusted JSON extraction, mode `0600`.
- Reviewed exhaustive manifest, mode `0600`.
- Reviewed manifest `sourceAsOfDate` matching the date through which the
  workbook balance is authoritative.
- SHA-256 digests for all three artifacts.
- An active DAUST `bursar` or `admin` actor.

The CLI independently re-hashes the workbook and extraction, validates the
manifest against every extracted physical row, and refuses group/world-readable
inputs.

## Dry run

Build `@mydaust/shared`, `@mydaust/db`, and `@mydaust/api`, then run:

```bash
CONFIRM=0 \
PAYMENT_BALANCE_IMPORT_WORKBOOK_PATH=/private/source.xlsx \
PAYMENT_BALANCE_IMPORT_EXTRACTION_PATH=/private/trusted-extraction.json \
PAYMENT_BALANCE_IMPORT_MANIFEST_PATH=/private/reviewed-manifest.json \
PAYMENT_BALANCE_IMPORT_ACTOR_EMAIL=operator@example.edu \
pnpm --filter @mydaust/api run import:payment-balances
```

Review the exact counts, amount controls, hold codes, and `planSha256`. A dry run
performs no database writes. It also works before the additive provenance
migration is deployed.

## Snapshot and confirmation

Immediately before the confirmed run, create and verify an encrypted manual RDS
snapshot:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier daust-prod-pg \
  --db-snapshot-identifier daust-prod-pre-billing-import-YYYYMMDDTHHMMSSZ
aws rds wait db-snapshot-available \
  --db-snapshot-identifier daust-prod-pre-billing-import-YYYYMMDDTHHMMSSZ
```

Apply the additive migration, then confirm only the exact reviewed live-state
digest:

```bash
CONFIRM=1 \
PAYMENT_BALANCE_IMPORT_PLAN_SHA256=<exact-dry-run-plan-sha256> \
PAYMENT_BALANCE_IMPORT_WORKBOOK_PATH=/private/source.xlsx \
PAYMENT_BALANCE_IMPORT_EXTRACTION_PATH=/private/trusted-extraction.json \
PAYMENT_BALANCE_IMPORT_MANIFEST_PATH=/private/reviewed-manifest.json \
PAYMENT_BALANCE_IMPORT_ACTOR_EMAIL=operator@example.edu \
pnpm --filter @mydaust/api run import:payment-balances
```

The CLI replans inside one `SERIALIZABLE` transaction. Any invoice revision,
cash, refund, proof submission, PI-SPI request, identity, installment, component,
or prior-import drift changes the digest and blocks the write. Serialization and
unique-key races retry at most three times. The entire batch commits or rolls
back atomically.

## Post-audit

Verify independently that:

- batch row and XOF control equations reconcile;
- each imported Payment equals its installment allocation sum and component
  allocation sum;
- invoice, installment, and component paid totals reconcile;
- every imported source claim and provider reference is unique;
- held rows have no Payment;
- admission-gate activation, when applicable, is audited;
- an exact CLI replay reports the existing batch and creates zero Payments,
  rows, or audit events.

Retain the snapshot until Finance signs off on the post-audit and exact replay.
Restoring a whole database snapshot also discards unrelated writes made after
the snapshot, so it is an outage procedure rather than the normal response to a
failed import; failed imports roll back automatically.
