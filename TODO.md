# myDAUST — Remaining Work

> Current operational status, recent production data changes, and immediate handoff actions are maintained in [`docs/production-status.md`](docs/production-status.md). This file retains the broader historical product audit and should not be used alone to infer deployment state.

Synthesized 2026-06-28 from a full 9-agent completion audit of the codebase vs the approved build plan and all 7 design prototypes. **Phases 1–5 are built and verified locally** (86 deliverables confirmed with evidence; all live endpoint checks 200/201). What follows is everything that is _not_ done, ordered by how much it matters.

Legend: 🔴 defect/debt in built code · 🟠 plan item not built · 🟡 design-parity gap · ⚪ decision needed

- [x] **Deploy payment-plan-aware balances and A/R aging (production 2026-08-11)** — promoted through PRs `#16`–`#18`. Staging runs commit `6935a05` at API 90 / portal 49; production runs commit `7016794` at API 85 / portal 46. Migration, reference loading, health checks, signed-in smoke tests, and the permanent post-rollout reconciliation gate passed in both environments with 0 stale rows remaining.

## 2026-08-12 Full-Package / Director Release (Production)

- [x] Versioned 4,285,000 XOF tuition + housing + cafeteria schedules, proportional component accounting, durable payment provenance, and dry-run-first active-student conversion.
- [x] Generic protected Finance approval registry, Director Overview/Approvals, curated per-admin widgets, and bursar request history.
- [x] Expected-versus-collected cumulative timeline with approved schedule, actual cash, accessible data table, and dashed run-rate forecast.
- [x] Canonical transcript view with semester GPA plus audited, watermarked, server-generated student/staff PDFs.
- [x] Authenticated multi-child guardian billing/payment/wire/receipt flow with scoped authorization, truthful invite lifecycle, and stale-request protection.
- [x] Course Catalog/Programs navigation order, Course Sections copy, and direct public-site myDAUST portal link.
- [x] Promoted to staging and production: immutable production commit `fa83fb5`, deploy run `31591314155`, encrypted pre-conversion snapshot, administrator-approved schedule revision 2, 298-account conversion with zero unresolved, exact component/payment reconciliation, and idempotent rerun.
- [x] Deploy the interactive Finance chart enhancement: series toggles, rich crosshair tooltip, pinned selection, keyboard date navigation, and accessible table/slider fallback.
- [x] Deploy per-student plan approvals and restore-to-standard, billed/remaining columns, special-account flags, and compact paginated Registrar rosters. Staging run `31598725037` stabilized at API 104 / portal 56; production run `31600961458` stabilized at API 89 / portal 48 and passed read-only role smoke.

## 0 · SIS redesign — remaining backend gaps (audited 2026-07-21)

All five portals now follow `design/Student information system design (1)`. These are
the design elements that could not be built because the backend has no such
endpoint or field. Each names what is required.

