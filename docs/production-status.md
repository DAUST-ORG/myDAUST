# Production and Delivery Status

Last verified: **2026-08-07**. This page is the operational handoff for recent production data work and the associated local implementation. `TODO.md` remains the broader product backlog.

## Status Definitions

- **Production verified** means the behavior or data was checked on `my.daust.net` or `daust.net`.
- **Deployed but disabled** means the feature is live but hidden behind configuration.
- **Local worktree** means code exists and passes local validation, but contributors must not assume every uncommitted line is reproducible from Git.

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
- Run the database-backed settlement integration suite; its eight tests are skipped without `TEST_DATABASE_URL`.
- Review and commit the wire, PI-SPI, migration, S3/IAM, and portal changes in coherent commits so production can be reproduced from Git.

## Faculty Operations: Production Verified

The following fixes were promoted through staging and production on 2026-08-07:

- **Faculty edit/delete:** Registrar → Directory can now edit a faculty member's name, email/sign-in identity, and public profile. Deletion is permanent but limited to unused records. Assigned sections must be reassigned first, and accounts with retained academic or communication activity cannot be deleted.
- **Weekly schedules:** students and faculty now share the same responsive Monday–Friday timetable. The faculty navigation includes **Schedule**, only the active term is shown, and both portals can export a recurring `.ics` calendar.
- **Faculty gradebook:** creating an assessment now transactionally creates `assigned` grade rows for the current roster. Existing assessments backfill missing rows when opened, allowing faculty to grade quizzes or exams even without a student file submission. The form now reports validation/API errors inside the modal.

No Moussa Thiao record was deleted during deployment. Production previously showed `mthiao@daust.org` as public and `mndao@daust.org` as a private duplicate; verify both identities and section assignments immediately before deleting either record.

## Public Website and Media

- The production homepage now shows exactly three news stories and exposes the complete list through **All news**.
- New uploads are stored in the private, encrypted, versioned production media bucket, so ECS replacements no longer erase them. The API task can only read/write `uploads/*`; bucket listing is restricted to that prefix. A persisted production object returned HTTP 200 after rollout.
- The public site resolves API-hosted upload URLs and displays a designed fallback instead of a broken image. Four existing news records reference legacy objects that are no longer available; those URLs now return 404 instead of an API error and must be re-uploaded from the original source images.

## Validation and Repository State

Validated locally on 2026-08-07:

- `pnpm test`: **89 passed**, 8 database integration tests skipped, including new faculty-deletion and gradebook-roster coverage.
- `pnpm typecheck`: passed across all workspaces.
- `pnpm build`: API, portal, database package, shared package, and vitrine passed.
- Prisma reports a non-blocking warning that `package.json#prisma` must eventually move to `prisma.config.ts` before Prisma 7.

Deployment verified on 2026-08-07:

- Immutable application tag: `faculty-20260807-v1`.
- Staging: API task definition `daust-staging-api:82`, portal `daust-staging-portal:45`; migration and SIS reference loader exited 0; API, portal, public site, registrar faculty directory, faculty schedule, student schedule data, wire configuration, and gradebook roster contracts passed smoke tests.
- Production: API task definition `daust-prod-api:73`, portal `daust-prod-portal:40`; migration and SIS reference loader exited 0; both ECS services reached a completed rollout with one healthy task.
- Production smoke checks returned HTTP 200 for API health, login, faculty schedule, homepage, news, public faculty, and wire configuration. The admin directory returned 18 faculty records with assignment counts.

The worktree contains substantial uncommitted application, migration, infrastructure, documentation, and screenshot changes. Preserve unrelated files, review `git diff`, split commits by feature, validate staging, then promote to production. Never commit AWS sessions, passwords, bank details, or provider secrets.

## Next Actions

1. Verify the two Moussa Thiao identities, delete the confirmed unused duplicate, then resolve the two HSS assignments. Assign the sixteen intentionally TBA sections as staffing decisions are made.
2. Decide the two catalog-title discrepancies.
3. Enter the approved bank fields in Billing Admin, confirm the existing Finance recipient, enable wire payments globally, and complete a controlled submission/approval/rejection test.
4. Re-upload the four missing legacy news images and any missing faculty portraits, then verify their S3-backed URLs.
5. Import the manually created staging media/wire buckets into OpenTofu state before the next staging infrastructure apply.
6. Review and split the dirty worktree into reproducible feature commits; rerun the complete test, typecheck, build, Prisma migration validation, and infrastructure plans.
