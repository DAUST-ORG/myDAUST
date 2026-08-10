# Production and Delivery Status

Production last verified: **2026-08-10**. This page is the operational handoff for recent production data work and deployments. `TODO.md` remains the broader product backlog.

## Status Definitions

- **Production verified** means the behavior or data was checked on `my.daust.net` or `daust.net`.
- **Deployed but disabled** means the feature is live but hidden behind configuration.
- **Import blocked** means the application is deployed, but the data import has made no database changes because a preflight safety check failed.

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

## Payments: Deployed but Disabled

The wire-transfer workflow is deployed across authenticated student billing, public bill lookup, payment links, Billing Admin, and the Finance portal.

- Bursar/admin users can configure the global bank account and notification recipients from **Billing Admin → Bank settings** or use **Finance → Wire Transfers**.
- Payers upload PDF/JPG/PNG proof up to 10 MB. Proofs use private encrypted S3 storage and authenticated streaming.
- Submissions remain pending until Finance approves or rejects them. Approval is idempotent, records reviewer evidence, applies the normal settlement allocation, and sends the standard receipt.
- Production currently reports the global switch as **disabled** and the bank fields as unconfigured. Enter approved bank details and Finance recipients before enabling it.

Remaining payment work:

- Run a controlled production submission/approval/rejection smoke test after configuration.

## Faculty Operations: Production Verified

The following fixes were promoted through staging and production on 2026-08-07 and 2026-08-10:

- **Faculty edit/delete:** Registrar → Directory can now edit a faculty member's name, email/sign-in identity, and public profile. Deletion is permanent but limited to unused records. Assigned sections must be reassigned first, and accounts with retained academic or communication activity cannot be deleted.
- **Weekly schedules:** students and faculty now share the same responsive Monday–Friday timetable. The faculty navigation includes **Schedule**, only the active term is shown, and both portals can export a recurring `.ics` calendar.
- **Faculty gradebook:** creating an assessment now transactionally creates `assigned` grade rows for the current roster. Existing assessments backfill missing rows when opened, allowing faculty to grade quizzes or exams even without a student file submission. The form now reports validation/API errors inside the modal.
- **Course materials:** faculty can reorder materials and remove a material record from a course. Reordering requires the exact section material set, and both changes are audited. Removal immediately ends portal access and cannot be restored through the portal.

No Moussa Thiao record was deleted during deployment. Production previously showed `mthiao@daust.org` as public and `mndao@daust.org` as a private duplicate; verify both identities and section assignments immediately before deleting either record.

## Transcript Ledger: Production Deployed; Historical Import Blocked

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
- The normalized workbook and blocker manifest are staged in private, encrypted, versioned S3 buckets in both environments. The source has **8,884 rows**; all **637 empty grades became `I`** (750 total `I` grades). The current manifest resolves **6,291 rows across 298 official identities** and deliberately blocks **2,593 rows across 106 unresolved names**. No transcript rows have been imported.
- The staging and production dry runs both stopped before database access with `missingCount=2593` and `ambiguousCount=0`; `CONFIRM=1` was not run. A production read-back confirmed **0 legacy-import entries, 0 import batches, 0 total transcript entries, 298 active students, and 0 archived students**.
- Registrar transcript management is live with grouped terms, summaries, Add/Edit/Void/Restore operations, catalog-match/source indicators, and mandatory audit reasons. Student output is labeled “Unofficial Academic Record.” Authenticated role smoke tests confirmed registrar access, bursar denial, student-safe output, and the production admin Transcript screen. Do not create historical enrollments as a substitute.

Validation on 2026-08-10: **22 shared tests**, **104 API tests**, and all **8 database settlement tests** passed; workspace typecheck and production build passed. All 41 migrations applied to fresh PostgreSQL 16 databases, transcript state-machine/import tests passed, and both infrastructure configurations validated. Private transcript buckets and prefix-scoped API read policies are deployed. Production health returned 200 and the new API task emitted no errors or exceptions during the smoke window.

## Public Website and Media

- The production homepage now shows exactly three news stories and exposes the complete list through **All news**.
- New uploads are stored in the private, encrypted, versioned production media bucket, so ECS replacements no longer erase them. The API task can only read/write `uploads/*`; bucket listing is restricted to that prefix. A persisted production object returned HTTP 200 after rollout.
- The public site resolves API-hosted upload URLs and displays a designed fallback instead of a broken image. Four existing news records reference legacy objects that are no longer available; those URLs now return 404 instead of an API error and must be re-uploaded from the original source images.

## Validation and Repository State

Latest local validation on 2026-08-10:

- `pnpm test`: **22 shared and 104 API tests passed**; all 8 database settlement integration tests also passed against PostgreSQL.
- `pnpm typecheck`: passed across all workspaces.
- `pnpm build`: API, portal, database package, shared package, and vitrine passed.
- Fresh PostgreSQL 16 validation applied all 41 migrations successfully.
- Prisma reports a non-blocking warning that `package.json#prisma` must eventually move to `prisma.config.ts` before Prisma 7.

Latest deployment verified on 2026-08-10:

- Staging: commit `6c9792e`, API task definition `daust-staging-api:84`, portal `daust-staging-portal:46`; migration and SIS reference loader exited 0. Registrar/student transcript access passed, bursar transcript access remained forbidden, and faculty material routes passed.
- Production: commit `63595a5`, API task definition `daust-prod-api:77`, portal `daust-prod-portal:42`; migration and SIS reference loader exited 0, both services stabilized, API health returned 200, and the signed-in admin Transcript UI rendered without console errors.
- The `material-delete-reorder` work was merged and deployed with the transcript release. Exact reorder validation, deletion audit metadata, split-origin file links, and accurate destructive-action copy are included.

All intended transcript/material application and infrastructure changes are committed and reproducible from Git. Unrelated local screenshots and design references remain untracked and must be preserved. Never commit AWS sessions, passwords, bank details, or provider secrets.

## Next Actions

1. Verify the two Moussa Thiao identities, delete the confirmed unused duplicate, then resolve the two HSS assignments. Assign the sixteen intentionally TBA sections as staffing decisions are made.
2. Decide the two catalog-title discrepancies.
3. Enter the approved bank fields in Billing Admin, confirm the existing Finance recipient, enable wire payments globally, and complete a controlled submission/approval/rejection test.
4. Re-upload the four missing legacy news images and any missing faculty portraits, then verify their S3-backed URLs.
5. Obtain authoritative student IDs for the 106 unresolved historical names (the six legacy database workbooks are password-protected), regenerate the manifest, review the identical dry-run, and only then run with `CONFIRM=1`.
6. After authoritative mappings are complete, regenerate the manifest, compare the dry-run totals, then execute the production importer once with `CONFIRM=1` and verify the batch/entry counts.
