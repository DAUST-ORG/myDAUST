# AGENTS.md

Source of truth for AI coding agents working in this repository. `CLAUDE.md` and `GEMINI.md`
point here; do not take architectural facts from them.

Everything below was verified against the code on **2026-08-18**. When code and this file
disagree, the code wins — and fix this file in the same PR.

---

## 0. Read this first

**This is a live production system holding real people's records and money.** It is not a
prototype. Merging to `main` deploys production automatically and runs migrations against a
database with ~298 real students, ~1.28 billion XOF of invoices, and 6,264 imported transcript
entries. There is no manual approval gate in the pipeline.

Three consequences:

- Never write a migration you have not reasoned about against live data.
- Never "clean up" the guards, filters, or idempotency keys described in §4 and §6. Several of
  them look like redundant ceremony and are load-bearing.
- Bulk data operations are operator-run, dry-run-by-default CLIs. Do not convert one into an
  HTTP endpoint or run one with `CONFIRM=1` on your own initiative.

### Document authority

| Document                                                                                                       | Status                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **This file**                                                                                                  | Authoritative for architecture, invariants, recipes                                                                                                                                                                              |
| `docs/production-status.md`                                                                                    | Authoritative for operations — but only through 2026-08-12                                                                                                                                                                       |
| `docs/legacy-cohort-import.md`, `docs/historical-payment-import.md`, `docs/accepted-applicant-payment-gate.md` | Authoritative runbooks                                                                                                                                                                                                           |
| `git log`                                                                                                      | Authoritative for what actually changed                                                                                                                                                                                          |
| `README.md`                                                                                                    | Partly stale — lists retired portal areas and retired seeded logins, and says `infra/` is "not started" when staging and prod are applied and live. (It is however _right_ that the live vitrine host is `daust.net` — see §14.) |
| `CLAUDE.md` (2026-07-21)                                                                                       | **Stale.** Wrong on: "nothing is deployed", the portal route-area list, the role list, "PayTech impl", and "there is no test suite yet"                                                                                          |
| `GEMINI.md` (2026-08-02)                                                                                       | **Stale.** Still says "PayTech integration"; advertises `pnpm lint`, which is a no-op                                                                                                                                            |
| `CHANGELOG.md`                                                                                                 | **Abandoned.** Last entry 2026-06-28; its `[Unreleased]` section describes a gitleaks scan and `.github/scripts/audit-routes.mjs` that do not exist                                                                              |
| `TODO.md` §0                                                                                                   | Partly stale — five of its seven "open" items are already built (broadcast composer, staff role assignment, grading-scheme writes, rule-engine requisites, curriculum editor)                                                    |
| `TEST-PLAN.md` / `TEST-RESULTS.md` / `REGISTRAR-DEEP-AUDIT.md` / `STUDENT-DESIGN-REVIEW.md`                    | Point-in-time snapshots, not current bug lists                                                                                                                                                                                   |

---

## 1. Commands

Node 20+ (CI uses Node 24), pnpm 10.23.0.

```bash
pnpm install

# Postgres on :5432
docker compose up -d

# Prisma needs DATABASE_URL exported; there is no .env in packages/db, only the repo root .env
export DATABASE_URL="postgresql://mydaust:mydaust@localhost:5432/mydaust?schema=public"
pnpm --filter @mydaust/db exec prisma migrate dev
pnpm --filter @mydaust/db run seed        # local/staging demo data; dev password daust-dev-2026

pnpm --filter @mydaust/api dev            # :4000
pnpm --filter @mydaust/portal dev         # :3000
pnpm --filter @mydaust/vitrine dev        # :3001
```

Checks — this is exactly what CI runs, in this order:

```bash
pnpm --filter @mydaust/shared run build
DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm --filter @mydaust/db run build
pnpm -r typecheck
pnpm --filter @mydaust/shared exec vitest run
pnpm --filter @mydaust/api exec vitest run
```

Single test file / single test:

```bash
pnpm --filter @mydaust/api exec vitest run src/finance/account-position.test.ts
pnpm --filter @mydaust/api exec vitest run -t "settles the oldest installment first"
```

`pnpm lint` is a no-op — every package's `lint` script is `echo 'no lint yet'`. Typecheck and
Prettier (`pnpm format`) are the only mechanical safeguards.

---

## 2. Layout

```
apps/api/        NestJS (:4000). 22 domain modules + health. Global prefix /api.
apps/portal/     Next.js (:3000). All authenticated UI, 7 role portals.
apps/vitrine/    Next.js (:3001). Public site — static export, ONE page route.
packages/shared/ Zod contracts + pure domain logic (money, account position, catalog rules).
packages/db/     Prisma schema, 80 migrations, seed + bootstrap + importer scripts.
packages/tsconfig/
infra/           OpenTofu — global/, environments/{staging,prod}/, modules/, tunnel*/
design/          SIS design prototype (source of truth for screens) + design system
docs/            Runbooks + production status
```

---

## 3. Build-order coupling (the most common way to waste an hour)

`@mydaust/shared` and `@mydaust/db` are consumed through their **built `dist/`**, and there is
no `postinstall` hook running `prisma generate`.

- Edit `packages/shared` → run `pnpm --filter @mydaust/shared run build` before api/portal see
  the new export. Otherwise you get "export does not exist", or worse, a passing test against
  stale code.
- Edit `schema.prisma` → run `pnpm --filter @mydaust/db run build` (`prisma generate && tsc`)
  before the new model/enum types exist.
- `turbo.json` declares `build`, `typecheck` **and** `test` with `dependsOn: ["^build"]`, so
  root-level `pnpm typecheck` / `pnpm test` handle this. A filtered command
  (`pnpm --filter @mydaust/api exec vitest run`) does **not**.

`apps/api` compiles with `moduleResolution: NodeNext` but ships CommonJS (no `"type": "module"`).
Every relative import must carry a `.js` extension. Adding `"type": "module"` would break
`__dirname`, the Nest CJS build, and the zod workaround in §4 simultaneously.

---

## 4. Security model

### Authorization is fail-open by default

Two global `APP_GUARD`s are registered **inside `AuthModule`**, not `AppModule`:
`JwtAuthGuard` then `RolesGuard`. `RolesGuard` reads:

```ts
if (!required || required.length === 0) return true;
```

**A route with no `@Roles(...)` is reachable by every authenticated session, students included.**
New controllers are not "admin by default" — they are open by default. This is not theoretical:
a `communications`-only account (a CMS role documented as having _no SIS data access_) can
currently read `/api/comms/contacts`, `/api/academics/sections`, `/api/academics/current-term`,
`/api/campus/library` and `/api/campus/events`, because none of them carry `@Roles`.

