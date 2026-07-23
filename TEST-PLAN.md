# myDAUST — Black-Box Test Plan

Comprehensive, execution-ready black-box test plan for the myDAUST SIS (all five portals
plus the public surfaces). Each screen is documented as a **Screen Spec** — exactly what it
must contain — followed by the numbered **test cases** that verify it.

- **Target environment:** staging (freely mutable, seeded). See §0.1 for hosts.
- **Sources of truth:** (1) server behaviour — guards + business rules in
  `apps/api/src/{academics,finance,guardians,...}`; (2) design — the consolidated prototype
  `design/Student information system design (1)/` and `STUDENT-DESIGN-REVIEW.md`.
- **This document does not contain automation code.** Cases are written so a later pass can
  translate them 1:1 into Playwright (UI) and HTTP (API) suites.

---

## 0. How to use this plan

### 0.1 Environment & access

| Item | Value | Notes |
|---|---|---|
| Portal (authenticated) | `https://daust-staging.azt.dev` | **Confirm** the exact staging host before running. |
| API base | `<portal-api-host>/api` | All API paths below are relative to this. Confirm host. |
| Public bill portal | `payment.<staging>/` → rewrites to `/pay-bill` | Host-based rewrite in `middleware.ts`. Confirm staging equivalent. |
| Bursar bill console | `payment.<staging>/admin` → `/billing-admin` | Same rewrite. |
| DB (for `[NEG]` setup) | staging Postgres | Needed for Appendix A snippets (insert hold, coreq rule). |

> If any host differs, only §0.1 needs editing — every case references paths, not absolute URLs.

### 0.2 Seeded logins (password for **all**: `daust-dev-2026`)

| Login | Roles | Use for |
|---|---|---|
| `admin@daust.edu` | admin **+ bursar** | Registrar+finance admin, VIEW-AS, self-lockout guard |
| `registrar@daust.edu` | registrar | Registrar portal, registrar-only boundaries |
| `bursar@daust.edu` | bursar | Finance portal, bill console |
| `hr@daust.edu` | hr | HR endpoints, role-boundary negatives |
| `it@daust.edu` | it_admin | Roles management, role-boundary negatives |
| `amadou.ba@daust.edu` | faculty | Faculty portal; instructor of all Fall sections |
| `aissatou.diallo@daust.edu` | student | Primary student (DAUST-CE-23-0142); completed CSC 101=A; partial invoice |
| `mamadou.sy@daust.edu` | student | Second student (half meal plan; pending assignment) |
| `bineta.faye@daust.edu` | student | Third student (housing pending) |
| `parent@daust.edu` | parent | Guardian of Aïssatou + Mamadou; **password already set** |

Insights cohort `stu_demo_i1..i6` (DAUST-CE-24-0301..0306) exist for faculty gradebook/insights.

### 0.3 Case-ID scheme & tags

- **ID:** `AREA-NNN` where AREA is `AUTH`, `RBAC`, `VAL`, `NAV`, `STU-*`, `PAR-*`, `FAC-*`,
  `REG-*`, `FIN-*`, `PUB-*`, `PAY`, `ENR`, `DES`. Numbers are stable; do not renumber on insert.
- **Tags** (a case may carry several): `[FUNC]` functional · `[AUTHZ]` role/ownership/security ·
  `[NEG]` negative / edge / business-rule violation · `[DESIGN]` fidelity vs prototype.
- **Result recording:** Pass / Fail / Blocked, with the observed value when it differs.

### 0.4 Reading a Screen Spec

Each spec lists: **Entry/who** (route + who reaches it), **Regions** (top→bottom UI),
**Data bindings** (API calls behind it), **States** (empty/loading/error/permission), and a
**Design note** separating fixed chrome from data-driven content (so seed differences aren't
filed as bugs). Cases follow.

### 0.5 Global conventions to assert on every authenticated screen

- **Shell chrome:** navy sidebar with tri-dash wordmark; the sidebar caption (`label`) and
  footer meta (`meta`) match the portal (§NAV). Header shows `PAGE_META.title` + breadcrumb
  with `{term}` substituted by the active term ("Fall 2026").
- **Auth gate:** hitting any authenticated route without a valid `mydaust_session` cookie
  redirects to `/login` (client `getMe()` → `.catch(router.replace("/login"))`). The API
  itself returns **401** for the same call.
- **403 handling:** a role-mismatched API call throws and surfaces **inline on the page**
  (`.catch(e => setError(e.message))`) — it is *not* auto-redirected. Message contains the
  raw `403: Insufficient role`.
- **Money format:** integer XOF, space-grouped, suffix `FCFA` (e.g. `1 071 250 FCFA`). No
  decimals anywhere.

---

## 1. Cross-cutting suites

### 1a. Authentication & session — `AUTH`

**Screen Spec — Login (`/login`)**
- **Regions:** DAUST wordmark; email field; password field with show/hide toggle; "Sign in"
  button; error slot; **demo-account chips** (6 roles) shown *only* off prod hosts
  (`my.daust.net`, `my-daust.azt.dev`) — so present on staging.
- **Data bindings:** `login(email,password)` → on success routes to `portalForRoles(roles).home`.
- **States:** idle; submitting; invalid → "Invalid email or password"; already-authenticated
  visitor to `/login` (no forced redirect away — confirm behaviour).

| ID | Tags | Precondition | Steps | Expected |
|---|---|---|---|---|
| AUTH-001 | FUNC | logged out | Login as `aissatou.diallo@daust.edu` / `daust-dev-2026` | Redirect to `/student`; sidebar caption "STUDENT PORTAL"; footer meta "Student". |
| AUTH-002 | FUNC | logged out | Login as `admin@daust.edu` | Redirect to `/admin` (admin is most-privileged in `ROLE_PORTALS`). |
| AUTH-003 | FUNC | logged out | Login as `bursar@daust.edu` | Redirect to `/finance`. |
| AUTH-004 | NEG | logged out | Submit valid email, wrong password | Stays on `/login`; error "Invalid email or password"; API `POST /api/auth/login` → **401 Invalid credentials**. |
| AUTH-005 | NEG | logged out | Submit unknown email | Same generic 401 (no account-existence oracle). |
| AUTH-006 | NEG | logged out | Submit empty email / empty password | Client blocks or API returns 400/401; no crash. |
| AUTH-007 | FUNC | logged in | Toggle password show/hide | Field type flips text/password; value preserved. |
| AUTH-008 | AUTHZ | logged in as student | Inspect `mydaust_session` cookie | `HttpOnly`; `SameSite=Lax`; `Path=/`; `Secure` on TLS host; not readable via `document.cookie`. |
| AUTH-009 | FUNC | logged in | `GET /api/auth/me` | Returns `{personId, roles[], studentId?, email, name}` for the session. |
| AUTH-010 | FUNC | logged in | Click logout (or `POST /api/auth/logout`) | Cookie cleared; next authenticated route → `/login`. |
| AUTH-011 | AUTHZ | logged out | `GET /api/academics/my/summary` with no cookie | **401** (guard), not 200. |
| AUTH-012 | FUNC | valid session | Load any authed route, then delete cookie, reload | Client redirects to `/login`. |
| AUTH-013 | NEG | — | Tamper the JWT (flip a char), call `/api/auth/me` | 401 (signature invalid). |
| AUTH-014 | DESIGN | logged out | Compare `/login` layout to prototype login | Wordmark, field order, demo chips present; token colours (navy/orange) applied. |

### 1b. Role boundary matrix — `RBAC` `[AUTHZ]`

Enumerated from the actual `@Roles(...)` lists. For each row: authenticate as the **From**
login, call the endpoint, expect **403 `Insufficient role`** (or the UI inline error). These
are the guarantees that let the nav be pruned per role.

