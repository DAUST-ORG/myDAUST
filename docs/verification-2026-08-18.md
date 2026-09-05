# Full-stack verification — 2026-08-18

Every login, every portal route, walked against a freshly migrated and seeded local stack.

**Method.** Postgres 18 (throwaway instance), all 58 migrations applied via `prisma migrate deploy`,
`pnpm --filter @mydaust/db run seed`, then api :4000 + portal :3000 + vitrine :3001. Nine
identities probed at the API level (~1,100 endpoint probes including a deliberate cross-role
authorization matrix) and eight identities walked through the browser with Playwright — 63 portal
routes, 77 screenshots, judged for real data vs. empty state vs. stuck skeleton vs. error, and for
whether the numbers on the page actually reconcile.

A `communications` test account was created locally because **`seed.ts` seeds no such user**, so
`/comms` is otherwise unreachable on a fresh database.

**Headline.** No crashes, no blank pages, no data-integrity failures in the money math. The
student billing, finance, director and billing-admin screens reconcile to the franc across
independent surfaces. The real problems are (a) four unhandled 500s, (b) director payment
oversight silently blind after the PayTech removal, (c) two roles with no portal, and (d) a
cluster of UI code that asserts facts it never successfully read.

---

## Login matrix

| Account                       | Roles          | Lands on       | Result                                             |
| ----------------------------- | -------------- | -------------- | -------------------------------------------------- |
| `aissatou.diallo@daust.edu`   | student        | `/student`     | ✅ 14 routes, 0 console errors, 0 failed requests  |
| `registrar@daust.edu`         | registrar      | `/admin`       | ✅ 18 routes, 16 real data / 2 empty               |
| `bursar@daust.edu`            | bursar         | `/finance`     | ✅ 6 routes, money reconciles across 4 screens     |
| `admin@daust.edu`             | admin, bursar  | `/director`    | ⚠️ 4 routes render; `/director/payments` is hollow |
| `amadou.ba@daust.edu`         | faculty        | `/faculty`     | ⚠️ 7 routes render; sections not term-scoped       |
| `parent@daust.edu`            | parent         | `/parent`      | ⚠️ billing works; academics permanently empty      |
| `comms@daust.edu` _(created)_ | communications | `/comms`       | ✅ 8 routes, 0 console errors                      |
| `hr@daust.edu`                | hr             | **`/student`** | ❌ stranded — see H1                               |
| `it@daust.edu`                | it_admin       | **`/student`** | ❌ stranded — see H1                               |

All nine logins succeed and issue a correct httpOnly JWT. The API authorization boundary held:
every cross-role probe returned 401/403 as expected. No student, parent or faculty session
reached another role's data.

---

## High severity

### H1 — `hr` and `it_admin` are stranded, and the UI then lies about money

`portalForRoles()` (`apps/portal/src/lib/nav.ts:533`) ends with a fallback to `STUDENT_NAV` /
`/student`. Neither `hr` nor `it_admin` has a `ROLE_PORTALS` entry, so both land in the student
portal, where every data call correctly 403s.

The failure is what happens next. `apps/portal/src/app/student/page.tsx:69-96` has ten
consecutive `.catch(() => {})`, so each 403 is discarded and state stays `null`. The page cannot
distinguish "forbidden" from "empty", and renders:

- **"Not billed / No charges on account"** — a factual claim about money for an account whose
  `/api/finance/my/billing-summary` request was _forbidden_.
- "No classes scheduled." and "Nothing needs your attention." — confident claims produced by 403s.
- A **permanently stuck "Loading…"** degree-progress card (stable across reloads).
- Sidebar identity reading "Student" for an `hr`-only account.

A denied request must never render as an affirmative empty state. Fix the swallowing independently
of the routing, because the same `.catch(() => {})` pattern will mislead any student whose call
fails for an unrelated reason.

The endpoints these roles do own (`/api/hr/my/*`, `/api/academics/admin/users`,
`PATCH /api/users/:id/roles`) have no UI at all.

### H2 — Director payment oversight is blind after the PayTech removal