Only five controllers legitimately grep clean for `@Roles`: `health`, `auth`, `nav`,
`admissions` and `finance/public-billing` (the last two are `@Public` + `BillThrottleGuard`).
Any _new_ file in that set is a security bug.

`@Roles` is resolved with `reflector.getAllAndOverride([handler, class])`, so a method-level
`@Roles` **fully replaces** the class-level list rather than intersecting it. `approvals.controller.ts`
relies on this to _widen_ two routes to `registrar`.

### The session is re-checked against the database on every request

**This section previously said the opposite and was wrong.** `JwtStrategy.validate()`
(`jwt.strategy.ts:33-58`) re-reads `Person` on every authenticated request and rejects the
request unless `status === "active"` and the row's `sessionVersion` equals the token's claim.
Roles come from the row, not the cookie. So **bumping `Person.sessionVersion` revokes a session
immediately**, and deactivating a person locks them out at once — no waiting for the 7-day token
to expire. The cost is one indexed primary-key read per request.

Tokens signed before `sessionVersion` existed carry no claim and compare equal to the default of
`0`, so they survive the deploy rather than logging the whole institution out.

This is what makes the dining Scanner Station safe to run on a wall-mounted tablet under an
ordinary staff login rather than a device credential: the session is revocable, and every manual
override it writes is attributed to a real `personId`.

### Ownership checks are per-service, not shared

There is no reusable ownership guard. The only ones that exist are private methods:
`assertSectionOwner` / `assertAssignmentOwner` (academics), `assertParticipant` (comms),
`assertGuardianOf` / `assertChildInvoice` / `assertChildPayment` (guardians). Every
parent-facing read must enter through `GuardiansService` — routing around it bypasses the only
check there is.

### Zod validation → 400

There is **no global `ValidationPipe`**. Controllers take `@Body() body: unknown` and call
`Schema.parse(body)` (23 files). `ZodExceptionFilter` is a catch-all (`@Catch()`) that
**duck-types** the error:

```ts
exception.name === "ZodError" && Array.isArray(exception.issues);
```

It does this because `@mydaust/shared` is ESM zod while the CJS api imports zod's CJS build, so
the two `ZodError` classes are different (dual-package hazard) and `instanceof` never matches.

- Switching to `@Catch(ZodError)` turns every validation failure into a 500.
- Dropping the `app.getHttpAdapter()` argument in `main.ts` turns every non-Zod error into a 500.

Both look like harmless cleanups. Neither is. Controllers also define their own zod schemas with
the api's local zod instance for the same reason.

### Other boot-time and transport facts

- The **only** production boot assert is: `NODE_ENV=production` + default `SESSION_SECRET` → refuse
  to start. Everything else (PI-SPI creds, buckets) fails at use, so a misconfigured deploy
  starts healthy and breaks later.
- Env is injected via a `Symbol("ENV")` token from a `@Global` ConfigModule. `@nestjs/config` is
  a dependency but unused. Several files call `loadEnv()` directly instead.
- Session cookie `mydaust_session` is parsed by a hand-rolled `cookieExtractor`; there is no
  `cookie-parser`, so `req.cookies` is undefined everywhere.
- `app.enableCors` uses an explicit `allowedHeaders` allowlist. A new custom request header is
  blocked by preflight until added there.
- `POST /api/uploads` carries **no `@Roles`** — any authenticated user can write 50 MB to the
  shared media store. The magic-byte allowlist in `uploads.storage.ts` is the only content
  control. SVG is deliberately excluded (stored XSS from the API origin); do not re-add it.
- News article bodies are stored as **unsanitized raw HTML** and rendered with
  `dangerouslySetInnerHTML`. The `communications` role is effectively a stored-XSS capability on
  the public vitrine (`daust.net` today). Treat any change there as security-sensitive.

### Audit logging

There is **no audit helper, interceptor or decorator**. Every audited mutation writes
`prisma.auditLog.create({ data: { entity, entityId, action, actorId, data } })` inline, and
inside a transaction it **must** be `tx.auditLog.create` so it rolls back with the mutation.
`entity`/`action` are free-form strings with no enum. A new money/grade/role mutation is
silently unaudited unless you remember. Audit every one.

---

## 5. Roles and portals

Eleven roles (`packages/shared/src/roles.ts`): `student, parent, faculty, registrar, admissions,
bursar, dining, hr, it_admin, communications, admin`. `communications` manages the public site CMS
and is documented as having no SIS data access. `admissions` holds the applicant pipeline only.
`dining` runs the cafeteria — the entrance scanner and the dining back office — and reads meal
plans plus a student's overdue total, nothing else.

Nine portals, defined once in `apps/portal/src/lib/nav.ts`:

| Route area    | Owning role               | Landing           |
| ------------- | ------------------------- | ----------------- |
| `/student`    | student                   | `/student`        |
| `/parent`     | parent                    | `/parent`         |
| `/faculty`    | faculty                   | `/faculty`        |
| `/admin`      | **registrar** (not admin) | `/admin`          |
| `/finance`    | bursar                    | `/finance`        |
| `/director`   | admin                     | `/director`       |
| `/comms`      | communications            | `/comms`          |
| `/admissions` | admissions                | `/admissions`     |
| `/it`         | it_admin                  | `/director/users` |
| `/dining`     | dining                    | `/dining`         |

`hr` is the only role with **no `ROLE_PORTALS` entry**, so `portalForRoles()` silently falls back
to the student portal: it logs in, lands on `/student`, and every tile 403s. `it_admin` was given
one and is no longer stranded. See §12.

The **Scanner Station** at `/station` is a tenth authenticated surface but deliberately not a
portal: it is a full-bleed 1180x800 kiosk outside `PortalShell`, reached by `dining`/`admin`.

There are **three** disagreeing role→portal tables: `ROLE_PORTALS` (nav.ts), `AREA_LINKS`
(Topbar.tsx) and `VIEW_AS_ALL` (PortalShell.tsx). Update all three together.

"VIEW AS" is admin-only, is a `router.push` to another portal's landing route, and grants
nothing — authorization stays server-side. It is not impersonation.

`AppShell` renders `null` until `getMe()` resolves and redirects to `/login` on failure. That is
the **only** client-side gate and it checks authentication, never role. A signed-in student can
load `/admin` and see the registrar sidebar; only the data calls 403. Frontend gates are UX.

---

## 6. Money and finance

The most heavily changed area of the repo. Read this before touching anything under
`apps/api/src/finance`.

### Representation

Integer XOF (zero-decimal) everywhere. Never minor units, floats, or `Decimal`. There is no
single shared validator — `Xof` in `packages/shared/src/money.ts` is used only ~6 times; the
real guardrails are Prisma `Int` columns (ceiling 2,147,483,647), the `xof()` runtime guard in
`deriveAccountPosition` (throws `RangeError`), and per-file bounds in `fee-components.ts`.
Aggregate/control totals are `BigInt`.