| ID | From (roles) | Endpoint (method path) | Guard requires | Expected |
|---|---|---|---|---|
| RBAC-001 | student | `GET /api/academics/admin/students` | admin/registrar/bursar | 403 |
| RBAC-002 | student | `GET /api/finance/admin/summary` | bursar/admin | 403 |
| RBAC-003 | student | `POST /api/academics/sections/:id/grades` | faculty/admin | 403 |
| RBAC-004 | student | `GET /api/registrar/departments` | admin/registrar | 403 |
| RBAC-005 | student | `GET /api/parent/children` | parent | 403 |
| RBAC-006 | parent | `GET /api/academics/my/summary` | student | 403 |
| RBAC-007 | parent | `GET /api/finance/my/billing` | student | 403 |
| RBAC-008 | faculty | `GET /api/registrar/rules` | admin/registrar | 403 |
| RBAC-009 | faculty | `GET /api/finance/admin/accounts` | bursar/admin | 403 |
| RBAC-010 | faculty | `PATCH /api/users/:id/roles` | it_admin/admin | 403 |
| RBAC-011 | registrar | `GET /api/finance/admin/summary` | bursar/admin | 403 (registrar has **no** general finance access) |
| RBAC-012 | registrar | `GET /api/finance/admin/students/:id/account` | bursar/admin/**registrar** | **200** (explicit registrar read-only override) |
| RBAC-013 | bursar | `GET /api/registrar/grade-approvals` | admin/registrar | 403 |
| RBAC-014 | bursar | `POST /api/academics/admin/courses` | admin/registrar | 403 |
| RBAC-015 | hr | `GET /api/academics/admin/students` | admin/registrar/bursar | 403 |
| RBAC-016 | it_admin | `GET /api/finance/admin/summary` | bursar/admin | 403 |
| RBAC-017 | it_admin | `PATCH /api/users/:id/roles` | it_admin/admin | **200** (allowed) |
| RBAC-018 | student | `POST /api/config/scholarships` | admin | 403 |
| RBAC-019 | faculty | `POST /api/comms/broadcasts` | admin/registrar | 403 |
| RBAC-020 | student | `GET /api/hr/my/payslips` | staff roles (not student/parent) | 403 |
| RBAC-021 | any authed non-owner faculty | `GET /api/academics/sections/:id/roster` for a section they don't teach | `assertSectionOwner` | 403 "You do not teach this section" (admin exempt) |
| RBAC-022 | parent | `GET /api/parent/children/:studentId/grades` for a **non-linked** child | `assertGuardianOf` | 403 "You do not have access to that student" |
| RBAC-023 | student A | `POST /api/finance/my/payments` for student B's invoice | invoice ownership | 403 "Not your invoice" |
| RBAC-024 | student A | `POST /api/dining/my/orders/:id/pay` for B's order | order ownership | 403 "Not your order" |
| RBAC-025 | student A | `POST /api/comms/threads/:id/messages` on a thread they're not in | `assertParticipant` | 403 "Not a participant in this thread" |
| RBAC-026 | admin | any of the above admin-gated routes | — | 200 (positive control: admin passes) |

> **Regression guard:** RBAC-011/012 together prove the finance boundary is per-endpoint, not
> per-portal. If a future change grants registrar broad finance access, RBAC-011 fails loudly.

### 1c. Validation & input safety — `VAL` `[NEG]`

The API validates with `Schema.parse(body)`; `ZodExceptionFilter` maps failures to **400**
`{statusCode:400, error:"Bad Request", message:"Validation failed", issues:[{path,message}]}`.

| ID | Endpoint | Bad input | Expected |
|---|---|---|---|
| VAL-001 | `POST /api/academics/my/enroll` | `{sectionId:"not-a-uuid"}` | 400, issues path `sectionId`. |
| VAL-002 | `POST /api/academics/my/enroll` | `{}` (missing field) | 400. |
| VAL-003 | `POST /api/finance/my/payments` | `amountXof: -1` | 400 (XOF `int().nonnegative()`). |
| VAL-004 | `POST /api/finance/my/payments` | `amountXof: 1000.5` | 400 (must be int). |
| VAL-005 | `POST /api/finance/public/bill/checkout` | `amountXof: "1000"` (string) | 400. |
| VAL-006 | `POST /api/guardian-invites/redeem` | `password:"short"` (<10) | 400. |
| VAL-007 | `POST /api/uploads` | no file part | 400 "No file provided". |
| VAL-008 | `POST /api/uploads` | file > `MAX_UPLOAD_BYTES` | Rejected (413/400 per multer limit). |
| VAL-009 | any Zod endpoint | malformed JSON body | 400 (not 500). |
| VAL-010 | `PATCH /api/users/:id/roles` | roles not in the allowed enum | 400. |
| VAL-011 | server sanity | trigger a genuine non-Zod service error | 500 (proves filter delegates, doesn't swallow) — do only if a safe trigger exists. |

### 1d. Nav, chrome & VIEW-AS — `NAV` `[DESIGN]`

**Screen Spec — Sidebar/shell (all portals)**
- **Per role, the sidebar groups/items/order must equal `nav.ts`** (verbatim from prototype):
  - **Student** — *Academics*: Dashboard, Registration `[badge register]`, My Courses,
    Schedule, Grades, Degree Progress, Attendance · *Finance & campus*: Billing `[badge billing]`,
    Dining, Housing · *Communication*: Announcements, Messages `[badge messages]` · *Account*: My Profile.
  - **Parent** — *Overview*: Dashboard · *My child*: Grades, Attendance, Billing.
  - **Faculty** — *Overview*: Dashboard · *Teaching*: Grade Entry, Gradebook, Attendance,
    Course Materials, Messages.
  - **Registrar** — *Overview*: Dashboard, Admissions `[badge admissions]`, Students, Parents,
    Student Success · *Academic structure*: Departments, Academic Years, Programs & Curriculum,
    Course Catalog, Course Enrollment, Academic Calendar · *Policy & rules*: Rule Engine,
    Grading Schemes, Grade Approvals `[badge approvals]` · *Administration*: Faculty & Staff,
    Security & System · *Communication*: Messages.
  - **Finance** — *Overview*: Dashboard · *Finance*: Fee Schedule, Student Accounts.
- **Badges** come from `GET /api/nav/context`; failure is silently swallowed (badges are decoration).
- **VIEW-AS switcher** appears **only when `me.roles` includes `admin`**, filtered to portals
  whose roles the account holds.

| ID | Tags | Login | Steps | Expected |
|---|---|---|---|---|
| NAV-001 | DESIGN | each of the 5 role logins | Read sidebar groups + item labels/order | Exactly matches the lists above (no extra/missing items). |
| NAV-002 | FUNC | student | Observe Registration/Billing/Messages badges | Numeric badge equals live count from `/api/nav/context`; disappears at zero. |
| NAV-003 | DESIGN | registrar | Read footer meta line | "Registrar · Admin"; caption "REGISTRAR PORTAL". |
| NAV-004 | FUNC | each route | Read header title + breadcrumb | Matches `PAGE_META[route]`; `{term}` replaced by "Fall 2026". |
| NAV-005 | AUTHZ | `admin@daust.edu` (admin+bursar) | Open VIEW-AS switcher | Shows student, faculty, registrar/admin, finance (bursar); **parent shown only if applicable**. Clicking pushes to that portal's landing route. |
| NAV-006 | AUTHZ | `registrar@daust.edu` (no admin) | Look for VIEW-AS | **Absent** (not an admin). |
| NAV-007 | AUTHZ | `admin@daust.edu` | VIEW-AS → a portal whose role admin lacks (if any) | Landing loads but role-gated data calls 403 inline (authz stays server-side). |
| NAV-008 | DESIGN | any | Compare sidebar visual (navy, tri-dash logo, active-item highlight) to prototype | Matches design tokens (navy `#153b6a`, orange `#ed8425`). |

---

## 2. Student portal

Login: `aissatou.diallo@daust.edu` unless a case names another student. Landing `/student`.

### 2.1 Dashboard — `/student` — `STU-DASH`

**Screen Spec**
- **Entry/who:** role `student`; landing after login.
- **Regions:** header "Dashboard" / crumb "Academic overview · Fall 2026"; greeting
  "Welcome back, {firstName}"; stat cards (Cumulative GPA, credits, attendance %, to-dos);
  today's / upcoming schedule strip; quick links.
- **Data bindings:** `getCurrentTerm`, `getMyEnrollments`, `getMySummary`, schedule via
  `parseDayIndexes`.
- **States:** loading skeleton; new student with no enrollments → zeroed stats, empty schedule.
- **Design note vs prototype:** prototype greeting "Welcome back, Aïssatou" with 5 courses /
  91% / 4 to-dos is *seed richness* — verify card **layout** (icon top-right, sentence-case
  label per design; note staging historically uppercased labels — see `STUDENT-DESIGN-REVIEW.md`),
  not the specific numbers.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-DASH-001 | FUNC | Load `/student` | Greeting with student first name; GPA/credits/attendance cards render from live data; no console errors. |
| STU-DASH-002 | FUNC | Cross-check GPA card vs `/student/grades` | Same cumulative GPA figure (derived, consistent). |
| STU-DASH-003 | DESIGN | Compare stat-card style to prototype | Icon placement + label casing match design intent (flag if uppercased). |
| STU-DASH-004 | FUNC | Log in as `bineta.faye@daust.edu` (lightly seeded) | Empty/low states render without error. |

### 2.2 Registration — `/student/registration` — `STU-REG`

**Screen Spec** (see the approved plan's exemplar; restated abridged)
- **Regions:** header "Course Registration" / crumb "Fall 2026 · Add / drop"; status banner
  (open vs hold-blocked); catalogue cards (code, credits, title, instructor, days/time, room,
  `X/Y seats`, single action: `+ Add` / `✓ Added` / `Unavailable` / `Conflict`); search box;
  registration-plan cart with planned-credit total, credit meter vs 30, Confirm.
- **Data bindings:** `getCurrentTerm`, `getRegistrationCatalog` → `{maxCredits, currentCredits,
  holds[], catalogYear, sections[].blockedReason}`; Confirm → `enrollSection` per section.
- **States:** empty cart ("Add sections to enroll"); overload (Confirm disabled "Over N credit
  limit"); active hold (page blocked, "Blocked by a hold"); partial failure ("Some sections could
  not be added — CODE: reason"); success banner.
- **Design note:** prototype's 4-course static list (incl. a 0-seat "full" card) is illustrative;
  verify the **states/badges**, not the course identities.

| ID | Tags | Precondition | Steps | Expected |
|---|---|---|---|---|
| STU-REG-001 | FUNC | reg window open | Load page | Catalogue lists current-term sections with live seat counts; registrable ones show `+ Add`. |
| STU-REG-002 | FUNC | — | Search "CSC" | List filters by code/title/instructor. |
| STU-REG-003 | FUNC | — | Add a registrable section to cart | Card → `✓ Added` (green); cart shows it; planned credits update. |
| STU-REG-004 | FUNC | section in cart | Confirm enrollment | Success banner; section now enrolled; appears in `/student/courses` & schedule. |
| STU-REG-005 | FUNC | — | Remove a cart item before confirming | Card reverts to `+ Add`; credit meter decrements. |
| STU-REG-006 | NEG | Aïssatou completed CSC 101=A | Try to add CSC 201 (prereq CSC 101, min grade) | Allowed (prereq satisfied). Positive control for prereq path. |
| STU-REG-007 | NEG | student **without** CSC 101 credit | Add CSC 201, Confirm | Blocked; card `Unavailable`; API 400 "Missing prerequisite(s): ...". |
| STU-REG-008 | NEG | CSC 101-A & CSC 201-A share MWF slot | Add both to cart | Second shows `Conflict` + "Time conflict" badge (client self-clash), and API 409 "Time conflict with ..." if forced. |
| STU-REG-009 | NEG | cart at 28 credits | Add a 3-credit section | Confirm disabled "Over the 30-credit limit"; API `POST /my/enroll` → 400 same. |
| STU-REG-010 | NEG | section full (0 seats) | Attempt add | `Unavailable`; API 409 "Section is full". |
| STU-REG-011 | NEG | already enrolled in a section | Attempt add same | `Unavailable`; API 409 "Already enrolled". |
| STU-REG-012 | NEG | active `StudentHold` inserted (Appendix A.1) | Load page | Whole page blocked banner; Confirm "Blocked by a hold"; API 403 "Registration is blocked by an active hold (...)". |
| STU-REG-013 | NEG | `Section.status='closed'` | Attempt add | 409 "This section is closed". |
| STU-REG-014 | NEG | term `addDeadline` past (Appendix A.3 or use closed term) | Attempt enroll | 400 "add period closed". |
| STU-REG-015 | NEG | term `endDate` past | Attempt enroll | 400 "Registration is closed". |
| STU-REG-016 | NEG | coreq rule added (Appendix A.2) | Enroll the course without its coreq | 400 "Must be taken with (or after) ...". |
| STU-REG-017 | NEG | rule standingRequired above student level | Attempt add | 403 (standing). |
| STU-REG-018 | NEG | rule majorRestriction mismatched | Attempt add | 403 (major restriction). |
| STU-REG-019 | FUNC | cart has one good + one blocked section, forced via API sequence | Confirm | Partial-failure message names the failed CODE + reason; good one enrolls. |
| STU-REG-020 | AUTHZ | seat-lock: CSC 101-A cap=2 | Race two students enrolling the last seat concurrently (Appendix A.4) | Exactly one succeeds; other gets 409 "Section is full"; no oversell (count never exceeds cap). |
| STU-REG-021 | DESIGN | — | Compare card/badge states to prototype | Available/Added/Unavailable/Conflict styling matches design. |

### 2.3 My Courses — `/student/courses` (+ `/student/courses/[id]`) — `STU-CRS`

**Screen Spec**
- **Regions:** current-term course cards (code, title, instructor, schedule, grade chip when
  graded); past-terms list. Card → detail `/student/courses/[id]`.
- **Detail regions:** overview (description, meetings, instructor) + assignments list.
- **Data bindings:** `getMyEnrollments`, `getMyGrades`, `getCurrentTerm`; detail `getCourseDetail(sectionId)`.
- **Design note:** prototype gives each past-course row a "Materials" button; staging shows only
  the grade chip (documented delta in `STUDENT-DESIGN-REVIEW.md` §3 — Close). Log as design row, not bug.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-CRS-001 | FUNC | Load `/student/courses` | Current enrollments listed with schedule; past courses show grade chips. |
| STU-CRS-002 | FUNC | Open a course detail | `/student/courses/[id]` shows overview + assignments. |
| STU-CRS-003 | AUTHZ | Manually change `[id]` to a section the student isn't enrolled in | API returns error / detail refuses (ownership via enrollment); no foreign data leaks. |
| STU-CRS-004 | DESIGN | Compare rows to prototype | Note missing "Materials" button (known Close delta). |

### 2.4 Schedule — `/student/schedule` — `STU-SCH`

**Screen Spec**
- **Regions:** weekly grid (days × time), blocks per enrolled section; current-day highlight
  (staging addition, keep); "Export .ics" button top-right (**prototype has it; staging historically
  missing** — `STUDENT-DESIGN-REVIEW.md` §4).
- **Data bindings:** `getCurrentTerm`, `getMyEnrollments`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-SCH-001 | FUNC | Load page | Enrolled sections plotted at correct day/time; no overlaps for a valid schedule. |
| STU-SCH-002 | FUNC | Enroll a new section, return | New block appears. |
| STU-SCH-003 | DESIGN | Look for "Export .ics" | Present per design (flag if missing). Current-day highlight present (keep). |

### 2.5 Grades & Transcript — `/student/grades` — `STU-GRD`

**Screen Spec**
- **Regions:** header "Grades & Transcript" / crumb "Unofficial record"; stat cards
  (Cumulative GPA, credits earned, term count, **Dean's List — N terms** [design has 4th card;
  staging showed 3 — `STUDENT-DESIGN-REVIEW.md` §5]); per-term course tables with letter grades + points.
- **Data bindings:** `getMyGrades`, `getMyProfile`, `getMySummary`.
- **Derived:** GPA = Σ(points×credits)/Σcredits, 2dp; standing label (≥3.7 Dean's List, <2 Probation).

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-GRD-001 | FUNC | Load page | Per-term courses with grades; cumulative GPA computed. |
| STU-GRD-002 | FUNC | Hand-compute GPA from visible grades×credits | Matches displayed GPA exactly (derivation correct). |
| STU-GRD-003 | FUNC | Verify standing label | ≥3.7 → "Dean's List"; <2 → "Academic Probation"; else "Good Standing". |
| STU-GRD-004 | DESIGN | Count stat cards | Design expects the 4th "Dean's List — N terms" card (flag if only 3). |

### 2.6 Degree Audit — `/student/degree` — `STU-DEG`

**Screen Spec**
- **Regions:** header "Degree Audit"; program + "· Catalog {year}" subtitle (design carries
  catalog year; staging historically dropped it — §6); headline "% toward degree" +
  earned/in-progress/remaining/total; requirement-category cards (name, on-track/in-progress,
  X of Y credits, "N to go"). Design uses a 2-column grid; staging used 3 (§6).
- **Data bindings:** `getDegreeAudit` — categories from `ProgramRequirement` filtered by
  `catalogYear`; headline derived from summed category fulfilment (can't disagree with breakdown).

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-DEG-001 | FUNC | Load page | Category cards + headline %; sum of category credits reconciles to headline. |
| STU-DEG-002 | FUNC | Add earned credits (grade a course to completion elsewhere) and reload | % and the relevant category advance consistently. |
| STU-DEG-003 | NEG | Category with credits beyond requirement | Displayed credit capped at the category requirement (no over-count). |
| STU-DEG-004 | DESIGN | Check subtitle + grid columns | "· Catalog {year}" present; column count per design decision. |

### 2.7 Attendance — `/student/attendance` — `STU-ATT`

**Screen Spec**
- **Regions:** header "Attendance" / crumb "Fall 2026"; subtitle "· Overall attendance X%"
  (design; staging historically omitted — §7); per-course rows (PRESENT / LATE / ABSENT counts + RATE %).
- **Derived:** rate = round((present + late×0.5)/total×100); total 0 → null.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-ATT-001 | FUNC | Load page | Per-course present/late/absent + rate. |
| STU-ATT-002 | FUNC | Verify a rate by hand (e.g. 20P/3L/3A → (20+1.5)/26≈83%) | Matches "late = ½ present" formula. |
| STU-ATT-003 | FUNC | Course with no sessions | Rate shows null/— not 0 or crash. |
| STU-ATT-004 | DESIGN | Look for overall-attendance subtitle | Present per design (flag if missing). |

### 2.8 Assignments (+upload) — `/student/assignments` — `STU-ASG`

**Screen Spec**
- **Regions:** assignment list (course, title, due, status submitted/pending/graded);
  submit action opening a file picker; upload progress; submitted receipt/link.
- **Data bindings:** `getMyAssignments`, `submitAssignment`, `uploadFile` (→ `POST /api/uploads`).

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-ASG-001 | FUNC | (Mamadou has a pending CE 201 HW1) Load page | Pending assignment shown with due date. |
| STU-ASG-002 | FUNC | Upload a file + submit | Upload → `{url,name,size}`; assignment flips to submitted; link resolves via `fileUrl()`. |
| STU-ASG-003 | NEG | Submit with no file | Blocked client-side or 400 "No file provided". |
| STU-ASG-004 | NEG | Upload oversized file | Rejected at size cap. |
| STU-ASG-005 | AUTHZ | POST submit for another student's assignment id | Refused (ownership via enrollment). |

### 2.9 Billing & pay — `/student/billing` — `STU-BILL` (see also §8 PAY)

**Screen Spec**
- **Regions:** header "Billing & Financials" / crumb "Student account"; account no + student;
  **Current balance** with next-due context; **Pay {amount} FCFA** button (only when a balance is
  due — data-driven; absent when settled); plan summary line ("Full package … 4 installments of …");
  installment table (DESCRIPTION / AMOUNT / DUE / STATUS with Paid dates).
- **Data bindings:** `getMyBilling`, `getMyProfile`; Pay → `initiatePayment(invoiceId, outstanding, method)`
  → `window.location.href = redirectUrl` (PayTech). Pays the **next unpaid installment**.
- **Design note:** prototype hard-codes "Pay 1 071 250 FCFA"; on staging the amount and the
  button's presence follow the real balance (§8 — Match). No Pay button when balance is 0 is correct.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-BILL-001 | FUNC | Aïssatou (partial invoice) load page | Balance > 0; installment table with 1 Paid + remaining Due; Pay button shows the next-due amount. |
| STU-BILL-002 | FUNC | Click Pay, choose Wave/OM/Card | Redirect to PayTech `redirectUrl` (assert redirect issued; do not complete real payment). |
| STU-BILL-003 | FUNC | A student with fully-settled invoice | **No** Pay button; balance 0/credit shown. |
| STU-BILL-004 | NEG | Force `POST /api/finance/my/payments` with amount > balance | 400/rejected (amount ≤ balance). |
| STU-BILL-005 | AUTHZ | Force payment against another student's invoiceId | 403 "Not your invoice". |
| STU-BILL-006 | DESIGN | Compare to prototype | Layout Match; button/amount data-driven (don't expect the fixed prototype number). |

### 2.10 Dining — `/student/dining` — `STU-DIN`

**Screen Spec** — **Divergent by design decision** (`STUDENT-DESIGN-REVIEW.md` §9).
- **Prototype:** swipe-balance model (swipes remaining, dining dollars, recent activity) — *fiction,
  data we don't capture*.
- **Built app:** meal-plan chooser, dining pass (QR), today's menu, weekend ordering + pay.
- **Data bindings:** `getDiningPass`, `getMenu`, `getMyDiningOrders`, `getDiningToday`,
  `chooseMealPlan`, `createDiningOrder`, `payDiningOrder`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-DIN-001 | FUNC | Load page | Shows current plan (Aïssatou full / Mamadou half), pass, today's menu. |
| STU-DIN-002 | FUNC | Choose/switch a meal plan | `chooseMealPlan` persists; UI reflects new plan. |
| STU-DIN-003 | FUNC | Create a weekend order → pay | Order created (cart) → pay returns redirect or direct-settle (no PayTech key). |
| STU-DIN-004 | NEG | Pay an order not in `cart` status | Rejected (status must be cart). |
| STU-DIN-005 | AUTHZ | Pay another student's order id | 403 "Not your order". |
| STU-DIN-006 | DESIGN | Compare to prototype | **Expected divergence** — real-data model, not swipe model. Log as intentional (Appendix B), not a bug. |

### 2.11 Housing — `/student/housing` — `STU-HOU`

**Screen Spec**
- **Regions:** assignment card (hall, building/block, room+type, roommate, RA, move-in date,
  contract) OR unassigned/pending state; move-in checklist.
- **Data bindings:** `getCurrentTerm`, `getMyHousing` (assigned/unassigned union).

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-HOU-001 | FUNC | Aïssatou (Gorée G-214) load | Assignment details + checklist render. |
| STU-HOU-002 | FUNC | `bineta.faye` (housing pending) | Unassigned/pending state, no crash. |
| STU-HOU-003 | DESIGN | Compare to prototype | Fields present (hall/room/roommate/RA/move-in/contract). |

### 2.12 Announcements — `/student/announcements` — `STU-ANN`

**Screen Spec:** read-only feed of announcements scoped to the user; each item title/date/body.
Data: `getAnnouncements`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-ANN-001 | FUNC | Load page | Seeded announcements listed newest-first; read-only (no compose). |
| STU-ANN-002 | FUNC | After a registrar broadcast to "all"/this student's year | New announcement appears in feed. |

### 2.13 Messages / Inbox — `/student/inbox` — `STU-MSG`

**Screen Spec** (`components/Inbox.tsx`)
- **Regions:** thread list (auto-selects first, unread counts); conversation pane (auto-scroll
  to latest); composer (Enter or Send); "New message" → contact picker → start thread.
- **Data bindings:** `getThreads`, `getThread`, `sendThreadMessage`, `getContacts`, `startThread`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-MSG-001 | FUNC | (Aïssatou has a demo thread w/ Prof. Ba) Load inbox | Thread list populated; first thread auto-opens; messages shown. |
| STU-MSG-002 | FUNC | Type a reply, press Enter | Message posts; thread refetches; appears at bottom; input clears. |
| STU-MSG-003 | FUNC | New message → pick an allowed contact → send | New thread created and opened. |
| STU-MSG-004 | AUTHZ | Try `startThread` with a person not in `contacts()` | 403 "You cannot message this person". |
| STU-MSG-005 | AUTHZ | POST message to a thread id you're not part of | 403 "Not a participant in this thread". |
| STU-MSG-006 | FUNC | Unread indicator | Increments on new inbound; clears on open. |

### 2.14 Profile — `/student/profile` — `STU-PRO`

**Screen Spec:** **read-only** (Overview / Personal / Academic / Emergency tabs; no edit action —
student-record edits are admin-side). Data: `getMyProfile`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-PRO-001 | FUNC | Load, cycle tabs | All tabs render fields; no editable inputs / save. |
| STU-PRO-002 | AUTHZ | Confirm no mutation endpoint from this screen | No PATCH issued; record immutable here. |

### 2.15 ID card / QR — `/student/id` — `STU-ID`

**Screen Spec:** ID card with photo/name/number + QR encoding the dining pass token
(`studentId.HMAC`). Data: `getMe`, `getDiningPass`; renders `<QrCode value={pass.token}/>`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-ID-001 | FUNC | Load page | Card + scannable QR; token = `studentId.<sig>` format. |
| STU-ID-002 | AUTHZ | Decode QR, tamper the sig, verify server-side | `verifyPass` rejects (constant-time HMAC). |

### 2.16 Documents — `/student/documents` (+ transcript, enrollment) — `STU-DOC`

**Screen Spec:** hub linking printable transcript (`getMe`,`getMyGrades`,`getMySummary`) and
enrollment verification (`getMe`,`getMyEnrollments`).

| ID | Tags | Steps | Expected |
|---|---|---|---|
| STU-DOC-001 | FUNC | Open transcript | Printable transcript with GPA + all terms; matches `/student/grades`. |
| STU-DOC-002 | FUNC | Open enrollment verification | Printable list of current enrollments. |
| STU-DOC-003 | FUNC | Browser print | Print layout is clean (print styles applied). |

---

## 3. Parent portal

Login: `parent@daust.edu` (Ousmane Diallo). Guardian of Aïssatou + Mamadou. Landing `/parent`.
Every read funnels through `assertGuardianOf`.

### 3.0 Child switcher (shared) — `PAR-SW`

**Screen Spec** (`useChildren.ts` + `ChildSwitcher.tsx`)
- Remembers active child in `localStorage` key `daust.parent.activeChild`, validated against the
  server list; switcher hidden if ≤1 child.
- Empty state when no children linked.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PAR-SW-001 | FUNC | Load `/parent` | Child switcher shows Aïssatou + Mamadou; one selected. |
| PAR-SW-002 | FUNC | Switch child, navigate to Grades | Grades reflect the newly selected child; selection persists across screens. |
| PAR-SW-003 | FUNC | Reload after switching | Active child restored from `localStorage`. |
| PAR-SW-004 | NEG | Set `localStorage` active child to a non-linked studentId, reload | Falls back to a valid linked child (server-validated), no leak. |
| PAR-SW-005 | FUNC | A guardian with a single child | Switcher hidden. |

### 3.1 Dashboard — `/parent` — `PAR-DASH`

**Screen Spec:** "Family overview"; per selected child: GPA, credits, attendance %, balance
stat cards; records read-only. Empty state if none linked.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PAR-DASH-001 | FUNC | Load page | Stats for selected child; values match that student's own portal figures. |
| PAR-DASH-002 | FUNC | Switch child | Stats update to the other child. |

### 3.2 Grades — `/parent/grades` — `PAR-GRD`

**Screen Spec:** "Grades — {child}"; cumulative GPA + per-term courses. Data: `getChildGrades(studentId)`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PAR-GRD-001 | FUNC | Load for Aïssatou | GPA + terms identical to student's `/student/grades`. |
| PAR-GRD-002 | AUTHZ | Call `GET /api/parent/children/:id/grades` with a studentId NOT linked to this guardian | 403 "You do not have access to that student". |

### 3.3 Attendance — `/parent/attendance` — `PAR-ATT`

**Screen Spec:** "Attendance — {child}"; per-course rates (late = ½ present). Data: `getChildAttendance`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PAR-ATT-001 | FUNC | Load for a child | Per-course present/late/absent + rate; matches student view. |
| PAR-ATT-002 | AUTHZ | Same endpoint, non-linked child | 403. |

### 3.4 Billing — `/parent/billing` — `PAR-BILL`

**Screen Spec:** "Billing — {child}"; read-only account (charges, installments, balance).
**No pay action** (prototype shows a "Pay …" button; built parent billing is read-only — verify).
Data: `getChildAccount(studentId)`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PAR-BILL-001 | FUNC | Load for Aïssatou | Balance + installment table, read-only. |
| PAR-BILL-002 | DESIGN | Compare to prototype "Pay …" button | Built app is read-only for guardians (flag if a live pay action exists — confirm intended). |
| PAR-BILL-003 | AUTHZ | `getChildAccount` for non-linked child | 403. |

---

## 4. Faculty portal

Login: `amadou.ba@daust.edu` (instructor of all Fall sections). Landing `/faculty`.
Ownership via `assertSectionOwner` (admin exempt); grade-related audit-logged.

### 4.1 Dashboard — `/faculty` — `FAC-DASH`

**Screen Spec:** "Welcome, Prof. Ba"; KPIs, my classes, today's sessions, needs-attention.
Data: `getFacultyOverview`, `getMe`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-DASH-001 | FUNC | Load page | KPIs + class list render for taught sections. |

### 4.2 Grade Entry — `/faculty/grades` — `FAC-GRD`

**Screen Spec:** section picker (e.g. CSC 301 / CSC 305); roster with a letter-grade `<select>`
per student (— / A / A- / B+ …); "Submit for approval" button (finalize → grade approval flow).
Data: `getTeaching`, `submitGrades(sectionId, grades, finalize)`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-GRD-001 | FUNC | Pick a section, set grades, Save (not finalize) | Grades persist as draft; audit `grades-saved`. |
| FAC-GRD-002 | FUNC | Set grades + "Submit for approval" (finalize) | `gradeSubmission` status submitted; graded enrollments → completed (feed GPA); audit `grades-finalized`; appears in registrar Grade Approvals. |
| FAC-GRD-003 | AUTHZ | `POST /api/academics/sections/:id/grades` for a section Ba doesn't teach | 403 "You do not teach this section". |
| FAC-GRD-004 | NEG | Submit invalid grade value | 400 validation. |
| FAC-GRD-005 | FUNC | Verify a graded student's GPA downstream | Student `/student/grades` reflects the finalized grade. |

### 4.3 Gradebook — `/faculty/gradebook` — `FAC-GB`

**Screen Spec:** section picker; continuous-assessment grid (numeric score inputs per
assignment column); "Manage columns"; assignment creation; per-submission grading.
Data: `getFacultyGradebook`, `getSectionAssignments`, `createAssignment`, `getAssignmentSubmissions`, `gradeSubmission`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-GB-001 | FUNC | Load section (CE 201 insights cohort) | Grid shows students × assignment columns with existing scores. |
| FAC-GB-002 | FUNC | Create an assignment | New column appears; students show ungraded. |
| FAC-GB-003 | FUNC | Open a submission, grade it | Score saved; grid updates. |
| FAC-GB-004 | NEG | Enter a score above the max / non-numeric | Rejected/validated. |
| FAC-GB-005 | AUTHZ | Grade a submission in a non-owned section | 403. |

### 4.4 Attendance — `/faculty/attendance` — `FAC-ATT`

**Screen Spec:** section picker; date picker; roster with present/late/absent toggles;
"All present" bulk action. Data: `getTeaching`, `getAttendance(sectionId,date)`, `markAttendance`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-ATT-001 | FUNC | Pick section + date, mark a mix, save | Attendance persists; student attendance % recomputes (late = ½). |
| FAC-ATT-002 | FUNC | "All present" | All rows set present. |
| FAC-ATT-003 | FUNC | Change date | Loads that date's existing marks. |
| FAC-ATT-004 | AUTHZ | `POST /api/academics/sections/:id/attendance` non-owned | 403. |

### 4.5 Course Materials (upload) — `/faculty/materials` — `FAC-MAT`

**Screen Spec:** section picker; 5 category upload slots; multi-file upload; materials list with
visibility toggle. Data: `getTeaching`, `uploadFile`, `createSectionMaterial`, `getSectionMaterials`, `materials/:id/toggle`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-MAT-001 | FUNC | Upload files into a category | Materials created; listed; URLs resolve via `fileUrl()`. |
| FAC-MAT-002 | FUNC | Toggle a material's visibility | Toggle persists; students see/don't see accordingly. |
| FAC-MAT-003 | NEG | Upload oversized file | Rejected at size cap. |
| FAC-MAT-004 | AUTHZ | Upload material to a non-owned section | 403. |

### 4.6 Messages / broadcast — `/faculty/messages` — `FAC-MSG`

**Screen Spec:** section `<select>` (CSC 301 / CSC 305); student `<select>`; "Send message";
plus section broadcast. Data: `getTeaching`, `getRoster`, `getContacts`, `startThread`, `broadcastToSection`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FAC-MSG-001 | FUNC | Message an enrolled student | Thread starts; delivered to that student's inbox. |
| FAC-MSG-002 | FUNC | Broadcast to a taught section | All roster members receive it (audit `broadcast`). |
| FAC-MSG-003 | AUTHZ | `POST /api/comms/sections/:id/broadcast` for a non-owned section | 403 (service re-checks `instructorId`; **not** admin-exempt here). |

---

## 5. Registrar / Admin portal

Login: `registrar@daust.edu` (or `admin@daust.edu` for admin-only). Landing `/admin`.
Class guard `@Roles("admin","registrar")` unless noted. All structural mutations audit-logged.

### 5.1 Dashboard — `/admin` — `REG-DASH`

**Screen Spec:** "Registrar Dashboard"; institution-wide stats (students, applicants, sections),
current term. Data: `getAdminStats`, `getCurrentTerm`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-DASH-001 | FUNC | Load page | Stat tiles populate from live counts. |

### 5.2 Admissions — `/admin/admissions` (+ `[id]`) — `REG-ADM`

**Screen Spec:** funnel by stage; filter box; stage `<select>` (All / Applied / Under review /
Interview / Documents); "New application"; per-applicant actions ("Submit for review", "Confirm",
"Admit"). Detail `[id]`: applicant record + **"Admit → createStudent"** (provisions student & enrolls).
Data: `getAdmissions`, `getAdminPrograms`, `setApplicantStage`, `getApplicant`, `createStudent`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-ADM-001 | FUNC | Load, filter by stage | Applicant list filters; funnel counts consistent. |
| REG-ADM-002 | FUNC | Advance an applicant's stage | Stage updates; audit `applicant-stage-<stage>`. |
| REG-ADM-003 | FUNC | Open applicant detail → Admit → createStudent | New student record created + enrolled; audit `applicant-created`/student creation. |
| REG-ADM-004 | NEG | Create application via `POST /api/applications` (public) with bad body | 400. |
| REG-ADM-005 | AUTHZ | student/faculty hit `/api/admissions/applicants` | 403. |

### 5.3 Students — `/admin/students` (+ `[id]`) — `REG-STU`

**Screen Spec:** directory with program `<select>` filter + name/ID search; "Add student".
Detail `[id]`: overview / finance / activity tabs; `EditStudentModal` (per-section pencil →
`updateStudent`); `adminDropEnrollment`; `createPaymentLink`; links into billing account.
Data: `getAdminStudents`, `getAdminStudentDetail`, `getStudentAccount`, `getAdminStudentActivity`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-STU-001 | FUNC | Search "Aïssatou" / filter by program | Directory filters correctly. |
| REG-STU-002 | FUNC | Add a student | Record created; appears in directory; audit. |
| REG-STU-003 | FUNC | Open detail → Edit a section (e.g. major) → save | `updateStudent` persists; audit `student-updated`. |
| REG-STU-004 | FUNC | Admin-drop an enrollment | Enrollment dropped; audit; ignores student drop-deadline (admin path). |
| REG-STU-005 | FUNC | Activity tab | Shows audit/activity trail for the student. |
| REG-STU-006 | FUNC | Finance tab / "open account" link | Routes to billing account (registrar read-only finance — RBAC-012). |
| REG-STU-007 | NEG | Update with invalid field | 400. |

### 5.4 Parents / Guardian admin — `/admin/parents` — `REG-PAR`

**Screen Spec:** guardian list with status badges (active / invited / invite-expired); filter;
"Add parent" (create + send invite); resend invite; edit; delete; link/unlink children.
Data: `getGuardians`, `createGuardian`, `resendGuardianInvite`, `updateGuardian`, `deleteGuardian`, `PATCH :id/children`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-PAR-001 | FUNC | Add a new guardian + link a child | Account provisioned (no password yet); status "invited"; invite link generated; audit `guardian-created`. |
| REG-PAR-002 | FUNC | Resend invite to a not-yet-activated guardian | New link returned to actor; audit `guardian-invite-resent` (`linkDisclosedToActor:true`). |
| REG-PAR-003 | NEG | **Resend invite to `parent@daust.edu` (password already set)** | Refused: 400 "already set a password" (no password-reset via invite). |
| REG-PAR-004 | NEG | Create a guardian linking a non-existent studentId | 400. |
| REG-PAR-005 | NEG | Create a guardian whose email belongs to a non-parent person | 400. |
| REG-PAR-006 | FUNC | Link a further child to an **already-activated** guardian | Child linked; **no new invite minted** (guardian-invite-takeover guard); audit `children-changed`. |
| REG-PAR-007 | FUNC | Status badge for expired invite (age token past 72h — Appendix A.5) | Shows "invite-expired". |

### 5.5 Student Success — `/admin/student-success` — `REG-SUC`

**Screen Spec:** at-risk/watch list; level `<select>` (All / At risk / Watch); "Auto-send warnings (N)";
per-student "Send warning"; watch/unwatch. Data: `getStudentSuccess`, `getWarnings`, `getWatching`,
`warnStudent`, `watchStudent`, `unwatchStudent`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-SUC-001 | FUNC | Load, filter by level | List filters; at-risk derived from GPA/attendance. |
| REG-SUC-002 | FUNC | Send a warning to a student | Warning recorded; audit; count decrements. |
| REG-SUC-003 | FUNC | Watch then unwatch a student | Watch list updates both ways; audit. |
| REG-SUC-004 | FUNC | Auto-send warnings | Batch warns the flagged set. |

### 5.6 Departments — `/admin/departments` — `REG-DEP`

**Screen Spec:** list + filter; "Add department" (code + name); edit/delete.
Data: `getDepartments`, `upsertDepartment`, `deleteDepartment`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-DEP-001 | FUNC | Add a department | Created; audit. |
| REG-DEP-002 | FUNC | Rename a department | Updated. |
| REG-DEP-003 | NEG | Delete a department that owns programs/courses | Blocked or cascades safely (verify intended behaviour; no orphans). |

### 5.7 Academic Years — `/admin/academic-years` — `REG-YR`

**Screen Spec:** list with status `<select>` (All / Active / Draft / Archived); "Add academic year";
"Set active". Data: `getAcademicYears`, `createAcademicYear`, `activateAcademicYear`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-YR-001 | FUNC | Add a year | Created as draft. |
| REG-YR-002 | FUNC | Set a year active | Becomes active; previous active flips (single active); audit `activated`. |

### 5.8 Programs & Curriculum — `/admin/programs` (+ `[code]`, courses) — `REG-PRG`

**Screen Spec:** program picker; catalog-year picker; curriculum editor (course `<select>` rows);
"Save curriculum". Course detail under a program: sections CRUD, `updateCourse`.
Data: `getAdminPrograms`, `getProgramDetail`, `getCurriculum`, `saveCurriculum`, `getAdminCourseDetail`,
`getStaff`, `createSection`, `updateSection`, `deleteSection`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-PRG-001 | FUNC | Load a program's curriculum for a catalog year | Requirement categories + courses render. |
| REG-PRG-002 | FUNC | Add a course to a requirement category, Save curriculum | Persists; reflected in student degree audit for that catalog year. |
| REG-PRG-003 | FUNC | Create a section for a course (instructor, capacity, meeting) | Section created; audit `section-created`. |
| REG-PRG-004 | FUNC | Edit then delete a section | Update + delete audit-logged. |
| REG-PRG-005 | NEG | Create a section with a time that collides / invalid capacity | Validation as designed. |

### 5.9 Course Catalog — `/admin/courses` — `REG-CAT`

**Screen Spec:** searchable catalog; "New course"; edit course; section list.
Data: `getAdminCourseDetail`, `getSections`, `createCourse`, `updateCourse`, `getCurrentTerm`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-CAT-001 | FUNC | Create a course (code, title, credits, requirementCategory) | Created; audit `course-created`. |
| REG-CAT-002 | FUNC | Edit a course | Updated; audit. |
| REG-CAT-003 | NEG | Duplicate course code | Rejected. |

### 5.10 Course Enrollment / Offerings — `/admin/offerings` — `REG-OFF`

**Screen Spec:** offered sections with status filter (All/Open/Closed); "Add Course"; toggle status;
master schedule. Data: sections CRUD + `getStaff`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-OFF-001 | FUNC | Toggle a section Open→Closed | Status flips; a student then can't enroll (409 "closed"). |
| REG-OFF-002 | FUNC | Master schedule view | Sections plotted without false collisions. |

### 5.11 Academic Calendar & Terms — `/admin/calendar` — `REG-CAL`

**Screen Spec:** terms list + calendar events CRUD; "Edit term" (status, dates, add/drop deadlines).
Data: `getCalendar`, `createCalendar`, `updateTerm`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-CAL-001 | FUNC | Edit a term's add deadline to the past, save | Students then get 400 "add period closed" on enroll (ties to STU-REG-014). |
| REG-CAL-002 | FUNC | Add / edit / delete a calendar event | CRUD persists; audit. |

### 5.12 Rule Engine — `/admin/rules` — `REG-RUL`

**Screen Spec:** per-course rule config (standingRequired, majorRestriction, capacity, waitlist)
+ requisites editor (prerequisites w/ minGrade, corequisites); "Save rules".
Data: `getCourseRules`, `setCourseRule`, `setCourseRequisites`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-RUL-001 | FUNC | Set CSC 201 prereq = CSC 101 min grade C | Saved; enforced in `enroll()` (drives STU-REG-007). |
| REG-RUL-002 | FUNC | Add a corequisite pair | Saved; enforced (drives STU-REG-016). |
| REG-RUL-003 | FUNC | Set standingRequired / majorRestriction / capacity | Saved; enforced (STU-REG-017/018). |
| REG-RUL-004 | FUNC | Lower a course capacity below current enrolled count | Saved; no retroactive drop, but new enroll blocked at cap. |

### 5.13 Grading Schemes — `/admin/grading-schemes` — `REG-GS`

**Screen Spec:** scheme tabs (Standard Letter / Pass-Fail / IEP Levels); grade rows (letter, min%,
points); "Add row"; edit/delete row. Data: `getGradingSchemes`, `addGradeRow`, `updateGradeRow`, `deleteGradeRow`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-GS-001 | FUNC | Add / edit / delete a grade row | CRUD persists; GPA derivation uses `GradeScaleRow.points`. |
| REG-GS-002 | NEG | Overlapping/invalid min% bands | Validated. |

### 5.14 Grade Approvals — `/admin/grade-approvals` — `REG-GA`

**Screen Spec:** submissions list with status `<select>` (All/Draft/Submitted/Approved/Returned);
filter by course; decide (approved / returned + note). Data: `getGradeApprovals`, `decideGradeApproval`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-GA-001 | FUNC | (After FAC-GRD-002) Load approvals | The faculty submission appears as Submitted. |
| REG-GA-002 | FUNC | Approve it | Status Approved; audit; grades locked. |
| REG-GA-003 | FUNC | Return it with a note | Status Returned; faculty sees the note; can resubmit. |

### 5.15 Faculty & Staff — `/admin/staff` — `REG-STF`

**Screen Spec:** staff directory (read; `@Roles("admin","hr","registrar")`). Data: `getStaff`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-STF-001 | FUNC | Load | Staff list with roles. |
| REG-STF-002 | AUTHZ | bursar hits `/api/academics/admin/staff` | 403 (not in the allowed set). |

### 5.16 Security & System / Settings — `/admin/settings` — `REG-SET`

**Screen Spec:** users & roles (`getUsers`, `updateUserRoles`); fee config
(`getFeeConfig`/`updateFeeItem`); scholarship tiers CRUD. `getUsers` gated `@Roles("admin","it_admin")`;
role change gated `@Roles("it_admin","admin")`; fee/scholarship gated `@Roles("admin")`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-SET-001 | FUNC | (as admin/it_admin) Change a user's roles | Persists; audit `roles-changed` with from/to. |
| REG-SET-002 | NEG | **Change your OWN roles** (`id === personId`) | 400 (self-lockout guard). |
| REG-SET-003 | NEG | Change roles for a missing person id | 404. |
| REG-SET-004 | FUNC | (as admin) Edit a fee item | Persists; audit `fee-updated`. |
| REG-SET-005 | FUNC | (as admin) Create/edit/delete a scholarship tier | CRUD; audit `tier-*`. |
| REG-SET-006 | AUTHZ | registrar (no admin/it_admin) opens Settings user-management | `getUsers` 403; page shows inline error, not a crash. |

### 5.17 Messages / Broadcast — `/admin/messages` — `REG-MSG`

**Screen Spec:** broadcast composer; audience selector (individual / year / program / all);
student `<select>`; sent list. Data: `getBroadcasts`, `sendBroadcast`, `getAdminStudents`, `getAdminPrograms`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| REG-MSG-001 | FUNC | Broadcast to "all" | Reaches every student's announcements/inbox; audit `broadcast` with audience. |
| REG-MSG-002 | FUNC | Broadcast to a specific year / program | Only that cohort receives it. |
| REG-MSG-003 | FUNC | Direct message a single student | Delivered to that student. |
| REG-MSG-004 | AUTHZ | faculty hits `POST /api/comms/broadcasts` | 403 (admin/registrar only). |

---

## 6. Finance / Bursar portal

Login: `bursar@daust.edu` (or `admin@daust.edu`). Landing `/finance`. Class guard
`@Roles("bursar","admin")` unless noted. All money mutations audit-logged.

### 6.1 Dashboard — `/finance` — `FIN-DASH`

**Screen Spec:** "Bursar Dashboard"; receivables overview; owing-students list linking to
`/finance/students/[id]` (the repointed link — stays in finance shell). Data: `getCurrentTerm`,
`getFeePlan`, `listStudentAccounts`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FIN-DASH-001 | FUNC | Load page | Receivables KPIs + owing list. |
| FIN-DASH-002 | FUNC | Click an owing student | Routes to `/finance/students/[id]` (finance shell, **not** `/admin/finance/...`); no registrar-nav 403. |

### 6.2 Fee Schedule — `/finance/fee-schedule` — `FIN-FEE`

**Screen Spec:** "Tuition & Fees"; fee-plan rows; "Edit plan" (per-row edit). Data: `getFeePlan`, `updateFeePlanRow`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FIN-FEE-001 | FUNC | Edit a fee-plan row amount | Persists (integer XOF); audit `fee-plan`. |
| FIN-FEE-002 | NEG | Enter a non-integer/negative amount | 400. |

### 6.3 Student Accounts — `/finance/accounts` — `FIN-ACC`

**Screen Spec:** account balances list; "New billing"; add charge; rows link to student account.
Data: `listStudentAccounts`, `getFeePlan`, `addCharge`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FIN-ACC-001 | FUNC | Load | Accounts with balances; owing highlighted. |
| FIN-ACC-002 | FUNC | Add a charge to a student | Charge added to their invoice; balance rises; audit. |
| FIN-ACC-003 | FUNC | Open a student account | Routes to `/finance/students/[id]`. |

### 6.4 Student Account detail — `/finance/students/[id]` — `FIN-DET`

**Screen Spec** (`components/StudentAccountDetail.tsx`, shared by finance + `/admin/finance/students/[id]`)
- **Regions:** KPIs (billed / paid / balance); `LinkQuickCreate` (prefilled payment link tied to
  the open invoice, clipboard-copied); `DiscountModal` (FCFA or % of balance → `applyDiscount`);
  per-invoice `InvoiceBlock` (installments, credit-memo rendering for negative totals),
  `RemoveChargeConfirm` (`removeCharge`), `EditPlanModal` (`updatePaymentPlan`), `PlanForm`
  (build installment schedule from `PLAN_TEMPLATES`/`splitEvenXof`; **must total the invoice**
  → `createPaymentPlan`).
- **Data bindings:** `getStudentAccount(id)`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FIN-DET-001 | FUNC | Open Aïssatou's account | KPIs reconcile (billed − paid = balance); installments listed. |
| FIN-DET-002 | FUNC | Create a payment link for the open invoice | Link generated + copied to clipboard; audit `payment-link created`; opens as `/pay/[token]`. |
| FIN-DET-003 | FUNC | Apply a % discount of balance | Discount applied; balance reduced; audit `discounts`. |
| FIN-DET-004 | FUNC | Apply a fixed FCFA discount | Same, integer XOF. |
| FIN-DET-005 | FUNC | Build a payment plan (e.g. quarterly) that totals the invoice | Accepted; installments = `splitEvenXof` (earlier absorb remainder); audit `plan create`. |
| FIN-DET-006 | NEG | Build a plan that does NOT total the invoice | Rejected (must total). |
| FIN-DET-007 | FUNC | Edit an existing plan | `updatePaymentPlan` persists; audit. |
| FIN-DET-008 | FUNC | Remove a charge | Charge removed via confirm; audit `charges remove`; balance updates. |
| FIN-DET-009 | FUNC | Account with a credit balance | `InvoiceBlock` renders credit memo (negative total). |
| FIN-DET-010 | AUTHZ | registrar opens `/admin/finance/students/[id]` | Read-only finance view loads (RBAC-012); registrar sees registrar shell. |
| FIN-DET-011 | AUTHZ | student/faculty hit `GET /api/finance/admin/students/:id/account` | 403. |

### 6.5 Manual payment operations — `FIN-OPS` (admin-finance endpoints)

**Screen Spec / endpoints:** `getSummary`, `payments?status=`, `overdue`, `aging`, `reports`,
`payments/:id/receipt`, `payments/:id/refund`, `payments/:id/confirm`, `payments/:id/cancel`,
`reconcile`, `director-overview`, cost-centers, expenses CRUD, budgets. (Some surfaced only via
API on staging if no dedicated screen.)

| ID | Tags | Steps | Expected |
|---|---|---|---|
| FIN-OPS-001 | FUNC | List payments filtered by status | Filter works; amounts integer XOF. |
| FIN-OPS-002 | FUNC | Manually confirm a `pending` payment | Transitions to success via settle path; audit `manually-confirmed`; allocations created. |
| FIN-OPS-003 | NEG | Manually confirm a payment that's already `success` | No-op (idempotent), no double credit. |
| FIN-OPS-004 | FUNC | Cancel a `pending` payment | Cancelled; audit `manually-cancelled`. |
| FIN-OPS-005 | NEG | Cancel a `success` payment | Refused (only pending transitions). |
| FIN-OPS-006 | FUNC | Refund a settled payment | Refund recorded; audit `refund`. |
| FIN-OPS-007 | FUNC | Fetch a payment receipt | Receipt renders with allocation breakdown. |
| FIN-OPS-008 | FUNC | Director overview / cost-centers | Aggregates by cost center (tuition→9100, dining→3600). |
| FIN-OPS-009 | FUNC | Add / edit / delete an expense; set a budget | CRUD; audit `expenses`. |

---

## 7. Public / unauthenticated surfaces

### 7.1 Public payment link — `/pay/[token]` — `PUB-LNK`

**Screen Spec:** states active / paid (receipt with print) / expired / not-found. Methods:
Orange Money, Wave, Card (gateway → `checkoutPaymentLink` → redirect); Bank transfer (offline
instructions, no checkout). On `?back=`, polls every 3s (max 20) for async IPN settlement.
Data: `getPublicPaymentLink(token)`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PUB-LNK-001 | FUNC | Open a valid active link (from FIN-DET-002) | Amount + student shown; OM/Wave/Card/Bank options. |
| PUB-LNK-002 | FUNC | Choose Wave/OM/Card | Redirects to PayTech; on return with `?back=` polls and flips to paid on IPN settle. |
| PUB-LNK-003 | FUNC | Choose Bank transfer | Shows offline instructions; no gateway redirect. |
| PUB-LNK-004 | FUNC | Open an already-paid link | Paid state + printable receipt. |
| PUB-LNK-005 | NEG | Open an expired/cancelled link | Expired state; no checkout. |
| PUB-LNK-006 | NEG | Open a garbage token | Not-found state (no enumeration oracle). |
| PUB-LNK-007 | AUTHZ | `GET /api/finance/links/:token` is `@Public` but token = credential | Only the exact token works; guessing fails. |

### 7.2 Pay my bill — `/pay-bill` — `PUB-BILL`

**Screen Spec:** lookup by Student ID + DOB (`lookupBill`); on match shows balance + charges;
amount input capped at balance with Full/Half presets; methods OM/Wave/Card → `checkoutBill`.
`?sid=` prefills ID; `?paid=1` re-fetches from `sessionStorage` creds. Credit-balance & cleared states.
Rate-limited by `BillThrottleGuard` (6/5min per studentNo, 300/60s global) + hard 10/hour failed-DOB per ID.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PUB-BILL-001 | FUNC | Lookup DAUST-CE-23-0142 + correct DOB | Balance + charges shown; amount capped at balance. |
| PUB-BILL-002 | FUNC | Full / Half preset | Amount fills to balance / half. |
| PUB-BILL-003 | FUNC | Pay via a method | Redirect to gateway; `?paid=1` return re-fetches balance. |
| PUB-BILL-004 | NEG | Wrong DOB | Generic "not found" (no oracle); no balance leak. |
| PUB-BILL-005 | NEG | 11 wrong-DOB attempts for one ID within an hour | 429 after the 10-fail cap; resets on a correct lookup. |
| PUB-BILL-006 | NEG | >6 lookups in 5 min for one studentNo | 429 (per-ID throttle). |
| PUB-BILL-007 | NEG | Force `amountXof` > balance in `checkout` | Server clamps to min(amount, invoiceBalance, netBalance) — no overpay. |
| PUB-BILL-008 | FUNC | Student with credit balance / cleared | Credit and cleared states render; no pay prompt. |
| PUB-BILL-009 | FUNC | `?sid=DAUST-CE-23-0142` in URL | ID prefilled. |

### 7.3 Bursar bill console — `/billing-admin` — `PUB-ADM`

**Screen Spec:** own login/logout (not portal shell); gated to bursar/admin via `getMe`; account
list (`listStudentAccounts`), open account (`getStudentAccount`), `createStudent`, `addCharge`
(preset `CHARGE_CATALOG` + custom), `removeCharge`, copy `pay-bill?sid=` link.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PUB-ADM-001 | AUTHZ | Visit `/billing-admin` logged out | Shows its own login view. |
| PUB-ADM-002 | AUTHZ | Log in as a student here | Rejected — bursar/admin only. |
| PUB-ADM-003 | FUNC | Log in as bursar; list accounts; open one | Accounts + detail load. |
| PUB-ADM-004 | FUNC | Add a preset charge; add a custom charge | Charges added; audit. |
| PUB-ADM-005 | FUNC | Copy a `pay-bill?sid=` link | Clipboard holds the public bill URL. |

### 7.4 Guardian set-password — `/set-password` — `PUB-SET`

**Screen Spec:** reads `?token=`; min 10 chars + confirm-match; `redeemGuardianInvite(token,password)`;
success → redirect `/login` after 1.6s. Missing-token and generic-failure states. Deliberately
outside `/parent`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PUB-SET-001 | FUNC | Open the invite link from REG-PAR-001, set a valid password | Success; redirect to `/login`; guardian can now log in. |
| PUB-SET-002 | NEG | Password < 10 chars / mismatch confirm | Blocked client-side; API 400 if forced. |
| PUB-SET-003 | NEG | Reuse the SAME token after success | Generic failure (single-use; marked `usedAt`). |
| PUB-SET-004 | NEG | Use an expired token (>72h — Appendix A.5) | Generic failure (no oracle distinguishing used vs expired vs unknown). |
| PUB-SET-005 | NEG | Open `/set-password` with no token | Missing-token state. |
| PUB-SET-006 | AUTHZ | After redeem, confirm all other outstanding invites for that guardian are invalidated | Old links now fail. |

### 7.5 Vitrine (public marketing) — `PUB-VIT`

**Screen Spec:** static pages `/`, `/about`, `/academics`, `/admissions`, `/research`, `/campus`,
`/startups`, `/alumni`; header/nav/footer from `site.tsx`; `ApplyModal`.

| ID | Tags | Steps | Expected |
|---|---|---|---|
| PUB-VIT-001 | FUNC | Visit each nav page | Loads; header/footer nav links resolve; responsive frame. |
| PUB-VIT-002 | FUNC | Open ApplyModal on `/admissions`, submit | Application submitted (feeds admissions funnel). |
| PUB-VIT-003 | DESIGN | Compare to `daust-vitrine-design/` | Matches public-site design (separate from SIS redesign). |

---

## 8. Money & webhook deep-dive — `PAY` `[NEG][AUTHZ]`

Covers the PayTech IPN at `POST /api/finance/webhook/paytech` (`@Public`, `@HttpCode(200)`;
authenticity verified in service, `403 "IPN KO"` if invalid) and settlement invariants. Use
crafted IPN payloads (Appendix A.6 for HMAC computation).

| ID | Tags | Scenario | Expected |
|---|---|---|---|
| PAY-001 | FUNC | Initiate payment → PayTech redirect → valid IPN `sale_complete` (ref `MD-...`) | `settlePayment`: allocations oldest-due-first; installments paid/partial; invoice `amountPaid`/status roll up; audit `succeeded`; receipt emailed. |
| PAY-002 | NEG | IPN with a **bad HMAC** (Method-1 signature wrong) | Service rejects → controller **403 "IPN KO"**; no settlement. |
| PAY-003 | NEG | IPN with valid signature but **duplicate token** (replay) | Idempotent: `WebhookEvent.create({token})` collision → no-op `{valid:true}`; **no double credit**. |
| PAY-004 | NEG | IPN `type_event` != `sale_complete` (failure) on a `pending` payment | Cancels only the pending; no allocation. |
| PAY-005 | FUNC | IPN ref prefix `DINE-` | Routes to dining order settle; audit `paid-via-ipn`. |
| PAY-006 | FUNC | IPN ref prefix `APPFEE-` | Application fee marked paid; audit `application-fee-paid`. |
| PAY-007 | FUNC | IPN ref prefix `PLINK-` | Payment-link settled; link → paid. |
| PAY-008 | FUNC | IPN ref prefix `BILL-` | Public-bill payment settled. |
| PAY-009 | NEG | IPN missing ref/token | `{valid:false}` → 403; no state change. |
| PAY-010 | FUNC | Installment allocation with a partial amount | Oldest installment partial, remainder unallocated; invoice status `partial`. |
| PAY-011 | NEG | Overpay attempt via public bill checkout | Clamped to balance (no credit beyond); ties PUB-BILL-007. |
| PAY-012 | FUNC | Method-2 fallback IPN (sha256 key/secret hashes) | Accepted if Method-1 absent and hashes match. |
| PAY-013 | AUTHZ | Non-owner initiate (student B invoice) | 403 "Not your invoice" (ties RBAC-023). |
| PAY-014 | FUNC | `splitEvenXof` remainder | Earlier installments absorb the remainder; sum equals invoice exactly (integer XOF). |

---

## 9. Enrollment rule battery — `ENR` `[NEG]`

One focused case per `enroll()` guard, in order, using the seat-lock fixtures + Appendix A setup.
Most are also referenced from §2.2; this table is the authoritative rule-by-rule checklist.

| ID | Guard | Setup | Expected on `POST /api/academics/my/enroll` |
|---|---|---|---|
| ENR-001 | seat-lock | CSC 101-A cap=2, two concurrent last-seat enrolls | exactly one 200, one 409 "Section is full"; count ≤ cap |
| ENR-002 | section exists | random UUID sectionId | 404 |
| ENR-003 | registration window (endDate) | term ended | 400 "Registration is closed" |
| ENR-004 | add deadline | `addDeadline` past | 400 "add period closed" |
| ENR-005 | duplicate | already enrolled | 409 "Already enrolled" |
| ENR-006 | capacity | section full | 409 "Section is full" |
| ENR-007 | section status | status closed | 409 "This section is closed" |
| ENR-008 | student hold | active hold inserted | 403 "Registration is blocked by an active hold (...)" |
| ENR-009 | prerequisite+min grade | student lacks CSC 101 (or below min) | 400 "Missing prerequisite(s): ..." |
| ENR-010 | corequisite | coreq rule, coreq not concurrently enrolled/completed | 400 "Must be taken with (or after) ..." |
| ENR-011 | timetable clash | two sections same slot | 409 "Time conflict with ..." |
| ENR-012 | 30-credit cap | at 28, add 3 | 400 "Over the 30-credit limit" |
| ENR-013 | class standing | standingRequired above student | 403 |
| ENR-014 | major restriction | majorRestriction mismatched | 403 |
| ENR-015 | drop ownership | drop another student's enrollment | 403 "Not your enrollment" |
| ENR-016 | drop deadline | dropDeadline past | 400 |
| ENR-017 | drop happy path | own active enrollment before deadline | 200; audit `dropped` |
| ENR-018 | prereq satisfied (control) | Aïssatou has CSC 101=A, enroll CSC 201 | 200 |

---

## 10. Design-fidelity matrix — `DES` `[DESIGN]`

Per-screen verdict vs the prototype (`design/Student information system design (1)/`). Carries
`STUDENT-DESIGN-REVIEW.md` forward and extends to the other four portals. Verdict scale:
**Match** / **Close** (minor deltas) / **Partial** / **Divergent** (intentional — see Appendix B).

| ID | Screen | Verdict (baseline) | What to check |
|---|---|---|---|
| DES-STU-01 | Student Dashboard | Close | Stat-card icon placement + label casing (sentence vs upper). |
| DES-STU-02 | Registration | Match | Section-state badges (Add/Added/Unavailable/Conflict). |
| DES-STU-03 | My Courses | Close | Missing per-row "Materials" button. |
| DES-STU-04 | Schedule | Close | "Export .ics" present; current-day highlight kept. |
| DES-STU-05 | Grades | Close | 4th "Dean's List — N terms" stat card. |
| DES-STU-06 | Degree Audit | Close | "· Catalog {year}" subtitle; 2-col vs 3-col grid. |
| DES-STU-07 | Attendance | Close | "· Overall attendance X%" subtitle. |
| DES-STU-08 | Billing | Match | Data-driven Pay button (don't expect fixed prototype amount). |
| DES-STU-09 | Dining | **Divergent** | Real-data model vs swipe fiction — intentional (Appendix B). |
| DES-STU-10 | Housing | Match/Close | Fields hall/room/roommate/RA/move-in/contract. |
| DES-STU-11 | Announcements | — | Read-only feed. |
| DES-STU-12 | Messages | — | Thread list + composer parity. |
| DES-STU-13 | Profile | — | Read-only tabs. |
| DES-PAR-01 | Parent Dashboard | new | "Family overview" cards per child. |
| DES-PAR-02 | Parent Billing | check | Prototype shows Pay button; built is read-only — confirm intended. |
| DES-FAC-01 | Grade Entry | check | Section tabs + letter-grade selects + "Submit for approval". |
| DES-FAC-02 | Gradebook | check | Numeric grid + "Manage columns". |
| DES-FAC-03 | Attendance | check | Date picker + "All present". |
| DES-FAC-04 | Materials | check | 5 categories + multi-file. |
| DES-FAC-05 | Messages | check | Section + student selects. |
| DES-REG-01..N | Registrar screens | check | Each `h1` + primary action matches prototype (Admissions/Students/Parents/Success/Departments/Years/Programs/Catalog/Enrollment/Calendar/Rule Engine/Grading/Approvals/Roles/Security/Messages). |
| DES-FIN-01..N | Finance screens | check | Bursar Dashboard / Tuition & Fees ("Edit plan") / Student Accounts ("New billing", "Billings", "Account balances"). Note: management-accounting screens were **retired** (Appendix B). |
| DES-PUB-01 | Vitrine | check | Matches `daust-vitrine-design/`. |

---

## Appendix A — staging data setup (for `[NEG]` cases)

Run against the staging DB. These create the fixtures the seed deliberately omits.

- **A.1 Insert an active StudentHold** (for STU-REG-012 / ENR-008): insert a `StudentHold`
  row with `status='active'` for the target `studentId` (e.g. Aïssatou `stu_demo_aissatou`).
  Remove after the test.
- **A.2 Add a corequisite rule** (STU-REG-016 / ENR-010): add a `CourseRequisite`/coreq entry
  (or via `/admin/rules` → REG-RUL-002) so a course requires a concurrent coreq.
- **A.3 Close the add window** (STU-REG-014 / ENR-004): set the Fall 2026 term `addDeadline`
  to a past date via `/admin/calendar` (REG-CAL-001), or use a term already past add/drop.
- **A.4 Seat-lock race** (STU-REG-020 / ENR-001): with CSC 101-A cap=2 nearly full, fire two
  concurrent `POST /api/academics/my/enroll` for the last seat (two sessions / parallel requests).
- **A.5 Expired invite** (REG-PAR-007 / PUB-SET-004): create a guardian invite, then age its
  `createdAt`/expiry past `INVITE_TTL_HOURS=72` in the DB.
- **A.6 Crafted IPN** (§8): compute Method-1 HMAC-SHA256 of `amount|ref_command|api_key` keyed
  by `api_secret` (staging PayTech test keys); post to `/api/finance/webhook/paytech`. For
  PAY-002 send a wrong signature; for PAY-003 resend an accepted token.

> Record any inserted rows so they can be cleaned up; staging is shared.

## Appendix B — known intentional design deltas (do NOT log as bugs)

- **Dining** — built app uses the real meal-plan / pass / ordering model; the prototype's
  swipe-balance + dining-dollars figures are data the system doesn't capture (`STUDENT-DESIGN-REVIEW.md` §9).
- **Management-accounting screens** — retired in the finance redesign (commit "retire the
  management-accounting screens"); GL/statutory payroll deferred to a future ERP. Cost-center
  management-accounting only.
- **Retired portals** — dining console, student affairs, innovation portals removed; their data
  models linger only where student screens read them.
- **Stat-card label casing / minor per-screen deltas** — tracked in `STUDENT-DESIGN-REVIEW.md`;
  treat as design polish items, not functional defects.

## Appendix C — coverage traceability (fill during authoring/review)

- [ ] Every API endpoint in the inventory maps to ≥1 case (RBAC matrix + per-screen cases).
- [ ] Every `enroll()` guard has an ENR case (ENR-001..018 ✓).
- [ ] Every IPN branch has a PAY case (PAY-001..014 ✓).
- [ ] Every prototype screen has a DES row (§10 ✓).
- [ ] Every role has a positive landing case (AUTH-001..003 + portal dashboards) and a negative
      boundary case (RBAC matrix).
