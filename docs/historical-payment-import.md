# Historical payment workbook import

Historical cash is imported through a reviewed JSON manifest plus a trusted extraction of
the workbook's physical payment cells. The workbook, extraction, and manifest contain
private financial/student data and must stay under the gitignored `private-imports/`
directory (or another access-controlled location with mode `0600`); never commit them.

The command is dry-run-only unless `CONFIRM=1` is explicitly supplied:

```bash
PAYMENT_IMPORT_MANIFEST_PATH="/absolute/path/reviewed-payments.json" \
PAYMENT_IMPORT_EXTRACTION_PATH="/absolute/path/trusted-extraction.json" \
PAYMENT_IMPORT_WORKBOOK_PATH="/absolute/path/source.xlsx" \
PAYMENT_IMPORT_ACTOR_EMAIL="administrator@example.edu" \
pnpm --filter @mydaust/api import:historical-payments
```

Confirmation is impossible unless the workbook SHA-256, canonical trusted-extraction
SHA-256, and canonical reviewed-manifest SHA-256 all agree. The extraction must account for
every physical source group exactly once; the manifest must include or explicitly exclude
each of those groups.

The reviewed manifest must:

- contain the exact workbook file name and SHA-256;
- reconcile every source amount group and the workbook control total;
- map every included payment to one explicit SIS student number;
- retain the workbook date and separately document any corrected settlement date;
- retain the raw method and map it to a canonical payment method;
- explicitly split merged amounts and resolve duplicate-looking rows;
- explicitly decide every possible match against an existing ledger payment; and
- explicitly approve the invoice id, invoice revision, and exact later-payment ids before
  applying older cash against an invoice that already contains later settlements; and
- assert that all included rows are settled XOF cash and that notifications are suppressed.

The dry run fails closed for unresolved/ambiguous students, archived students, implausible
dates, stale duplicate decisions, missing/currently-inconsistent invoices, payment amounts
that would create an unreviewed account credit, and any installment/component mismatch.
Duplicate detection covers success, refund-pending, and refunded ledger rows, ignores method
differences, and compares external references plus a bounded date window. A blocked dry run
exits with status `2`; it never reports success with unresolved rows. It prints method/month
control totals without writing. A confirmation re-runs the same plan inside one serializable
transaction, creates frozen installment and component allocations, uses the original
settlement date, and records minimized batch and per-payment audit events. It does not email
old receipts; normal authenticated receipt downloads remain available afterward.

Before a production confirmation, require a fresh encrypted database snapshot and save the
clean dry-run output with the reviewed manifest and extraction digests. After confirmation,
rerun the exact manifest to verify all three digests are a no-op and run the normal
installment/account reconciliation. Reusing the workbook with any changed manifest is a hard
failure, not a no-op.