All finance dates are **Africa/Dakar calendar dates**, not UTC instants. `Installment.dueDate`
and `FeePlanInstallment.dueOn` are `@db.Date`; comparisons go through `toDakarDateKey`. An
installment is current through the whole of its Dakar due day.

### PayTech is gone

Deleted 2026-08-14. The payer-facing rails today are:

1. **Proof-based submissions** — `wave` / `orange_money` / `wire`; the payer uploads evidence and
   Finance verifies it.
2. **PI-SPI** — the BCEAO request-to-pay rail, settled asynchronously by webhook.

`card` is historical-ledger only. `cheque` and `legacy_unknown` are accounting-only and must
**never** be offered to a payer. Vestiges remain (`WebhookEvent.provider` still defaults to
`"paytech"`), which is why the README and CLAUDE.md still read wrong.

### Balances are derived, never stored

`deriveAccountPosition` (`packages/shared/src/account-position.ts`) is the single pure
calculator: non-void invoices + an injected Dakar business date in, `{summary, installments}`
out. It never reads the wall clock — the clock enters in the api adapter
`deriveApiAccountPosition`. It has ~18 call sites spanning finance, academics, guardians,
director and the nav badge endpoint.

It **asserts its own reconciliation and throws** if `overdue + notYetDue + unscheduled !==
outstanding`. Do not weaken that. Overpayments and credit memos become account-level credits
applied oldest-due-first.

`Installment.status` is a **cache**, not truth. The real state is derived
`paymentProgress × dueState`. A 1am Africa/Dakar cron plus
`pnpm --filter @mydaust/api run reconcile:installment-statuses` re-project it.

### Billing model

`FeeSchedule` (versioned, approved) → `FeeScheduleComponent` (authoritative amounts) →
`FeePlanInstallment` (dates). Assigning the package snapshots into
`Invoice(packageType="standard_full")` + `InvoiceComponent` + `PaymentPlan`/`Installment`.
Per-student inclusion is `InvoiceComponentOverride` (absence = inherit the default, so global
updates keep flowing).

The newest feature (`InstallmentComponent`, commit `8092dec`) adds a per-installment ×
per-component grid. **Its presence flips the invoice into "individual component schedule" mode
and inverts authority**: the student's frozen per-component amounts win over the global fee
schedule, even splitting is skipped, and a global revision can no longer delete a component that
an individual plan uses. Exit only via restore-to-standard.

A `standard_full` invoice **rejects hand-edited installment amounts** unless a full component
grid is submitted — amounts are derived from the selected charges. Dates and labels stay editable.

`AnnualBillingProfile` is the annual operational snapshot above the invoice: approved housing,
cafeteria, insurance and refundable-caution selections; award and adjustment provenance; gross
and net component snapshots; and the one canonical invoice. The invoice remains monetary
authority. Profile/catalog changes are approval-backed and bind the reviewed fee schedule,
catalog fingerprint and resolved totals. Approved profiles project Dining and Housing state;
students and guardians only read the profile. Cafeteria operational codes fail closed to
`none|full|half`, and `half` is unavailable until it has an active approved positive price.

### Approvals and separation of duties

Every protected finance mutation goes through `ApprovalRequest`, never directly.
`FinanceService.addCharge/applyDiscount/createPaymentPlan/...` are **dead from the HTTP surface**;
the live implementations are on `FinanceApprovalsService`, reached only via
`approvals.request → approve → apply`. Approve/reject is `@Roles("admin")`.

Separation of duties is asymmetric and deliberate: `@Roles("bursar")` **only** on payment
verify/reject — an admin literally cannot verify a payment — with a separate `@Roles("admin")`
post-hoc audit controller.

Staleness is optimistic concurrency on a **version integer** (`baseRevision` vs
`Invoice.revision`), not a timestamp. A mismatch moves the request to `stale` and applies nothing.

### Settlement

Cash applies oldest **due date** first, then installment sequence, and **may not leapfrog to
another invoice** — the loop breaks on `line.invoiceId !== originalInvoice.id`. The remainder
becomes a negative credit-memo invoice numbered `CR-PAY-<paymentId>`, which is a **functional
lookup key** (`Invoice.number` is unique and `refundPayment` finds the memo by it), not a label.

Component-level revenue split uses largest-remainder proportional allocation frozen into
`PaymentComponentAllocation`. Refunds reverse those exact rows via `refundedAmountXof` — never
recomputed from current proportions.

### Webhook safety

`main.ts` creates the app with `{ rawBody: true }`. The PI-SPI webhook verifies HMAC-SHA256 over
`request.rawBody` with `timingSafeEqual`. **Re-serialising the parsed body invalidates every
signature** (key order and spacing change). Idempotency is `WebhookEvent.token` unique, but the
P2002 duplicate is deliberately swallowed and the transition replayed — so `applyPiSpiEvent`
must stay idempotent on its own via its terminal-state guards.

PI-SPI API calls require mutual TLS and therefore **cannot use `fetch()`** — Node's undici fetch
ignores `agent`, so the client cert never reaches the socket and every call dies in the TLS
handshake looking like a network error. `transport()` uses `node:https` with a reused Agent.

### Rate limiting

`BillThrottleGuard` protects the unauthenticated bill endpoints. It keys on `studentNo` and a
hash of the route token, **deliberately not on IP**, because the prod ALB is directly reachable
so `x-forwarded-for` is spoofable. Counters are per-process `Map`s and the design assumes a
single API task — scaling the ECS service out silently multiplies every limit.

### Cost centers

The financial dimension on every money row, seeded from `packages/shared/src/cost-center.ts`.
Core components are pinned and validated: tuition→9100, housing→3700, cafeteria→3600. The keys
`application_fee` and `insurance` are reserved and rejected as annual charges.

---

## 7. Academics

`Course` (catalog) ≠ `Section` (per-term offering) ≠ `Enrollment` (student↔section).
`Enrollment.grade` is a mutable working value and is **not** the transcript.

`enroll()` takes a raw `SELECT ... FOR UPDATE` on the Section row inside `prisma.$transaction`
(default READ COMMITTED; the seat count is read after the lock) and enforces 14 gates in order:
term ended, add deadline, duplicate enrollment, capacity, closed section, active `StudentHold`,
prerequisites with `minGrade`, corequisites, timetable clash, 30-credit cap, `recordStatus`,
standing requirement, major restriction.

