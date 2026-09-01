# Student activation cards

This operator-only CLI issues one random, one-time account activation card to
every currently eligible passwordless student. It is dry-run by default and is
not an HTTP endpoint.

Each code contains exactly 80 random bits, expires 24 hours after issuance, and
is stored in PostgreSQL only as a domain-separated HMAC-SHA256. The recoverable
codes exist only in the generated owner-only PDF. The PDF prints eight cut cards
per A4 page and includes the student's name, Student ID, activation URL, code,
expiry, and instructions. It deliberately omits date of birth, login email, and
password.

## Guardrails

- Take the normal database snapshot before confirmation.
- Run from a private workstation as one active `admin` or `registrar` account.
- Put the output in a local, owner-only directory; do not use a synced folder.
- Never paste a code, PDF contents, activation key, or database URL into a log,
  ticket, chat, or audit note.
- Review aggregate blocker counts and the exact plan SHA-256 before confirmation.
- Do not distribute an expired or revoked batch.

Build the API before using its compiled CLI:

```bash
pnpm --filter @mydaust/shared run build
DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm --filter @mydaust/db run build
pnpm --filter @mydaust/api build
```

## 1. Dry run

`DATABASE_URL` is required but is not shown below. The dry run writes neither
the database nor a file and does not need the HMAC key.

```bash
STUDENT_ACTIVATION_CARD_ACTOR_EMAIL="authorized-operator@daust.net" \
CONFIRM=0 \
pnpm --filter @mydaust/api student-activation-cards
```

A clean result reports only aggregate counts, the eligibility snapshot SHA-256,
and a plan SHA-256. Any missing birth date, invalid/non-unique login identity,
live setup invite, or live activation card blocks the batch.

## 2. Confirm the reviewed plan

Use a new absolute `.pdf` path. The CLI creates it exclusively with mode `0600`
and never overwrites a file.

```bash
STUDENT_ACTIVATION_CARD_ACTOR_EMAIL="authorized-operator@daust.net" \
STUDENT_ACTIVATION_CARD_PLAN_SHA256="<exact-clean-dry-run-plan-sha256>" \
STUDENT_ACTIVATION_CARD_OUTPUT_PATH="/absolute/private/path/student-activation-cards.pdf" \
STUDENT_ACTIVATION_CODE_KEY_V1="<32-byte-base64url-secret>" \
CONFIRM=1 \
pnpm --filter @mydaust/api student-activation-cards
```

Confirmation serializes all generation runs, locks the reviewed Student and
Person rows in stable order, re-plans inside a serializable transaction, and
commits only if the exact digest still matches. It creates a hidden owner-only
`<output>.pending` file, fsyncs it, commits the matching HMAC rows, then promotes
that file atomically to the requested PDF path. A concurrent losing run destroys
its uncommitted PDF.

If promotion fails after commit, do not generate another batch. Re-run the same
confirmation with the same plan and output path; the CLI verifies the committed
output SHA-256 and promotes the deterministic `.pending` file. If neither the
matching PDF nor pending file remains, revoke the committed batch before issuing
replacement cards.

## 3. Revoke a batch

Revocation is also dry-run/review/confirm. Allowed non-PII reason codes are:
`lost_artifact`, `misprint`, `operator_error`, `suspected_disclosure`,
`superseded`, and `security_response`.

```bash
STUDENT_ACTIVATION_CARD_OPERATION="revoke" \
STUDENT_ACTIVATION_CARD_ACTOR_EMAIL="authorized-operator@daust.net" \
STUDENT_ACTIVATION_CARD_REVOKE_BATCH_ID="<batch-uuid>" \
STUDENT_ACTIVATION_CARD_REVOKE_REASON="suspected_disclosure" \
CONFIRM=0 \
pnpm --filter @mydaust/api student-activation-cards
```

After review, repeat with `CONFIRM=1` and
`STUDENT_ACTIVATION_CARD_PLAN_SHA256=<exact-revocation-plan-sha256>`.

The revocation transaction locks the batch before its cards, attributes the
action to the named operator, revokes every unused card, expires every linked
unused setup invite, invalidates every linked unconsumed activation request, and
writes only aggregate counts/digests to the audit log. A card that was claimed
but whose password was not set is still burned.

After revocation, securely destroy every printed card and every PDF/pending copy.
