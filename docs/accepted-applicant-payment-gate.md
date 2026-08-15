# Accepted-applicant payment gate

Accepted applicants keep their admissions decision while enrollment remains
conditional on verified cash for the first approved installment.

## Lifecycle

1. Admissions accepts an offered applicant and binds an academic year.
2. The transaction creates a permanent `S{year}{sequence}{initials}` Student ID,
   a `pending_payment` Student, the approved fee package, the enrollment invoice,
   a first-installment payment link, and a private application-status capability.
3. The applicant can use the private link or `payment.daust.net` with Student ID
   and date of birth. Proof submission alone does not activate enrollment.
4. Canonical settlement accumulates successful, refund-net Payment cash initiated
   against the designated enrollment invoice. Scholarships and account credits do
   not count, while newly landed cash still counts if allocation moves part of it
   to an overpayment memo. At the threshold, the same transaction activates the
   Student, grants the role, records the payment, and closes unused links. Evidence
   or provider requests already in flight remain reviewable and payable.
5. Account setup is delivered after settlement commits. A later refund creates a
   Finance/Registrar review hold and never silently removes academic access.

Only an administrator can publish the acceptance or cancel a payment-pending
onboarding. Cancellation is allowed only before verified cash and while no proof,
PI-SPI request, or refund is in flight. It archives the provisional Student and
voids the invoice without deleting or recycling the permanent Student ID.

An administrator may explicitly cancel a payment-pending acceptance only while
verified cash is zero and no proof, PI-SPI request, or refund is in flight. The
operation archives (rather than deletes) the provisional Student, preserves its
permanent ID, voids the enrollment invoice while retaining its plan history,
revokes public capabilities, and records the reason in the audit log. Repeating
the cancellation is an idempotent detail read. A late provider-confirmed payment
is still booked as cash/credit and creates a Finance reconciliation hold.

The 30,000 XOF application fee is separate and never contributes to this gate.
The required enrollment amount is derived from the approved individual invoice;
it is not a hard-coded fee constant.

## Existing accepted applicants

Deployment does not provision, link, bill, or activate any historical applicant.
Generate a private read-only review file with:

```bash
ACCEPTED_APPLICANT_RECONCILIATION_OUTPUT=/absolute/private/review.json \
  pnpm --filter @mydaust/api reconcile:accepted-applicants
```

The command has no confirmation/write mode. It proposes only exact email and
date-of-birth candidates, reports program conflicts, and leaves incomplete,
unmatched, or ambiguous identities blocked for staff review. The output file is
created with mode `0600` and is never overwritten.

## Operational checks

- Pending-payment students remain visible to Finance and the public bill lookup,
  but not to registrar rosters, academic directories, communications, dining, or
  login provisioning.
- Manual and fee-plan link rotation fails closed while submitted proof or a live
  PI-SPI request exists. Drafts without evidence may be retired safely.
- A settlement or refund may rotate an obsolete link without rolling back cash.
  Submitted proof stays in Finance review, live provider requests stay payable,
  and later confirmed cash is booked with an audit and reconciliation hold.
- A cancelled zero-cash onboarding keeps its Student ID and audit history, revokes
  the private status capability, and never deletes financial provenance.
- Pending public bill responses expose only first-installment gate progress, not
  the annual charge matrix or account summary.
- A submitted or rejected proof never counts as cash; only a successful canonical
  Payment does.
- Acceptance, settlement activation, refunds, link rotation, and invitation
  delivery are separately audited.