Curated-plan bypass: a course named by the academic office's hand-curated plan for that
`studentNo` (`CURATED_RECOMMENDATIONS`, `curatedBypassCourseIds()`) skips exactly five of those
gates at self-enroll time — prerequisites, corequisites, standing, add deadline, capacity —
and the catalog reads the same five as enrollable. The other nine still apply, the mixed-bundle
past-deadline case still fails with the deadline message, and every bypass is traced in the
enrollment audit row (`curatedBypass: EnrollmentGate[]`, see `CURATED_BYPASSABLE_GATES` in
`packages/shared/src/academics.ts`). Silent in the UI by deliberate product decision. One-time:
nothing is written to the transcript chain, so downstream prerequisites still demand real
`TranscriptEntry` grades.

`registrationCatalog()` — the UX preview — is deliberately **weaker**: it does not preview
standing, major restriction or corequisites. It is never the gate.

There are **two prerequisite representations and they are not in sync**: `Course.prerequisites`
(legacy self-relation, no min grade, what the admin course editor writes and `listSections`
reads) and `CoursePrerequisite` (carries `minGrade`, what `enroll()` actually enforces).

Everything student-facing is **derived, never stored**: GPA and credits from `TranscriptEntry`;
academic level; academic standing; degree-audit completion summed from requirement-category
fulfilment; attendance rate with a late counted as half a present. Prerequisite satisfaction
reads **only** `TranscriptEntry` — faculty drafts and unapproved grades never satisfy a prereq.

Grades have three homes with distinct authority: `Enrollment.grade` (mutable draft) →
`GradeSubmissionItem` (immutable versioned snapshot, what the registrar approves) →
`TranscriptEntry` (canonical append-and-void ledger; rows are never deleted).
`TranscriptEntry.enrollmentId` is unique, so approval is one-shot per enrollment.

Grade policy is **frozen into the transcript row at approval** and never recomputed. In the
seeded `letter` scheme an F consumes GPA denominator with zero earned credit, and P is the
inverse.

An "approved academic catalog" is a whole-catalog JSON snapshot (`AcademicCatalogRevision`)
approved through the **finance** approval queue (`kind: "academic_catalog"`), not the registrar's.
Approving it has wide side effects: supersedes prior revisions, may archive other academic years,
and deletes/recreates `ProgramRequirement` rows. Every approved engineering curriculum must total
exactly **300 credits** — `seedSisReference` throws on deploy if not.

Watch out: `AcademicsService` does **not** use Nest DI for its collaborators — it manually
constructs `AcademicCatalogService`, `AcademicStandingService` and `TranscriptService`.

---

## 8. Admissions, guardians and legacy data

### Admission is payment-gated end to end

`accept` creates a `recordStatus: "pending_payment"` Student whose Person has `roles: []` and
`passwordHash: null`. **Acceptance enrolls nobody.** Activation happens only inside
`syncEnrollmentGateInTransaction`, triggered **from Finance** (settlement, refund, approved plan
change, historical cash) — never from Admissions.

Acceptance now requires explicit annual billing-profile service selections. It resolves the
approved catalog and supported BAC merit award before creating the enrollment invoice/payment
link. Definitions marked `requiresApproval` cannot be smuggled through acceptance; they must use
the durable Finance approval flow.

The threshold is `verifiedEnrollmentCashXof`: the sum of `status: "success"` Payments against the
designated enrollment invoice. Deliberately **not** `Invoice.amountPaid` — scholarships and
account credits never activate a student.

Pending-payment students are invisible to registrar rosters, comms audiences and their own
profile, but visible to Finance and public bill lookup.

Application-status URLs are bearer capabilities: `middleware.ts` stamps
`no-store / no-referrer / noindex` on `/application-status/*`, and only a sha256 hash is stored.

### Guardians

`Person{kind:"parent"}` + a `GuardianStudent` join. There is no Guardian table.
`Person.email` is nullable **solely** so contact-only guardians are representable — every other
path must read it through `requirePersonEmail`, which throws rather than treating null as an
address. Four DB CHECK constraints enforce that only a parent may have a null email and that
such a person holds no password.

**INVARIANT — an invite token is a credential.** A `GuardianInvite` must never be issued or
re-issued for a guardian that already has a `passwordHash`. Re-linking a child to an activated
guardian returns `inviteDelivery: "not_needed"`; `resendInvite` throws. This matters because
`resendInvite` returns the plaintext link to the calling staff member — re-issuing would be a
staff-side takeover of a live parent account.

Invite mechanics to preserve on any change: 32-byte base64url token, sha256 at rest, 72h TTL,
redemption claims the row with `updateMany({where:{id, usedAt:null, expiresAt:{gte:now}}})` and
requires `count === 1`, and unknown/used/expired all return the same message (no oracle).

`StudentInvite` redeems through the same public page but has stricter identity binding: every new
row stores a sha256 of the exact current `Person.email`, and redemption conditionally requires an
active, passwordless, student-only Person with an active Student row and that unchanged email.
Legacy null-bound rows fail closed. Changing a student's login email or roles, or provisioning a
temporary password, burns every outstanding student invite in the same transaction.

Student password setup has exactly one issuance path: the public `/activate-student` ceremony.
The student proves the exact Student ID + date of birth privately, retains a 32-byte browser
capability, and shows a six-digit pairing code to an authenticated registrar/admin. Staff must
visually check an official photo credential in person before approval. Approval rechecks the
locked student identity and creates the only `StudentInvite`; tokens, codes, raw DOB, setup URLs
and emails never enter staff responses or audits. Finance activation, Admissions, registrar
creation and user administration must not mint, email, export or disclose student credentials.

### Identity is never resolved by similarity

Guardian↔student matching is **exact-only** and reports `student_not_found` / `ambiguous_student`
as blockers rather than guessing. 23 parent-payment rows, 22 guardian rows and 2,593 transcript
rows are deliberately held pending official student numbers. **Do not "improve" matching with
fuzzy logic.**

Student numbers: `normalizeStudentNumber` (NFKC → trim → uppercase) is the canonical form.
Normal acceptances mint `S{year}{seq}{initials}` from `StudentNumberSequence`; the legacy-cohort
importer preserves reviewed `F...` IDs and never advances the sequence. A case-insensitive unique
index (`Student_studentNo_lower_key`) exists via raw SQL and is invisible to schema diffing.
A third, incompatible generator (`DAUST-{year}-{n}`) lives in `FinanceService`.

### Importers

All bulk importers are CLI-only, operator-run, dry-run by default, and gated by agreement of
multiple SHA-256 digests (source workbook + trusted extraction + reviewed manifest). The
legacy-cohort import additionally requires `CONFIRM=1` **and** a `LEGACY_COHORT_IMPORT_PLAN_SHA256`
copied from a clean dry run — a digest that anchors live DB state, so any drift invalidates the
run. Input files must be `chmod 600`. Logs are deliberately redacted to counts and issue codes.

