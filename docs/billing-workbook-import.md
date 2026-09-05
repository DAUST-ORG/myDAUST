# Billing workbook import — runbook

Applies the finance office's per-student billing workbook to production. Written for
the August 2026 workbook (403 rows, 1,514,469,978 XOF) but not specific to it.

Everything here is operator-run and dry-run by default, per `AGENTS.md` §0. An agent
must not run any of these with `CONFIRM=1` on its own initiative.

---

## What it does

Production bills every student the same flat annual package. The workbook prices
them individually: four housing tiers, an insurance line, a refundable deposit, and
per-student awards.

The import expresses that as **catalog selection plus a credit**, never as bent
component amounts:

1. One fee-schedule revision adds the charges the workbook needs (three housing
   tiers, `student_insurance`, four `housing_deposit*` keys) and the scholarship
   catalog. Every added key is `defaultSelected: false`, so approving it moves
   nobody's total.
2. Per student, the components they actually carry are selected. Amounts always come
   from the catalog, so no invoice acquires `paymentPlanOverride` and
   restore-to-standard keeps working.
3. Whatever the workbook bills below the selected catalog total is written as a
   `credit` invoice. That is what carries a scholarship onto the account.

A student's balance ends at the workbook figure; their statement itemises the real
charges rather than showing a flat package and a mystery discount.

---

## Order, and why it is not negotiable

**Payments first.** The workbook's paid column records collections the ledger may
never have seen. Re-pricing first leaves those students showing balances they have
already settled. Load them with `import:opening-balances`, then re-plan.

**Then the catalog revision, then re-plan again.** The revision relinks every live
invoice for the year and increments `Invoice.revision` on all of them, which stales
every `baseRevision` captured by an earlier dry run. A plan made before the revision
applies nothing. `billing:apply` performs the revision and the re-pricing inside one
transaction precisely so this cannot be got wrong by hand.

**Clear the bursar queue first.** The revision fans the enrollment gate over every
`payment_pending` applicant and fails closed if one has proof under review. Verify or
reject pending `PaymentSubmission` rows before running, or the whole revision aborts.

---

## Preflight

- [ ] Manual encrypted RDS snapshot of `daust-prod-pg`, taken within the last hour,
      identifier recorded. Migrations are forward-only; this is the only rollback.
- [ ] Zero `PaymentSubmission` in `awaiting_proof` or `submitted`.
- [ ] Zero `PiSpiRequest` in `initiated` or `sent`.
- [ ] The actor email resolves to a `Person` holding the `admin` role.
- [ ] Finance has signed off the per-student report from the dry run.

---

## Commands

Build first — `@mydaust/shared` and `@mydaust/db` are consumed through `dist/`.

```bash
pnpm --filter @mydaust/shared run build
pnpm --filter @mydaust/db run build
pnpm --filter @mydaust/api run build
```

Dry run. Exits 2 when anything is blocked, and writes nothing:

```bash
export DATABASE_URL='...'
export BILLING_IMPORT_MANIFEST_PATH=./billing-manifest.json
export BILLING_IMPORT_WORKBOOK_PATH='./DAUST Students & Billing.xlsx'
export BILLING_IMPORT_ACTOR_EMAIL=admin@daust.edu.sn
export BILLING_IMPORT_REASON='Apply the finance office billing workbook of 2026-08-29'
pnpm --filter @mydaust/api run billing:apply
```

Read the report. `blockersByCode` names every row that will not go through and why;
`before` is the ledger as it stands. Only when Finance has signed that off:

```bash
CONFIRM=1 pnpm --filter @mydaust/api run billing:apply
```

To apply only the rows that plan cleanly and leave the rest for a later pass, add
`BILLING_IMPORT_ONLY_ACTIONABLE=1`. Blocked students keep their current billing
untouched — nothing is half-written.

Afterwards, always:

```bash
pnpm --filter @mydaust/api run reconcile:installment-statuses
```

`Installment.status` is a cache. `deriveAccountPosition` throws if an account fails
to reconcile, and it has ~18 call sites, so a stale projection breaks finance screens
for every student rather than only the ones that moved.

---

## What the apply refuses

Inside the transaction, so a refusal writes nothing at all:

| Guard                    | Meaning                                            |
| ------------------------ | -------------------------------------------------- |
| `revision drift`         | The invoice changed after the plan was made        |
| `catalog drift`          | The schedule no longer totals what was planned     |
| `package below paid`     | The new package is under what the student has paid |
| `installment below paid` | An installment would fall below its collected cash |
| `unknown component`      | The catalog lacks a key the plan selects           |

After applying it re-reads the ledger and fails if any invoice no longer sums to its
installments.

---

## Rollback

There is no down migration. Restoring the snapshot is the only full reversal, and it
lands on a new endpoint, so `DATABASE_URL` has to be repointed (`deletion_protection`
is on).

Per student, the writes are individually reversible through the normal finance
surface: void the credit invoice, and re-select the components the student had. Every
change carries an `AuditLog` row keyed to the invoice with `billing-workbook-repriced`
or `billing-workbook-credit`, and the batch label ties one run together.