`listDirector()` (`apps/api/src/finance/payment-submissions.service.ts:931`) selects `Payment`
rows with `provider: "paytech", submission: null`. **PayTech was deleted on 2026-08-14.** Any
payment recorded directly — including the seeded settled payments — is invisible to
`/director/payments`.

Same root cause, worse framing: `unauditedCount()` (`:1031`) counts only `PaymentSubmission` rows
with `status: 'approved'` and `auditStatus: 'unreviewed'`, so the `/director` tile reports
**"0 unaudited payments"** as an all-clear while directly recorded payments are never counted as
needing audit. The method filter on that page also advertises Wave / Orange Money / Bank / PI-SPI
options that the `provider='paytech'` restriction can never match.

This is an oversight control reporting a false negative on a live financial system. Treat it as
the highest-priority fix in this report.

### H3 — Four unhandled 500s (all reproduced directly)

| Endpoint                                     | Trigger                                          | Cause                                                      |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `GET /api/uploads/:filename`                 | any missing file — **`@Public`, no auth needed** | ENOENT escapes as an unhandled error                       |
| `GET /api/uploads/site-media/:filename`      | any missing file                                 | same                                                       |
| `GET /api/registrar/curriculum`              | called without both query params                 | `PrismaClientValidationError`, `registrar.service.ts:1272` |
| `GET /api/academics/sections/:id/attendance` | `date` missing, empty or unparseable             | `PrismaClientValidationError`                              |

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/uploads/definitely-missing.png
500
$ curl -s -b cookie.txt -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/registrar/curriculum
500
$ curl -s -b faculty.txt -o /dev/null -w "%{http_code}\n" ".../sections/$SEC/attendance"            # 500
$ curl -s -b faculty.txt -o /dev/null -w "%{http_code}\n" ".../sections/$SEC/attendance?date=2026-09-01"  # 200
```

These share one root cause worth fixing structurally: there is **no global `ValidationPipe`** and
no coercion on `@Query`/`@Param`, so every parameter arrives as a string and reaches Prisma
unvalidated. The uploads pair should return 404.

### H4 — Editing a term silently demotes the live term to draft

`apps/portal/src/app/admin/calendar/page.tsx:152` seeds the edit form with
`status: t.status ?? "draft"` and line 164 submits it. Both seeded terms have `status = null`, so
opening "Edit term" on Fall 2026 and saving _any_ unrelated change writes `status='draft'` to the
active term. Compounding it, `termBadge()` only maps `active`/`planning`/`draft`, so every term
badge currently renders `—` and a registrar cannot tell which term is current.

The academic calendar also renders no dates at all — `GET /api/registrar/terms` returns
`startDate`, `endDate`, `addDeadline` and `dropDeadline`, and the card shows none of them, despite
add/drop deadlines being enforced server-side in `enroll()`.

---

## Medium severity

**M1 — Faculty section lists are not term-scoped.** `facultyOverview()` (`academics.service.ts:3300`)
and `mySections()` (`:3745`) query `where: { instructorId }` with no `termId`, unlike
`mySchedule()` (`:3556`) which filters correctly. A prior-term section therefore appears on Grade
Entry, Gradebook, Attendance and Materials — all write-capable — and `CourseTabs.tsx` renders each
pill as `courseCode · sectionCode`, so two `CSC 101 · A` sections from different terms are
visually identical. A faculty member can enter grades against last term's section without any
signal.

**M2 — An unrecorded attendance session is indistinguishable from a fully-present one.**
`academics.service.ts:1329` defaults every enrollment to `present` when no `AttendanceRecord`
exists, and the payload carries no "was this session recorded" flag. Given attendance feeds a
derived rate where a late counts as half a present, this silently inflates attendance.

**M3 — The registration catalogue does not annotate prerequisites.** `GET /api/academics/sections`
returns `prerequisites: ['CSC 101']` for CSC 201; a student with 0 earned credits sees a plain
"+ Add" with no chip, warning or disabled state. The server is correctly the gate — `enroll()`
will reject it — but the student only discovers that after trying. This is the documented
weakness of `registrationCatalog()` surfacing as a UX failure.

**M4 — Student academic headline contradicts its own breakdown.** On
`/admin/students/stu_demo_aissatou`, the Academics tab lists "CSC 101, 3 cr, completed, grade A"
directly beneath "Cumulative GPA —, Credits earned 0/300, Not yet graded". Both are technically
right: the enrollment carries a working grade, but `TranscriptEntry` is empty, and GPA is derived
only from transcript rows. The screen presents the two without reconciling them.

**M5 — GPA renders inconsistently for the same state.** `/student` and `/student/profile` print
`0.00` via `summary.gpa.toFixed(2)`; `/student/grades` and the transcript print `—`.
`/admin/student-success:186` goes further and colours an ungraded `0.00` with `gpaColor()`, so
three students appear as critical 0.00 GPAs when they simply have no graded credits.

**M6 — Faculty "Sent messages" is fake history.** `faculty/messages/page.tsx` keeps sent items in
local `useState` and never fetches thread history, so the panel resets to "No messages sent yet."
on reload.

**M7 — Course materials with no file render as dead links.** `faculty/materials/page.tsx:217`
falls back to `href="#"` when `fileUrl` is null; all three seeded CE 201 resources hit this path
and look like working links.

**M8 — Unsaved CMS edits are silently discarded on navigation.** `useDraft()` is instantiated
independently on each of the six CMS screens with no shared provider, so moving between
`/comms/site` and `/comms/directors` refetches the server draft and drops unsaved work. The same
content is editable from two places with no cross-talk.

**M9 — Parent academics are permanently empty.** `childGrades()` derives from `TranscriptEntry`
(empty locally) and `childAttendance()` (`guardians.service.ts:987`) filters enrollments to
`status='enrolled'`, which neither seeded child has. Both pages are structurally correct but can
never render for this data.

**M10 — Fabricated forecast fallback.** `finance/budget/page.tsx:894` falls back through
`forecast?.projectedClosingBalanceXof ?? forecast?.months.at(-1)?.balanceXof ?? currentClosing`
when the forecast POST 400s (no approved budget), presenting today's closing balance as a
projection. The page also fires that guaranteed-400 request on every load even when the preceding
GET already reported no approved budget.

**M11 — Payment is a dead end for every payer.** Student, parent and public billing all render a
single rail ("Wave, Orange Money, or bank") and then "No proof-based payment method is enabled
right now": `GET /api/finance/payment-methods` returns `[]` and `pi-spi/config` is `{enabled:false}`.
Expected locally, but the UI should not preselect a method it cannot service, and a seeded
configured method would make the local rail testable.

---

## Low severity and polish

- Sidebar badge "Registration 6" vs. 5 sections listed — `nav.controller.ts:119` counts
  `section.count({where:{status:'open'}})` with **no term filter**.
- "Application count" means three different things across the sidebar badge (5), dashboard tile
  (5), admissions KPI (7) and queue table (6 rows).
- Raw payload keys leak as labels: "Emergency name2" / "Emergency phone2" (student profile),
  "bank Name" / "account Number" / "iban" / "swift" (payment-reviews settings, from
  `key.replace(/([A-Z])/g,' $1')`), `privacySections (14)` as a CMS group header.
- Raw `communications` role slug shown unlabelled on `/admin/staff` — the role label map was never
  updated when the role was added.
- Raw guardian UUID printed as an identifier on `/admin/parents`.
- `/student/documents` and `/student/documents/transcript` have **no `PAGE_META` entries**, so both
  render the header "Dashboard · Academic overview · Fall 2026" above a transcript. Neither has a
  sidebar entry; they are reachable only by direct URL.
- The printable transcript prints the internal flag `(fallback)` in
  "Catalog 2026–2027 rev. 1 (fallback)" on a document a student hands to a third party.
- Directory section labelled "Staff & administration — non-teaching accounts" lists all six
  faculty and the parent account.
- Filtered-empty lists reuse the never-created copy: `/admin/offerings` "Closed (0)" says "No
  course sections yet" while 5 open sections exist; `ApprovalRequestList.tsx:510` uses a binary
  ternary so the "All my requests" tab shows the History headline.
- `CollectionsTimelineChart.tsx:176,183` — duplicate React keys and, on an all-zero year,
  `maxValue = Math.max(1, …)` produces axis ticks `0,0,1,1,1`.
- Rounding inconsistency on `/billing-admin`: "36M" in the KPI tile vs "36.07M" in the aging strip
  directly beneath, same figure (36,073,334).
- Student dining meal statuses are wrong for anything not strictly in the future
  (`student/dining/page.tsx:42` picks the first period whose _start_ is ahead), so a lunch being
  served right now reads "Upcoming".
- `GET /api/nav/context` returns `meta: null` for bursar, communications, hr and it_admin —
  `NavController.meta()` only has branches for student / parent / faculty.
- Every route double-fetches (`/api/auth/me`, `/nav/context`, `/academics/current-term` 2–4× per
  navigation). `AppShell` and `PortalShell` each call `getMe()` independently; the rest is likely
  React StrictMode in dev, worth confirming against a production build.

---

## Seed-data problems (not code defects)

- **No `communications` user is seeded**, so `/comms` is unreachable on a fresh database.
- Every student's program reads "B.Sc. Computer Engineering", including `DAUST-EE-24-0210` and
  `DAUST-CS-25-0033` whose student numbers encode EE and CS.
- `TranscriptEntry` is empty for all students, so every GPA/credit/degree surface is `—` while
  enrollments carry working grades. This is what makes M4 and M9 visible.
- The seeded bursar announcement says "Tuition installment 1 due Sept 15" while billing shows
  25 août 2026, and tells students to pay "via Wave, Orange Money, or card from the Billing page",
  which currently cannot be done.
- Finance notification recipient is `finance@daust.edu.sn`, inconsistent with the `daust.org` /
  `daust.edu` domains used everywhere else after the cutover.
- Seeded CMS imagery is mismatched to slot labels ("Campus – dorms" shows camera equipment,
  "Campus – lab" shows a boat).
- Two of three seeded startups have English FR link labels.
- Active catalog year 2026–2027 has null `startsOn`/`endsOn`.

---

## What was verified working

- All nine logins, JWT issuance, cookie flags, and role→portal routing for the seven roles that
  have a portal.
- **The cross-role authorization matrix.** Every attempt to reach another role's data returned
  401/403. The only leakage is via routes carrying no `@Roles` at all (below).
- Money reconciliation across independent screens: fee schedule 4,285,000 × 9 = 38.565M expected,
  2,491,666 collected, 36,073,334 outstanding — consistent between the finance dashboard KPIs,
  aging buckets, accounts table, budget workbook, director tiles and billing-admin.
- Student billing arithmetic to the franc: 4 × 1,071,250 = 4,285,000; balance 2,785,000 implies
  1,500,000 paid, leaving exactly the 642,500 shown in the pay panel and the dashboard to-do.
- The degree-audit guarantee: category targets 102 + 132 + 36 + 18 + 12 = 300 matching the
  300-credit headline exactly — the documented "headline can never disagree with the breakdown"
  invariant holding in practice.
- Read-only interactions across portals: catalogue filters, student-success level filter,
  admissions queue filter, dining plan tab, guardian tab, faculty course-pill switching, attendance
  date change, approvals tab refetch, budget workbook Actual toggle.

### Undecorated routes reachable by any authenticated session

`RolesGuard` returns `true` when no `@Roles` metadata is present. Confirmed with a
`communications`-only cookie — a role documented as having _no SIS data access_:

```
GET /api/comms/contacts          200
GET /api/academics/sections      200   (full live section catalogue)
GET /api/academics/current-term  200   (term dates + add/drop deadlines)
GET /api/campus/library          200
GET /api/campus/events           200
```

Not a privilege-escalation bug — it is the documented fail-open default doing exactly what it
says. Decide per route whether to add `@Roles` or accept it as any-session.

---

## Reproducing this

```bash
docker compose up -d
export DATABASE_URL="postgresql://mydaust:mydaust@localhost:5432/mydaust?schema=public"
pnpm --filter @mydaust/shared run build
pnpm --filter @mydaust/db run build
pnpm --filter @mydaust/db exec prisma migrate deploy
pnpm --filter @mydaust/db run seed
pnpm --filter @mydaust/api dev &
pnpm --filter @mydaust/portal dev &
```

Screenshots from this run are in `.playwright-mcp/verify/` (gitignored), named
`<role>__<route>.png`.