The one-time August 29 roster/billing cutover is documented in
`docs/workbook-roster-billing-cutover.md`. Its production snapshot exporter is `REPEATABLE READ`
and `READ ONLY`; the signed-review builder is offline; and confirmation requires an exhaustive
403-row/production-Student/current-Applicant manifest, a Finance freeze, an exact live plan
digest, a `SERIALIZABLE` transaction, independent post-audit and exact no-op replay. It archives
reviewed production exceptions but never hard-deletes people or academic history. Never run its
`CONFIRM=1` path until every review decision and refund blocker is closed.

Never add a write mode to `reconcile:accepted-applicants` — it is a read-only reporting CLI that
writes its report with `{ mode: 0o600, flag: "wx" }` so it cannot overwrite a review file.

### Per-applicant notes (admissions team)

`AdmissionNote` is the free-form notes thread scoped to an applicant. Authored by admissions
officers or admins; only admissions / admin can read or write. The author may edit or delete
their own notes; admins may edit or delete any. Notes are hard-deleted; the audit log retains
metadata (who, when, which applicant, body length) but not the body. Body is plain text,
rendered inside the authenticated portal shell only — it does not flow to the public vitrine.
Pinned notes sort above unpinned notes within an applicant. See
`apps/api/src/admissions/applicant-notes.controller.ts` for the four endpoints.
---

## 9. Portal frontend

Navigation, titles and breadcrumbs are **data, not markup**, all in `apps/portal/src/lib/nav.ts`:
`PortalNav` per portal, `PAGE_META` (route → title + crumb), `BadgeKey`, `ROLE_PORTALS`. No
screen hand-rolls a header. The Topbar resolves `PAGE_META` by longest-prefix match, so deep
routes inherit their ancestor's title.

Every route area is a 5-line **server** layout rendering `<PortalShell portal="key">` and nothing
else. It passes a plain string because nav entries carry Lucide icon **functions**, which are not
serializable and cannot cross the server/client boundary.

All client→API traffic goes through `request<T>()` in `apps/portal/src/lib/api.ts`. There is not
a single raw `fetch(` in `app/` or `components/`. It always sets `credentials: "include"`.

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
```

The `??` is **load-bearing**. Production builds pass `NEXT_PUBLIC_API_URL=""`; empty string is
not nullish, so API_URL becomes `""` and every call is same-origin. Changing `??` to `||` would
inline `localhost:4000` into the production bundle.

`components/ui.tsx` is the design-system atom set and the only place new primitives belong.
Tokens live in `:root` in `globals.css`: navy `#153b6a`, navy-deep `#0f2c50` (sidebar), orange
`#ed8425`, steel `#9da6ae`; Saira (self-hosted variable font) for display, Montserrat for body.
Dark mode is `data-theme="dark"` on `<html>` implemented purely by redefining tokens.

Dead code an agent will otherwise copy as if it were the design system: `Panel.tsx`,
`StatCard.tsx`, `Donut.tsx`, `GpaRing.tsx`, `Sparkline.tsx`, `Roadmap.tsx`, `UserBadge.tsx`,
`Announcements.tsx` (zero importers) and `lib/api-{affairs,campus,innovation}.ts` (leftovers from
retired portals).

Routes outside the authenticated shell: `/login`, `/activate-student`, `/set-password`, `/change-password`,
`/pay-bill`, `/pay/[token]`, `/application-status/[token]`, `/billing-admin`. `middleware.ts`
rewrites `/` → `/pay-bill` and `/admin` → `/billing-admin` **only** for the payment hosts.
`/set-password` is a bearer-capability page: new links put the token in the URL fragment, and its
layout/middleware enforce dynamic rendering, `no-store`, `no-referrer`, `noindex` and frame denial.

---

## 10. Vitrine and the CMS

`apps/vitrine` is a **static export with one real page**. Eleven "pages" are React nodes inside a
single 1073-line `"use client"` component switched by a `page` useState. No router, no SSR. All
deep links ride root query params (`?preview=`, `?article=`, `?faculty=`).

Every string and image comes from `buildSiteContent(lang, overrides)` in
`packages/shared/src/site-content.ts` — the defaults live in **shared**, not in the vitrine.
`apps/vitrine/src/lib/content.ts` is a 4-line re-export shim.

CMS overrides are keyed by **dotted paths derived from the shape of the defaults**, and
`sanitizeSiteOverrides` drops anything not in that allowlist. Consequences:

- **Renaming a content key silently drops its published override.**
- **Reordering an array is worse** — paths are index-based, so a published override silently
  re-targets whichever item now sits at that index.

Content flows through one Prisma row `SiteContent{key:"site"}` holding `draftJson` +
`publishedJson` + `previewToken`. Only `publish` is audit-logged.

`trailingSlash: true` means the S3 website origin drops the query string on its implicit
redirect, so internal links must put the slash **before** the `?`: `/admissions/payment/?id=…`.

The hero video took four consecutive fix commits to get right, plus a fifth for the poster.
The working approach: `paused` starts `true`, eligibility re-checked in a
`requestAnimationFrame` and skipped on ≤767px / reduced-motion / save-data, YouTube driven
through the real IFrame API and held at `opacity: 0` until `onStateChange` reports PLAYING.
Do not regress it.

The hero **poster** (2026-08-18 fix) has its own invariants:

- `HeroMedia.poster` is withheld (`undefined`) until the CMS doc settles (`contentReady` in
  `page.tsx`) — painting it earlier flashes the build-time `DEFAULT_IMAGES.hero` before the
  published image swaps in, which is the "old hero image flashes first" prod bug. The navy
  section ground shows in the interim; a `<noscript>` fallback keeps the baked image for no-JS
  visitors and crawlers.
- `getPublishedContent()` in `apps/vitrine/src/lib/api.ts` caches its promise and resolved doc at
  module scope, and `page.tsx` seeds initial state from `getCachedPublishedContent()` — so a
  component remount can neither re-fetch nor bounce the hero back to the default. Preview mode
  (`?preview=`) deliberately bypasses the cache.
- `HeroMedia`'s `providerOrigin` is resolved synchronously in a lazy `useState` initializer —
  setting it in an effect changes the embed URL one render later, which aborts the first YouTube
  request and re-creates the iframe.
- Keep `apps/vitrine/public/images/hero.jpg` (the baked default) visually in sync with the
  published hero when it changes — it is what fetch-failure, no-JS, and crawlers see.

The "reveal published news cards" fix has two load-bearing halves: the CSS rule must be
`html.js .reveal.in` (plain `.reveal.in` loses on specificity and cards stay invisible forever),
and the IntersectionObserver effect must list `newsList` in its dependency array.

The "AI assistant" has **no LLM and no backend** — it is keyword retrieval over a curated
bilingual knowledge base with a fake 450 ms typing delay.

