# Production and Delivery Status

Production last verified: **2026-08-10**. This page is the operational handoff for recent production data work and deployments. `TODO.md` remains the broader product backlog.

## Status Definitions

- **Production verified** means the behavior or data was checked on `my.daust.net` or `daust.net`.
- **Deployed but disabled** means the feature is live but hidden behind configuration.
- **Partially imported** means authoritative records are live while unresolved identities remain isolated from production.

## Academics: Production Verified

- Four programs exist: `BSCE` Computer Science, `BSCHEM` Chemical Engineering, `BSEE` Electrical Engineering, and `BSME` Mechanical Engineering. Their curricula were loaded from the official course workbook; shared early-semester courses reuse catalog records rather than creating program-specific duplicates.
- The catalog correction **Power Systems = `EE 3615`** is live.
- The Fall 2026 schedule import created **62 open sections** from 61 workbook rows. The cross-listed `EE 3513 / ME 2931` row was represented as two section records. No catalog codes were missing and no room or instructor collisions were detected.
- **44 sections** have an assigned instructor. **18 are TBA**: 16 were blank in the source and two reference an ambiguous duplicate name.
- The schedule workbook contains no student identifiers. It created offerings under Course Enrollment; it did **not** enroll individual students.

### Assigning an Instructor

The system already supports one instructor per section through `Section.instructorId`.

1. Create or confirm the faculty account under **Registrar → Directory**.
2. Open **Registrar → Course Enrollment** (`/admin/offerings`).
3. Select **Edit offering**, choose the instructor, and save.
4. The section then appears automatically in that instructor's faculty teaching views.

Faculty added on 2026-08-06 as private, no-login directory records and assigned to their scheduled sections:

- Mahamed Guindo (`mguindo@daust.org`): 3 sections.
- Ahmed Hamed (`ahamed@daust.org`): 2 sections.
- Baye Alioune Ndiogou (`bndiogou@daust.org`): 1 section.
- Moussa Gueye (`mgueye@daust.org`): 1 section.

Assignment gaps still requiring resolution:

- Moussa Thiao: 2 sections; two production accounts share this name. Confirm the correct email before assignment.
- Sixteen additional sections were intentionally marked “Assign instructor” in the workbook.

Catalog decisions still needed: `EE 3513` is “Control Systems” in production but “System Design & Control” in the schedule; `ENGR 3412` is “Machine Learning for Engineers” in production but “Numerical Methods with AI for Engineers” in the schedule.

## Payments: Wire Disabled; Offline Ledger Partially Reconciled

The wire-transfer workflow is deployed across authenticated student billing, public bill lookup, payment links, Billing Admin, and the Finance portal.

- Bursar/admin users can configure the global bank account and notification recipients from **Billing Admin → Bank settings** or use **Finance → Wire Transfers**.
- Payers upload PDF/JPG/PNG proof up to 10 MB. Proofs use private encrypted S3 storage and authenticated streaming.
- Submissions remain pending until Finance approves or rejects them. Approval is idempotent, records reviewer evidence, applies the normal settlement allocation, and sends the standard receipt.
- Production currently reports the global switch as **disabled** and the bank fields as unconfigured. Enter approved bank details and Finance recipients before enabling it.

Remaining payment work:

- Run a controlled production submission/approval/rejection smoke test after configuration.

### Parent-payment ledger import (2026-08-10)

- The one-page `RECOUVREMENT (2).pdf` source contains **54 rows / 48,483,075 XOF**. The original PDF and structured extraction are retained under `wire-proofs/offline-imports/recouvrement-2026-08-10/` in the private, encrypted production Finance bucket. The PDF SHA-256 is `999b3eb354ab01341acdf10494abc734beb2093d7d02e346f0202c115fa9c3cb`.
- Production preflight found **31 exact active-student matches** with one unambiguous Fall 2026 bill each, zero prior successful payments, sufficient balances, and reconciled installment plans. These **27,434,950 XOF** were posted with deterministic `OFFLINE-999b3eb354ab-*` references, historical source dates, raw source methods, private evidence links, and bursar audit provenance.
- Post-import verification found **31 successful payments, 27,434,950 XOF of allocations, 31 payment audits, one batch audit, no rollup mismatch, and no overpaid invoice**. A second dry-run proposed zero writes. Method totals are 17,332,450 XOF wire/bank/cheque, 6,850,000 XOF Wave, and 3,252,500 XOF Orange Money.
- **23 rows / 21,048,125 XOF remain deliberately held**: 21 lack an exact SIS name match, one exact Mohamed Lam payment exceeds the current bill, and one Marie Nafissatou Diouf cheque line exactly duplicates another source line. The held set also contains two malformed source dates and a second non-exact amount above the current bill. Finance/Registrar must supply official student numbers and discrepancy decisions before a follow-up import.