- [ ] 🟠 **Registrar broadcast composer** (`/admin/messages`) — the `Broadcast` model exists in the schema with **zero** API references. Needs `POST`/`GET /comms/broadcasts` with `{audienceType: individual|year|program|all, audienceValue, subject, body}` fanning out into `Thread`/`Message`. Biggest missing capability; the page is currently just the shared inbox. (Faculty already has per-section broadcast via `POST /comms/sections/:id/broadcast`.)
- [ ] 🟠 **RBAC matrix** (`/admin/staff`) — no permission model or endpoint exists; the page is a read-only staff list under a "Roles & Permissions" label. ⚪ Also needs a decision on the design's "Advisor" role, which is absent from `APP_ROLES`.
- [ ] 🟠 **Security & System** (`/admin/settings`) — the design's 12 toggles have no `SystemSetting` model and, more importantly, no enforcement. Do not ship decorative switches.
- [ ] 🟠 **Student Success** — needs a per-student `level` on the payload (`warnStudent` hardcodes `level:"warning"` though the column exists), `StaffWatch` endpoints for the follow/star panel (model exists, zero usages), and a warnings-history endpoint.
- [ ] 🟠 **Grading schemes are read-only** — `GradeScaleRow` needs write endpoints for add/edit row.
- [ ] 🟠 **Rule engine prerequisites** — `setCourseRule` has no `prerequisites`/`corequisites` keys, so the prereq chips cannot be edited.
- [ ] 🟠 **Grade approvals** — needs a `graded` count and per-student grades to show "{n}/{m} graded" and the grade chips.
- [ ] 🟡 **Applicant record is much thinner than the design** — the form captures ~20 fields, `createApplicant` takes 6. ⚪ Stage vocabulary also differs (`submitted/review/interview/offer/accepted/rejected` vs the design's Applied/Documents/Admitted/Confirmed) — pick one.
- [ ] 🟡 **Student record + documents** — the design's ~35-field record and 6 PDF document slots are unbacked. There is also **no student invite flow** (only `GuardianInvite`), so any "password-setup email sent" copy on the students screen would be untrue today.
- [ ] 🟡 **Invoices have no human-readable number** — the finance Billings tab shows a truncated uuid where the design shows `BILL-2026-001`. Needs a nullable `Invoice.number` plus a generator.
- [ ] 🟡 Smaller CRUD gaps: department delete, parent edit/delete (and expose guardian `id`), calendar event `PATCH`/`DELETE` + term status.
- [ ] 🟡 **Unbacked student screens** — housing move-in checklist and profile documents tab. (Dining is backed as of 2026-08-24: the console returned and the student screen shows a derived entrance verdict.) Each needs a model or endpoint that does not exist. Weekly student/faculty schedules and `.ics` export are production-deployed; the student feed is active-term scoped as of 2026-08-10.
- [ ] ⚪ **"View as" is portal-scoped, not impersonation** — it lists only the portals the admin's own roles grant, because student/faculty/parent endpoints are scoped to _your own_ record. A true "view as this student" needs a session subject + audit trail. Decide whether to build it.
- [ ] ⚪ **Kept but unreachable from the new nav:** `student/documents` (transcript + enrollment verification — the only working transcript output), `student/assignments` (linked from the dashboard To-do), `student/id` (signed QR campus pass). Decide whether to relocate them into the design's screens or retire them.
- [ ] 🔴 **Staging carries no demo parent** until one is provisioned through the registrar flow; the seeded `parent@daust.edu` exists locally only.

## 1 · Correctness & hygiene — ✅ FIXED 2026-06-28 (fix-pack, all verified live)

- [ ] 🔴 **`apps/api/uploads/` is committed to git** — _the one remaining item; user action (git is user-managed):_ add `apps/api/uploads/` to `.gitignore` and run `git rm --cached "apps/api/uploads/c2a5d2cd-10ef-4f42-8674-957764b172e2.txt"`.
- [x] ~~Reconciliation cancels instead of polling~~ → reconciliation is now **non-destructive**: it surfaces stale pendings for bursar review; new audited `confirm` (settles allocations like an IPN) and `cancel` actions in the collections UI. Poll-PayTech upgrade still blocked on PayTech exposing a status API.
- [ ] 🔴 **PayTech key rotation** — _user action:_ rotate in the PayTech dashboard, update `.env`.
- [x] ~~No add/drop window~~ → `Term.addDeadline`/`dropDeadline` added, enforced in enroll/drop (verified 400s past deadline); registrar `admin-drop` bypasses with audit.
- [x] ~~No test suite~~ → **Vitest stood up: 31 tests** (shared: scholarship tiers, XOF splits, zod input refines · api: PayTech HMAC verify incl. forged/tampered, campus pass sign/verify, computeGpa, zod filter 400+delegation). Integration tests (seat-lock, IPN idempotency vs DB) still open — next tier.
- [x] ~~Dining settlement display-only~~ → director overview now aggregates paid dining orders into **3600** and paid application fees into **4200** (verified live: 3600=1,000 / 4200=30,000 after signed IPNs).
- [x] ~~Dining payOrder skips the rail~~ → **superseded.** PayTech was removed 2026-08-14; dining weekend orders now use the proof-based `PaymentSubmission` rail (`source: "dining_order"`). The order stays `cart` until Finance verifies evidence.
- [x] ~~Expenses create+list only~~ → PATCH/DELETE endpoints + edit/delete UI, audit-logged.

## 2 · Missing write-paths & role surfaces — ✅ FIXED 2026-06-28 (all verified live)

- [x] **Faculty record correction tools (local, 2026-08-07)** — Registrar Directory can edit faculty identity/profile fields and permanently delete only unused records; assignment and retained-activity guards prevent orphaned history.
- [x] **Faculty/student weekly schedules (production, 2026-08-10)** — active-term calendars are present in both navigation surfaces, exportable as `.ics`, and the student API now returns a single active-term-scoped payload.
- [x] **Continuous-assessment roster rows (local, 2026-08-07)** — new gradebook items create scoreable rows transactionally, and existing items backfill missing rows when opened.

- [x] **Announcement compose** — `POST /comms/announcements` (admin/registrar/bursar/SA/HR/faculty) + composer UI on `/admin/announcements`; student compose correctly 403.
- [x] **Role management** — `PATCH /users/:id/roles` (it_admin/admin), APP_ROLES-validated, **audit-logged**, self-edit lockout guard (400); role-editor UI in admin Settings.
- [x] **Registrar surfaces** — `/admin/schedule` master week-grid + sections table; audited admin-drop.
- [x] **Admin student detail** — `/admin/students/[id]`: profile, GPA/credits, balance, enrollments with admin-drop.
- [x] **Innovation team/advisor** — add/remove member (by email) + set-advisor endpoints and UI on project detail.
- [x] **Housing money on the rail** — room assignment can bill a housing fee as an Invoice tagged **3700**, riding the existing billing/payment rail (verified: invoice lands in A/R).
- [x] **Application fee in Apply flow** — public `POST /applications/:id/fee-checkout` → PayTech; IPN ref `APPFEE-<id>` flips `feePaid` (verified end-to-end); "Pay application fee" button on the vitrine success screen; fee status column in the admissions funnel.
- [x] **Payment-plan templates** — `PLAN_TEMPLATES` + exact-sum `splitEvenXof` in shared; template picker prefills the plan form (unit-tested).

## 2b · Payments (2026-07-04)

- [x] Official payment plan wired: fees (tuition 2 975 000 / housing 680 000 / cafeteria 630 000 per year) in shared + DB (local AND staging, audited PATCHes); quarterly template prefills official due dates (Inscription, Nov 5, Jan 5, Mar 5). Reference designs: design/references/.
- [x] **Payment links**: PaymentLink model; bursar/admin CRUD (audited) at /admin/finance/links + quick-create on the student account page (prefills open invoice); public branded pay page /pay/[token] (navy split card, OM/Wave/Card via PayTech, bank-transfer instructions + admin mark-paid); PLINK- refs on the verified IPN rail; invoice-linked links allocate to installments (verified: balance 2.0M→1.5M, inst 1 partial); standalone links land on their cost center in the director overview. Deployed to staging (images db1b1f1-07042148).
- [x] **Exact parent-payment reconciliation (production, 2026-08-10)** — 31 exact SIS/invoice matches totaling 27,434,950 XOF were imported with private source evidence, deterministic references, oldest-due-first allocations, and audits; repeat preflight is idempotent.
- [ ] ⚪ **Resolve 23 held parent-payment rows** — 21 non-exact identities, one exact duplicate cheque, and one exact amount above the bill remain unposted. Finance/Registrar must approve official IDs, malformed dates, duplicate handling, and above-bill treatment before the follow-up import.

## 3 · Track P platform services (remaining)

- [ ] 🟠 **Real-time layer** — polling shipped on the dining surfaces (station feed 4s, `/dining/live` 10s, both suspended while the tab is hidden); the inbox still only updates on manual interaction. A WS gateway still needs sticky sessions at the ALB. Cheapest: `setInterval` polling on scanner feed + inbox; proper: WS gateway (needs sticky sessions at deploy).
- [ ] 🟠 **Notifications** — topbar bell + panel now exists (announcements-fed, localStorage unread); still no Notification model/endpoint for per-user events (grades posted, payment received, order ready).
- [ ] 🟠 **Transactional emails not yet wired:** order-ready (dining) and submission-alert (innovation advisor). Email templates are inline strings — extract a branded layout when convenient.
- [ ] 🟠 **QR remaining scopes:** order-pickup QR (kanban is manual) and QR seals on printable transcript/enrollment docs.

## 4 · Track D design fidelity (SWEPT 2026-07-04 — shell rebuild + 6-agent parallel build; all typechecks green, endpoints + key screens live-verified)

**Shell (all portals)**

- [x] Functional global search — Topbar.tsx: ⌘K / "/" focus, nav destinations + role-scoped data (admin→students, faculty→classes, student→courses), Enter opens top hit
- [x] Dark mode — `:root[data-theme="dark"]` token overrides + hardcoded-white sweep to `var(--surface)` + Moon/Sun toggle in topbar (localStorage `daust-theme`)
- [x] Announcements bell + panel (unread dot vs localStorage last-seen, latest 6, view-all link) — full Notification model still Track P
- [x] Topbar user menu — avatar, roles, **portal switcher** (covers the "Viewing as" need for multi-role users), sign out; term+date chip added
- [x] Branded login screen (split navy hero + tri-dash; dev hints collapsed into <details>)
- [x] Responsive basics — <900px off-canvas sidebar + hamburger + scrim; login hero collapses <820px (full phone-variant parity NOT done — spot-check pages on mobile later)
- [ ] 🟡 "Viewing as" impersonation (true view-as-another-role for admins; portal switcher only covers own roles)

**Dashboards**

- [x] KPI sparklines (Sparkline.tsx on admin tuition/money-out tiles) + expense-share Donut.tsx; KPI overflow fixed with formatXofCompact
- [x] Student dashboard: Today timeline (client-side from enrollments), ID preview card, Action items (unpaid installments + unsubmitted assignments)
- [x] Grades page term filter

**Per portal**

- [x] Faculty: Materials tab (kind chips, publish toggles, upload + add-by-title), Posts tab (compose + pinned list), gradebook CSV export, dining page (+faculty role on /dining/menu), documents page, profile page — office-hours model still open (advising slots static)
- [x] Dining: student Home hub tab (next meal, plan chip, today's scans via GET /dining/my/today), dish image thumbnails + imageUrl endpoints, scanner manual override (audited POST /dining/scan/override), console Students + Reports tabs (derived aggregates)
- [x] Student Affairs: international onboarding checklists (OnboardingCase + task toggle), events board (Event extended: organizer/attendees/budget/status), study-abroad seats (AbroadProgram), maintenance triage (MaintenanceTicket)
- [x] Innovation: global passes (GlobalTask/ProjectGlobalTask + completion matrix + create), ImpactCountdown card, tabbed project detail (Overview/Global passes/Submissions/Team), student passes card
- [x] Vitrine: research, startups, campus, alumni pages + nav
- [x] Admin: housing (read-only director mirror → manage in SA) + library (add/toggle via new campus endpoints) — placeholders gone
- [ ] 🟡 Student: settings page (EN/FR), profile/notification preferences
- [ ] 🟡 Vitrine: applicant status page
- [x] Dining console settings tab (2026-08-24) — service windows, cost per meal, weekend ordering + cutoff, and the two entrance rules, all on `AppSetting["dining.settings"]` and all read by something.
- [ ] 🟡 Full mobile pixel-parity pass across pages (only shell-level responsive done)
- [x] Deployed to staging 2026-07-04 — images db1b1f1-0151, track_d migration + seeds applied to RDS, smoke-verified over ALB (branded login, SA international, faculty materials)

## 5 · Phase 6 — intelligence + integration (app-level)

- [ ] 🟠 Housing assignment optimizer (auto-suggest rooms; heuristic first — roommate matcher pattern exists to build on)
- [ ] 🟠 Event conflict detector (needs SA events board first)
- [ ] 🟠 Conduct routing/triage (auto-assign officer by type/severity)
- [ ] 🟠 Roommate matcher upgrade (current weighted heuristic → richer scoring)
- [ ] 🟠 Budget reallocation suggestions + advanced analytics
- [ ] 🟠 **Google Workspace OIDC** (replace password login; keep guards/roles)
- [ ] 🟠 ERP journal export endpoint (summarized entries seam)
- [ ] 🟠 Dedicated Wave / Orange Money providers behind `PaymentProvider`

## 6 · Track B — infrastructure (STAGING LIVE 2026-07-03 → http://daust-staging-alb-1764546181.us-east-1.elb.amazonaws.com)

- [x] OpenTofu bootstrap + modules (network/ecr/alb/ecs-service/rds/secrets) + **staging applied** — ARM64 Fargate, path-routed ALB (same-origin), RDS migrated+seeded, secrets in SM, adversarially reviewed pre-apply (~$71/mo now billing)
- [x] .gitignore hardened (tfvars ignored, examples + tofu lockfiles committed); repo committed 2026-07-04 in 7 thematic commits (unsigned — ssh key not available non-interactively)
- [x] HTTPS via Cloudflare Tunnel (2026-07-04): https://daust-staging.azt.dev — cloudflared connector as ECS service (egress-only, token in SM), COOKIE_SECURE=true, origins + PayTech IPN/success/cancel on the https URL. Note: cloudflared cert is scoped to azt.dev (not azertica.com); Universal SSL also limits depth, so staging lives at daust-staging.azt.dev. Later: lock/remove direct ALB :80 (still open), delete stray daust-staging.azertica.com.azt.dev CNAME (⚪ dashboard)
- [x] Vitrine live (2026-07-04): https://daust.azt.dev — next output:export + trailingSlash → S3 website bucket (modules/static-site) → same daust-staging tunnel, host-routed via baked config (infra/tunnel: daust-staging.azt.dev→ALB, daust.azt.dev→S3 with httpHostHeader). Connector now runs creds-file mode (TUNNEL_CREDS in SM, daust-tunnel:v1 in ECR). CORS verified from the vitrine origin. Redeploy = rebuild export + aws s3 sync.
- [ ] 🟠 Slim the api image (2.6GB full-workspace copy → pnpm deploy prune)
- [ ] 🟠 Flip Secrets Manager recovery_window 0 → 7 once staging stabilizes
- [x] **PROD LIVE (2026-07-05)**: https://my-daust.azt.dev (portal+api) + https://daust.azt.dev (vitrine, prod api build). infra/environments/prod: VPC 10.61/16, db.t4g.small (deletion protection + final snapshot + PITR), secrets daust-prod/*, tunnel daust-prod (id 1510130a) as ECS connector (daust-tunnel:prod-v1), images 30195cd-07050127 (post-redesign) on BOTH envs. Prod DB migrated + FULL DEMO SEED (wipe before real launch!). daust.azt.dev still routes via the staging tunnel/bucket (synced with prod build) — flip to prod connector after deleting the CNAME in the CF dashboard (⚪ user) then `cloudflared tunnel route dns daust-prod daust.azt.dev` + resync prod bucket. RDS publicly_accessible (SG-locked) until CI/bastion owns migrations. ~$180/mo total now.
- [ ] 🟠 CI/CD: GitHub Actions + OIDC (repo: DAUST-ORG/myDAUST — deferred by user 2026-07-05; design agreed: ci.yml typecheck+tests, deploy-staging.yml path-filtered images→ECS + vitrine→S3, cicd tofu module for OIDC role, ubuntu-24.04-arm runners)
- [ ] 🟠 Secrets to AWS Secrets Manager (PayTech, session, Resend); Cloudflare scoped API token (⚪ create)
- [ ] 🟠 Sentry (errors/tracing/logs + cron monitors on finance jobs — code comments already reference it) + PostHog (analytics/flags/replay, masked)
- [ ] 🟠 BullMQ/Redis worker tier (reconciliation + reminders move off @nestjs/schedule)
- [ ] 🟠 Rate limiting (@nestjs/throttler) + helmet + Cloudflare WAF rules on public endpoints (IPN, /applications, login)
- [ ] 🟠 Backup/DR: RDS retention + PITR target + a tested restore; UptimeRobot stopgap
- [x] `.env.example` — existed already (audit false-negative); augmented 2026-06-28 with SESSION_SECRET / VITRINE_ORIGIN / Resend vars
- [ ] 🟠 ARCHITECTURE.md (suggested; repo is non-trivial now)

## 7 · Decisions needed (⚪ blocked on you)

- [ ] ⚪ Late fees/penalties on overdue installments — in or out of v1?
- [ ] ⚪ Applicant accounts/status portal vs anonymous-only (current: anonymous capture)
- [ ] ⚪ GitHub org/repo + push (CI depends on it)
- [ ] ⚪ Workspace Groups → roles automation (Phase 6 OIDC design detail)
- [ ] ⚪ When to split a dedicated `admin` app (plan open item; not needed yet)

---

**Done & verified (for reference):** payments/IPN/plans/reconciliation/receipts/refunds/aging/reports/director-cockpit · seat-locked academics with gradebook→GPA loop, assignments, insights, advising · messaging, events, library, uploads, email seam, printable documents · vitrine + anonymous Apply + BAC scholarships · dining pass/QR/scanner/kanban/menus · housing/roommate/conduct/clubs/budget · innovation 7-phase tracker + review queue · HR payslips (personId-joined)/leave/booking · student ID + QR · security fixes (Zod 400 filter, payslip IDOR).

## Dining console — rebuilt 2026-08-24 (local, not yet deployed)

The three-surface DAUST-dining prototype implemented into the monorepo. **No migration** — every
model, enum and index already existed; the 2026-07-20 retirement removed the HTTP routes and the
pages, not the logic, so 13 unreachable `DiningService` methods were re-exposed rather than
rewritten.

- New `dining` role + `/dining` area (8 pages) + `/station` kiosk outside `PortalShell`.
- One entrance rule in `packages/shared/src/dining-eligibility.ts`, called by both the scanner and
  the student's own screen. `enforcePayment` ships **off**.
- Fixed while in here: `dayOnly()` now uses the Dakar calendar date (byte-identical to the old UTC
  value, no backfill); `secret()` injects `ENV` instead of reading `process.env` with a public
  fallback; `advanceOrder()` is typed and audited; `choosePlan()` reads the current term instead of
  a hardcoded "Fall 2026"; the student screen no longer says "Upcoming" for a meal being served.
- `api-dining.ts` deleted, its survivors folded into `api.ts`; ~15 dead client wrappers made live.
- Verified locally against a throwaway `mydaust_e2e` database: full verdict matrix, double-serve
  guard, override + audit, the payment gate both ways, cross-role probe (student → dining staff
  routes all 403; dining → academics/finance/registrar/comms all 401/403/404), and dining
  `planRevenue` reconciling to the franc against a direct SQL sum of cost-center-3600 allocations.

Open:

- [ ] Deploy to staging, then prod. `enforcePayment` must stay **off** until Finance has counted
      active students with `overdueXof > 0`.
- [ ] `signPass` is still a non-expiring, unscoped HMAC over `studentId`, and its only revocation
      is rotating `SESSION_SECRET` — which signs every JWT. The result overlay renders
      `Student.photoUrl` as the real anti-sharing control. A rotating token needs a separate
      `DINING_PASS_SECRET`; note any printed QR would stop working.
- [ ] Two pre-existing undecorated routes reach every authenticated session (fail-open):
      `GET /academics/current-term` and `GET /comms/contacts`. Not introduced by this work —
      students already reach both — but they should carry `@Roles`.

## SIS redesign — shipped 2026-07-20

Five portals (student, parent, faculty, registrar, finance) built to
`design/Student information system design (1)/` and deployed to prod. The dining
console, student affairs and innovation portals were retired.

Open items left by that work:

- **Drop the retired tables.** `ConductCase`, `Club`, `CoCurricularLine`,
  `RoommateProfile`, `AbroadProgram`, `OnboardingCase`, `MaintenanceTicket`,
  `Project*`, `GlobalTask*`. Nothing reads them now. **`DiningOrder*` and `MenuItem` were wrong
  on this list** — the student weekend-order tab has read and written them since the redesign,
  and the dining console now does too.
  Deliberately not done: dropping tables is irreversible and needs confirmation
  they are empty in prod first. `MealPlan`, `DiningScan`, `MenuItem`, `DiningOrder`,
  `DiningOrderItem`, `Hall` and `HousingAssignment` must be **kept** — the student Dining and
  Housing screens and the dining console read them.
- **Curriculum editor.** `Curriculum`/`CurriculumEntry` are modelled, migrated
  and seeded but have no UI yet; the design's Programs & Curriculum screen shows
  a per-year/semester course map.
- **Transcript-led grade publication (deployed 2026-08-10).** Faculty can
  submit a versioned section snapshot and the registrar queue can approve or
  return it. Submission alone does not complete enrollments or affect GPA;
  approval publishes the snapshot to the independent transcript ledger. The
  migration, API, registrar editor, and guarded S3 import CLI passed staging and
  production smoke tests. Production now contains 6,264 verified legacy entries
  for all 298 active students; 27 exact duplicates were skipped. The remaining
  2,593 rows are isolated in the identity-mapping workbook until 106 historical
  names receive authoritative student IDs (see `docs/production-status.md`).
- **Rule engine writes.** `PATCH /registrar/rules/:courseId` exists and is
  audited, but the screen is read-only — prerequisites are still seeded, not
  edited in the UI.
- **Waitlists.** `CourseRule.waitlistEnabled` is stored and displayed; no
  waitlist behaviour is implemented at enrolment.
- **Orphaned-but-live pages.** `/admin/library`, `/student/{events,documents,
library,id,assignments}` predate the redesign and are not in any nav. They
  work; decide whether to surface or retire them.