---

## 11. Database

`String @id @default(uuid())` for 100 of 106 models; six natural keys (`CostCenter.code`,
`ManagementCategory.key`, `AppSetting.key`, `FeeItem.key`, `StudentNumberSequence.academicYearStart`,
`GuardianProfile.guardianId`). **No soft-delete columns** — deletion is modelled per domain as
`recordStatus`, `voidedAt`, `clearedAt`, or an invoice `void` status.

Migrations after 2026-07-23 are **hand-authored SQL** in hand-named directories with rounded
timestamps. They carry a lot of PostgreSQL that `schema.prisma` cannot express: 21 named CHECK
constraints, partial unique indexes, and one functional unique index. Enum-value additions are
deliberately isolated into their own migration because PostgreSQL requires the `ADD VALUE` to
commit first. Never edit an applied migration.

Academic-year labels use a **U+2013 en dash** (`2026–2027`), and that label — not an id — is the
foreign key from `FeeSchedule.academicYearLabel` to `AcademicYear.label`.

`PaymentSubmission` is stored in a table still named `WireTransferSubmission` (`@@map`), its
status enum is `WireTransferStatus`, and the DB spelling is `approved` while the wire contract
says `verified`. The `present()` function translates; admin list filters use the DB spelling.

The three ops entry points are mutually exclusive, each with its own guard:

| Script                             | Target               | Guard                                                                     |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `seed.ts`                          | local / staging demo | aborts if `DATABASE_URL` contains `daust-prod` unless `SEED_ALLOW_PROD=1` |
| `bootstrap-prod.ts`                | real prod, first run | throws unless zero students **and** zero payments                         |
| `normalize-staging-legacy-demo.ts` | staging only         | throws unless `TARGET_ENV=staging`                                        |
| `load-sis-reference.ts`            | any populated DB     | asserts student/invoice/payment counts are unchanged, throws if any moved |

`load-sis-reference.ts` is the sanctioned way to add official configuration to production, and
runs on every deploy. Note it is idempotent _except_ that it hard-deletes and recreates every
`GradeScaleRow` and deletes `ProgramRequirement` rows outside its own list.

Retired-portal tables are still in the schema. Dropping them is irreversible and deliberately
deferred pending confirmation they are empty in prod. **`MealPlan`, `DiningScan`, `MenuItem`,
`DiningOrder`, `DiningOrderItem`, `Hall` and `HousingAssignment` must be kept** — the student
Dining and Housing screens and the dining console all read them. (The `MenuItem`/`DiningOrder*`
entry on the drop list was already wrong before the console returned: the student weekend-order
tab has been reading and writing them since the redesign.)

---

## 11b. Dining (cafeteria)

Three surfaces, built to `design/daust-dining-design/` (deleted from the tree in `5c25845`;
recover with `git show 5c25845^:design/daust-dining-design/<file>`):

| Surface         | Route                                                | Who               |
| --------------- | ---------------------------------------------------- | ----------------- |
| Scanner Station | `/station` — full-bleed kiosk, outside `PortalShell` | `dining`, `admin` |
| Dining console  | `/dining` — 8 pages                                  | `dining`, `admin` |
| Student screen  | `/student/dining`                                    | `student`         |

**One entrance rule, in one place.** `diningEligibility()` in
`packages/shared/src/dining-eligibility.ts` decides every verdict, and both the scanner and the
student's own screen call it, so they cannot disagree about whether the door will open. Order is
significant — a student is told the thing they can act on:

`NO_PLAN` (not overridable) → `UNPAID` → `NOT_COVERED` (half plan at dinner) → `SERVED`
(already eaten this period) → `OK`.

`UNPAID` is derived, never stored: `deriveApiAccountPosition(invoices).summary.overdueXof > 0`.
Cafeteria pricing is annual billing-profile configuration pinned to cost center **3600**. The
shipped 2026–2027 catalog offers `none` and a 630,000 XOF `full` plan; `half` is unavailable until
Finance approves a positive price. `MealPlanType` (`none|half|full`) is the operational access
projection of that approved annual selection, never an independent billing authority.

`MealPlan` is keyed by `(studentId, academicYearLabel)`. Every scanner, student-pass, eligibility,
reporting and back-office read resolves exactly one active AcademicYear whose date range contains
today in Dakar, then reads only that year's plan. Missing dates or overlapping active years fail
closed; a future profile cannot grant current Dining access. Students request a profile change,
which remains pending until the existing Finance approval workflow applies it.

**`AppSetting["dining.settings"]`** holds the service windows, cost per meal, weekend-order
switch and two entrance rules. `enforcePayment` ships **off**: turning it on refuses every
student carrying an overdue installment, so it is an announced operational change, not a deploy.
Every setting is read by something — the windows drive the station's default period and the
student's next-meal card (returned on `GET /dining/my/today`), the cost feeds the margin figure.

**Overrides are decided server-side.** `scanOverride()` recomputes eligibility and refuses to
waive a non-overridable verdict; the fail-open roles guard means the client is never a control.
Waivers write `DiningScan.reason = "Override · <CODE>"` and an `AuditLog` row carrying the
`waivedCode` and the actor.

Weekend orders use the **proof-based** `PaymentSubmission` rail (`source: "dining_order"`), so an
order stays `cart` until Finance verifies evidence and never reaches the kitchen queue before
then. The console has no settlement or payout surface: with proof payments the cash is already in
the university's account, and there is no payout capability to expose.

`dayOnly()` is the Dakar calendar date at midnight UTC — the third component of
`DiningScan @@unique([studentId, period, date])`, i.e. the double-serve guard.

## 11c. Infirmary sickness flow

Flagging a `Consultation` as sick writes today's `AttendanceRecord` rows for the student
as `status: absent, reason: sick | infirmary_emergency, source: infirmary`. The sick flag
overrides any prior faculty-recorded attendance for the same day — that is the user's
intent ("faculty or student affairs can put down his absense as sick"). Recipients of the
resulting notification are:

- **Faculty-of-today:** every distinct `enrollment.section.instructorId` for the student
  where the section's term includes today.
- **Admin role:** every `Person` with `roles` containing `admin`.
- **Emergency paging list:** only when `isEmergency = true`, parsed from
  `AppSetting["infirmary.emergencyRecipients"]` (a JSON array of personIds). Missing or
  malformed value is treated as an empty list and never throws.

The default role for `student_affairs` is fulfilled by `admin` in v1 because there is no
`student_affairs` role in `packages/shared/src/roles.ts`. The paging key (`notifications.emailEnabled`)
is read from the same `AppSetting` namespace introduced by the notifications infra branch;
a fresh seed sets it to `false` so a missing setting never pages anyone by accident.