## Faculty Operations: Production Verified

The following fixes were promoted through staging and production on 2026-08-07 and 2026-08-10:

- **Faculty edit/delete:** Registrar → Directory can now edit a faculty member's name, email/sign-in identity, and public profile. Deletion is permanent but limited to unused records. Assigned sections must be reassigned first, and accounts with retained academic or communication activity cannot be deleted.
- **Weekly schedules:** students and faculty now share the same responsive Monday–Friday timetable. The faculty navigation includes **Schedule**, only the active term is shown, and both portals can export a recurring `.ics` calendar.
- **Schedule correctness (2026-08-10):** production now serves `GET /academics/my/schedule`, which returns one atomic active-term payload for the signed-in student. This prevents prior-term enrolled sections from being relabeled or exported as the current term. Student and faculty pages now distinguish loading, API failure, and genuine empty states.
- **Faculty gradebook:** creating an assessment now transactionally creates `assigned` grade rows for the current roster. Existing assessments backfill missing rows when opened, allowing faculty to grade quizzes or exams even without a student file submission. The form now reports validation/API errors inside the modal.
- A fresh disposable-PostgreSQL grading test exercised faculty ownership, assessment/category creation, roster score rows, weighted totals, grade submission, registrar-only approval, transcript publication, `I` policy, idempotent approval, and the post-approval lock. The complete flow passed; no remaining category-creation defect reproduced on current code.
- **Course materials:** faculty can reorder materials and remove a material record from a course. Reordering requires the exact section material set, and both changes are audited. Removal immediately ends portal access and cannot be restored through the portal.

No Moussa Thiao record was deleted during deployment. Production previously showed `mthiao@daust.org` as public and `mndao@daust.org` as a private duplicate; verify both identities and section assignments immediately before deleting either record.

## Transcript Ledger: Production Deployed; Current Students Imported

The deployed independent `TranscriptEntry` ledger is now the source of official academic history. This changes the publication boundary:

- Faculty **Save** updates provisional enrollment grades. **Submit for approval** freezes a versioned `GradeSubmissionItem` roster snapshot but leaves enrollments Enrolled and does not affect GPA, earned credits, degree progress, or transcript output.
- Submitted and Approved sections reject further faculty Save/Submit calls. A registrar return records the note, publishes nothing, and permits a corrected resubmission as the next version.
- Registrar approval transactionally claims the Submitted record, publishes each reviewed item once, completes its enrollment, and audits the decision. Unique enrollment and submission-item links plus the status claim make retries idempotent and reject conflicting official history.
- The standard policy is explicit: **I** has no GPA weight or earned credit; **P** earns credit without GPA weight; **F** contributes zero points to attempted GPA and earns no credit.
- Student/parent grade views, degree progress, student-success GPA, and printable records now read non-voided ledger entries. Registrar/admin API operations can create, edit, void, restore, and inspect the audit history of manual entries.

Deployment and import status:

- Migration `20260810100000_transcript_ledger`, the API, and the portal were promoted through PRs `#4` and `#5` on **2026-08-10**. Staging migration/reference-loader tasks exited 0 and services stabilized at API revision 84 and portal revision 46. Production tasks exited 0 and stabilized at API revision 77 and portal revision 42 using immutable `63595a5-main` images.
- The migration backfills already-official Approved or pre-workflow Completed enrollment grades, deliberately excludes Submitted/Returned grades, and reopens enrollments that the previous workflow completed prematurely. All 41 migrations apply cleanly to fresh PostgreSQL 16 databases.
- The production-safe S3/CLI importer verifies the workbook hash, defaults to dry-run, requires an admin/registrar actor, accepts only authoritative student numbers, creates archived records only with explicit authorization, snapshots unmatched courses/terms, deduplicates exact content, and writes the batch, entries, and audit records atomically.
- The normalized source has **8,884 rows**; all **637 empty grades became `I`** (750 source `I` grades). The matched manifest contains **6,291 rows across all 298 active student identities**. Its production dry-run authorized 298 existing students, rejected no identities, found 27 exact-content duplicates, and planned 6,264 entries.
- Production batch `e5e1bd9e-9845-4fa1-8b1d-4f31743e6c13` committed atomically on **2026-08-10**: **6,264 legacy transcript entries imported, 27 exact duplicates skipped, 0 errors, 298 distinct students, and 0 archived profiles created**. A repeat dry-run returned the same imported batch with zero rows to add.
- Post-import read-back confirmed 6,264 batch entries, 6,264 `legacy-imported` entry audits, and one batch audit. **5,860 entries** link to a unique current catalog course; **404** intentionally retain historical course snapshots only. Historical terms remain stable snapshots rather than fabricated current `Term` records.
- The matched import contains **489 `I` entries**. All have null grade points, no GPA or earned-credit flags, and zero earned credits; the policy-violation query returned zero.
- The remaining **2,593 rows across 106 historical names** are isolated in `Historical_Students_Identity_Mapping.xlsx`, with 241 `I` grades and editable registrar identity fields. The workbook is stored locally and in the private, encrypted, versioned production import bucket with SHA-256 `f209c252f1f62d2a147c5674139bc39fbfc16aa0cb2234cf475f6d58fdcbb5b5`.
- Audit note: the matched batch references the original normalized workbook while its immutable manifest selects only the 6,291 verified rows. That original workbook hash is now owned by the completed batch. Any later import of the unresolved records must reference the separate historical-only workbook and its distinct hash.
- Registrar transcript management is live with grouped terms, summaries, Add/Edit/Void/Restore operations, catalog-match/source indicators, and mandatory audit reasons. Student output is labeled “Unofficial Academic Record.” Authenticated role smoke tests confirmed registrar access, bursar denial, student-safe output, and the production admin Transcript screen. Do not create historical enrollments as a substitute.