`Consultation.sickFlagged` is a snapshot of whether the visit was sick-flagged today.
Clearing a flag (admin only) deletes only the infirmary-source `AttendanceRecord` rows
that flag created, and emits a follow-up notification. Cleared flags from prior days are
read-only — clearing them does not retroactively rewrite historical attendance.

See `apps/api/src/infirmary/sickness-flag.service.ts` and
`apps/api/src/infirmary/sickness-flag.controller.ts`. Audit invariants: every flag and
every clear writes an `AuditLog` row inside the transaction with
`action = flag_sick | flag_sick_cleared`.

---

## 12. Known defects (verified 2026-08-18)

Found by walking all nine logins and 63 portal routes against a freshly migrated + seeded
database, plus ~1,100 API probes including a cross-role authorization matrix. Full report with
repro steps: **`docs/verification-2026-08-18.md`**. These are reproduced, not speculative.

The authorization boundary held everywhere — every cross-role probe returned 401/403, and the
money reconciled to the franc across finance, director, billing-admin and student billing.

**High**

- **`/director/payments` is blind to most payments, and "0 unaudited payments" is a false
  all-clear.** `listDirector()` (`payment-submissions.service.ts:931`) still filters
  `provider: "paytech"` — a rail deleted on 2026-08-14 — so directly recorded payments are
  invisible; `unauditedCount()` (`:1031`) has the same gap. An oversight control reporting a false
  negative on live money. Fix first.
- **`hr` and `it_admin` are stranded in the student portal** (no `ROLE_PORTALS` entry →
  `portalForRoles()` fallback), where ten `.catch(() => {})` in `student/page.tsx:69-96` swallow
  the resulting 403s. The page then **asserts facts it never read** — "Not billed / No charges on
  account" for an account whose billing request was _forbidden_ — plus a permanently stuck
  "Loading…" card. A denied request must never render as an affirmative empty state; fix the
  swallowing separately from the routing.
- **Four unhandled 500s**, all from missing `@Query`/`@Param` validation (there is no global
  `ValidationPipe`): `GET /api/uploads/:filename` and `/api/uploads/site-media/:filename` on any
  missing file (**`@Public` — no auth required**, should be 404); `GET /api/registrar/curriculum`
  without both query params; `GET /api/academics/sections/:id/attendance` with a missing or
  unparseable `date`.
- **Editing a term demotes the live term to draft.** `admin/calendar/page.tsx:152` seeds the form
  with `status: t.status ?? "draft"` and submits it; seeded terms have `status = null`. The
  calendar also shows no dates at all despite the API returning add/drop deadlines that `enroll()`
  enforces.

**Medium**

- **Faculty section lists are not term-scoped** — `facultyOverview()` (`:3300`) and `mySections()`
  (`:3745`) omit the `termId` filter that `mySchedule()` (`:3556`) applies, so a prior-term section
  appears on four write-capable screens and is visually identical to the current one.
- **Unrecorded attendance is indistinguishable from fully-present** — `academics.service.ts:1329`
  defaults every enrollment to `present`, silently inflating the derived rate.
- The registration catalogue does not annotate prerequisites; GPA renders as `0.00` on some
  screens and `—` on others for the same ungraded state (and is colour-coded critical on
  `/admin/student-success:186`); faculty "Sent messages" is local state, not history; materials
  with no file render as `href="#"`; unsaved CMS edits are dropped on navigation because
  `useDraft()` is per-screen with no shared provider.

**Also confirmed:** undecorated routes really are reachable by any session — a
`communications`-only cookie reads `/api/comms/contacts`, `/api/academics/sections`,
`/api/academics/current-term`, `/api/campus/library` and `/api/campus/events` (§4).
`GET /api/nav/context` returns `meta: null` for bursar, communications, hr and it_admin.

**Seed gaps (not code):** no `communications` user is seeded, so `/comms` is unreachable on a
fresh database; `TranscriptEntry` is empty for every student, so all GPA/credit surfaces show `—`
while enrollments carry working grades; every student's program reads "B.Sc. Computer
Engineering" regardless of their student number.

---

## 13. Testing reality

There **is** a test suite: 79 files (71 under `apps/api/src`, 8 under `packages/shared/src`).
`apps/portal` and `apps/vitrine` have **zero** tests.

The important caveat: **~31 integration suites self-skip without a database.** Each creates a
throwaway Postgres schema from `TEST_DATABASE_URL ?? DATABASE_URL`, shells out to
`prisma migrate deploy`, and is wrapped in `describe.skipIf(!DB_URL)`. CI has no `services:`
block and never sets either variable, so **every database-backed test skips on every PR**. A
green `pnpm test` proves much less than it looks like.

To actually run them:

```bash
export TEST_DATABASE_URL="postgresql://mydaust:mydaust@localhost:5432/mydaust"
pnpm --filter @mydaust/api exec vitest run src/finance/settlement.integration.test.ts
```

(`legacy-cohort-import.integration.test.ts` reads **only** `TEST_DATABASE_URL`, with no fallback.)

---

## 14. CI/CD and environments

| Branch    | Environment    | Hosts                                                                                      |
| --------- | -------------- | ------------------------------------------------------------------------------------------ |
| `develop` | staging        | `daust-staging.azt.dev` (app), `daust.azt.dev` (vitrine)                                   |
| `main`    | **production** | `my.daust.net` (app), `daust.net` (vitrine — see below), `payment.daust.net` (bill portal) |

**Vitrine host reality (verified 2026-08-18, and deliberate):** the code and infra _intend_
`daust.org` (PR #67 set `VITRINE_ORIGIN=https://daust.org`; the prod tunnel has ingress for it),
but the `daust.org` apex DNS still points at the **legacy WordPress site**, kept live on purpose
for now. The new static vitrine is actually served on **`daust.net`** (it reaches the api
cross-origin via `ADDITIONAL_CORS_ORIGINS`, which deploy.yml sets to include `https://daust.net`).
Do not "fix" `daust.org` DNS, and do not expect a CMS publish to change what `daust.org` shows —
it cannot, that host is WordPress.

Flow: feature branch (`serigne/<topic>` or `codex/<topic>`) → PR into `develop` → verify on
staging → promote by merging `develop` into `main` as its own PR.

**CI** (`ci.yml`) runs only the five commands listed in §1. No lint, no build of portal/vitrine,
no e2e, no database.

**Deploy** (`deploy.yml`) only bumps images and rolls ECS services — it never runs OpenTofu. It
executes five ordered steps, and the API rolls **before** the portal on purpose:

1. `prisma migrate deploy` as a one-off ECS task **on a task definition carrying the newly built
   image** (running the current task def would silently skip new migrations and the API would
   then 500 on the new columns).
2. `load-sis-reference.ts` on that same task def.
3. Roll api + `aws ecs wait services-stable`.
4. `reconcile-installment-statuses.cli.js` — and it polls CloudWatch for a structured
   `{"event":"installment-status-reconciliation","ok":true,...}` line, failing the deploy if it
   never appears.
5. Roll portal.

ECR tags are immutable, so a develop→main fast-forward promotes the existing image rather than
rebuilding (probed with `batch-get-image`, the only call the deploy role is granted).

Infrastructure is operator-run `tofu apply` from `infra/environments/{staging,prod}` and
`infra/global`. **An operator `tofu apply` reverts whatever CI deployed** — the ECS service
resource has no `lifecycle { ignore_changes = [task_definition] }`, so applying resets the
service to `var.api_image`/`var.portal_image` and drops the env vars deploy.yml injects. Pass the
currently-running image tags when applying.

OIDC is scoped to `repo:DAUST-ORG/myDAUST:ref:refs/heads/{develop,main}`. **Never add a job-level
`environment:`** — it changes the `sub` claim to `...:environment:<name>` and role assumption
fails. That exact mistake was already fixed once.

Two operator-only `workflow_dispatch` workflows are the irreversible-operations gate:
`guardian-import.yml` (CSV from a repo secret, SHA-256 must match the input, transported as a
hash-addressed private ECR layer) and `full-package-conversion.yml` (branch↔environment lock; a
prod run additionally requires a `backup_reference` naming a manual, encrypted, available RDS
snapshot created within 24 hours). Both default to dry run and assert on a structured CloudWatch
event before succeeding.

Notable infra facts: there is **no TLS at the ALB** (Cloudflare tunnels terminate at the edge and
forward plain HTTP; `COOKIE_SECURE=true` is set explicitly because the app cannot infer it), the
tunnel ingress config is **baked into the image** so hostname changes require rebuilding the
tunnel service, and RDS is `publicly_accessible = true` in both environments gated only by a
security group.

`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `POSTHOG_KEY` and `POSTHOG_HOST` appear in `.env.example` but
are wired to nothing — there is no error tracking or analytics in the codebase.

---

## 15. Recipes

**Add an API domain module** — create `<domain>/<domain>.module.ts` (+ controller/service), then
add it to the `imports` array of `app.module.ts`. Nothing auto-discovers modules; a controller in
an unregistered module compiles, typechecks and is unreachable. Five modules are `@Global`
(config, prisma, mail, app-config, academic-catalog) so you need no `imports` for those; but
forgetting `imports: [FinanceModule]` when you need `FinanceService` is a boot-time DI failure.
**Always add `@Roles(...)`.**

**Add a portal screen** — (1) `app/<area>/<slug>/page.tsx` starting with `"use client"`, built
from `@/components/ui` atoms; (2) a nav item in the right `PortalNav.groups` in `nav.ts` plus the
Lucide icon import; (3) a `PAGE_META["/<area>/<slug>"]` entry; (4) a typed wrapper in
`lib/api.ts` using `request<T>()`; (5) the API controller with `@Roles(...)`. Optionally a
`BadgeKey` plus a matching key in `NavController.badges()`.

**Add a whole portal area** — additionally a `PortalNav` const, a `PORTALS` key, a `ROLE_PORTALS`
row, an `app/<area>/layout.tsx` rendering `<PortalShell>`, a `VIEW_AS_ALL` entry in
PortalShell.tsx and an `AREA_LINKS` entry in Topbar.tsx.

**Add an enforced registration rule** — (1) schema + migration; (2) enforce inside `enroll()`
after the `FOR UPDATE`; (3) mirror it as a `blockedReason` in `registrationCatalog()`; (4) surface
it in `student/registration/page.tsx`; (5) extend `setCourseRule` if registrar-editable; (6) add
a test next to `registration.test.ts`.

**Add a field to the academic catalog** — it must change together in
`packages/shared/src/academic-catalog.ts`, the `AcademicCatalogRevision` columns,
`academic-catalog.service.ts`, `applyAcademicCatalog()` in `finance-approvals.service.ts`, and
`admin/academic-years/page.tsx`. Then rebuild shared.

**Add a public hostname** — tunnel `config.yml` ingress (with `httpHostHeader` for S3 origins) →
proxied CNAME to `<tunnel-id>.cfargotunnel.com` → `ADDITIONAL_CORS_ORIGINS` in both the jq map in
deploy.yml and the env's `main.tf` → `PAYMENT_HOSTS` in `middleware.ts` if relevant → push so the
tunnel job rebuilds.

**Add an operator data operation** — script under `packages/db/prisma/`, print one structured
JSON line, honour `CONFIRM=1`; then a `workflow_dispatch` workflow that reads the live task def
from `describe-services`, runs it via `run-task` with a container override, and polls CloudWatch
for the event. Do **not** add a job-level `environment:`.

---

## 16. Conventions

Conventional Commits with a scope: `feat(finance):`, `fix(vitrine):`, `ci:`, `docs(data):`.
Since 2026-08-15, agent-authored work carries the literal suffix **`(AI-generated)`** in the
subject line. Promotion PRs from `develop` to `main` often use a `release:` prefix.

Strict TypeScript, two-space indent, double quotes, semicolons. `PascalCase` components and
classes, `camelCase` functions, kebab-case NestJS filenames (`pi-spi.provider.ts`). Backend
grouped by domain under `apps/api/src/<domain>/`. Run `pnpm format` before committing.

Git is user-managed. Do not commit, push, branch, merge, rebase or edit `.gitignore` unless
explicitly asked.

Never commit secrets. `private-imports/`, `outputs/`, `Active Students*.csv` and the root PNGs
are gitignored on purpose — they contain real student PII.

---

## 17. Decisions an agent must not take unilaterally

- Dropping the retired-portal tables (irreversible; needs prod-empty confirmation).
- Resolving any held/unmatched identity by name similarity.
- Running any importer with `CONFIRM=1`, or converting one into an endpoint.
- Enabling wire transfers in production (bank details and Finance recipients are unconfigured).
- Building true "view as" impersonation (today's switcher is portal-scoped by design).
- Shipping the `/admin/settings` toggles — there is no `SystemSetting` model and no enforcement.
  The standing instruction is: _do not ship decorative switches._
- Adding late fees on overdue installments.
- Changing `UPLOADS_ROUTE`, which is simultaneously a persisted URL prefix in the database and a
  routing compatibility shim.

Still unbuilt and safe to assume absent: Google Workspace OIDC (login is email + password), a
Sentry/PostHog, a Redis/BullMQ worker tier (jobs run in-process via
`@nestjs/schedule`, so scaling out duplicates every cron), helmet, and `ARCHITECTURE.md`.