Validation on 2026-08-10: **22 shared tests**, **104 API tests**, and all **8 database settlement tests** passed; workspace typecheck and production build passed. All 41 migrations applied to fresh PostgreSQL 16 databases, transcript state-machine/import tests passed, and both infrastructure configurations validated. Private transcript buckets and prefix-scoped API read policies are deployed. Production health returned 200 and the new API task emitted no errors or exceptions during the smoke window.

## Public Website and Media

- The production homepage now shows exactly three news stories and exposes the complete list through **All news**.
- New uploads are stored in the private, encrypted, versioned production media bucket, so ECS replacements no longer erase them. The API task can only read/write `uploads/*`; bucket listing is restricted to that prefix. A persisted production object returned HTTP 200 after rollout.
- The public site resolves API-hosted upload URLs and displays a designed fallback instead of a broken image. Four existing news records reference legacy objects that are no longer available; those URLs now return 404 instead of an API error and must be re-uploaded from the original source images.

## Validation and Repository State

Latest local validation on 2026-08-10:

- `pnpm test`: **22 shared and 107 API tests passed**. All 8 database settlement tests and the new full faculty-grading integration test also passed separately against PostgreSQL.
- `pnpm typecheck`: passed across all workspaces.
- `pnpm build`: API, portal, database package, shared package, and vitrine passed.
- Fresh PostgreSQL 16 validation applied all 41 migrations successfully.
- Prisma reports a non-blocking warning that `package.json#prisma` must eventually move to `prisma.config.ts` before Prisma 7.

Latest deployment verified on 2026-08-10:

- Staging: commit `edfa4fb`, API task definition `daust-staging-api:86`, portal `daust-staging-portal:47`; migration/reference tasks, rollout, and health checks passed.
- Production: commit `deae83a`, API task definition `daust-prod-api:81`, portal `daust-prod-portal:44`; migration/reference tasks, rollout, and health checks passed. A signed-in production smoke rendered `/faculty/schedule` with the expected navigation/empty state and no console warnings or errors.
- The `material-delete-reorder` work was merged and deployed with the transcript release. Exact reorder validation, deletion audit metadata, split-origin file links, and accurate destructive-action copy are included.

All intended transcript/material application and infrastructure changes are committed and reproducible from Git. Unrelated local screenshots and design references remain untracked and must be preserved. Never commit AWS sessions, passwords, bank details, or provider secrets.

## Next Actions

1. Verify the two Moussa Thiao identities, delete the confirmed unused duplicate, then resolve the two HSS assignments. Assign the sixteen intentionally TBA sections as staffing decisions are made.
2. Decide the two catalog-title discrepancies.
3. Enter the approved bank fields in Billing Admin, confirm the existing Finance recipient, enable wire payments globally, and complete a controlled submission/approval/rejection test.
4. Resolve the 23 held parent-payment rows: approve authoritative student numbers, decide the exact duplicate cheque, correct the two malformed dates, and decide how the two above-bill amounts should be represented. Then run the same idempotent preflight/import and verification.
5. Re-upload the four missing legacy news images and any missing faculty portraits, then verify their S3-backed URLs.
6. Complete the Official Student ID and Resolution Status columns for the 106 names in `Historical_Students_Identity_Mapping.xlsx`. The six legacy database workbooks are password-protected and may supply the authoritative IDs.
7. Build a new manifest against the historical-only workbook and its distinct hash, review the dry-run totals, then execute one production import with `CONFIRM=1` and verify its batch, entry, policy, and audit counts.
