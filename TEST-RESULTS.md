# myDAUST TEST-PLAN execution — daust-staging.azt.dev (2026-07-23)

Environment confirmed: portal+API `https://daust-staging.azt.dev`; vitrine `https://daust.azt.dev`;
pay-bill/billing-admin reachable as routes on the portal host (payment.* vanity host not in staging tunnel).
All 10 seeded logins work (password `daust-dev-2026`).

## Seed ground-truth (staging, differs from plan assumptions — NOT bugs)

- Aïssatou (stu_demo_aissatou): GPA 4.0 (only CSC 101=A, Spring 2026), 4 current enrollments / 11 credits, register badge=6.
  **Fall 2026 invoice total 3,500,000 is FULLY PAID (balance 0)** — plan STU-BILL-001 assumes a partial invoice. On staging the "settled → no Pay button" path (STU-BILL-003) applies. Will create a charge to exercise pay flow.
- Mamadou (stu_mamadou / DAUST-EE-24-0210): invoice 2,975,000 fully paid.
- Program: B.Sc. Computer Engineering.

## §1a AUTH (API-level) + §1b RBAC + §1c VAL + §8 PAY + §9 ENR — deterministic battery

44/44 PASS (api_battery.sh + follow-ups). Detail:

RBAC-001..026: all PASS (student/parent/faculty/bursar/hr/it boundaries 403; registrar finance override RBAC-012=200; it PATCH roles RBAC-017=200; admin positive controls 200). Message bodies confirmed: `{"message":"Insufficient role","statusCode":403}`.
RBAC-022 parent→non-linked child grades = 403 "You do not have access to that student".
RBAC-023 studentA pays studentB invoice = 403 "Not your invoice".
VAL-001 bad-uuid=400; VAL-002 missing=400; VAL-003 amount:-1=400; VAL-004 amount:1000.5=400 ("whole francs"); VAL-005 string amount=400; VAL-006 short pw=400; VAL-009 malformed JSON=400 (not 500, filter delegates); VAL-010 bad role enum=400.
AUTH-004 wrong pw=401; AUTH-005 unknown email=401; AUTH-006 empty=401; AUTH-009 /me authed=200; AUTH-011 no-cookie=401; AUTH-013 tampered JWT=401.
PAY-002 bad HMAC=403 "IPN KO"; PAY-009 missing ref=403.
ENR-002 random-uuid section=404.

Note: real `POST /finance/my/payments` uses field `amount` (plan says `amountXof`) — plan doc drift, app correct.

## §3 PARENT PORTAL (parent@daust.edu = Ousmane Diallo)

Seed note: linked children on staging are **Aïssatou Diallo + Sokhna Mbaye** (plan text says Aïssatou+Mamadou — seed drift, not a bug).

- NAV-001 (parent) PASS: caption "Parent Access"; Overview(Dashboard) + My child(Grades/Attendance/Billing); identity "Guardian · 2 children".
- PAR-SW-001 PASS: child switcher shows 2 children, one selected; PAR-SW-002 PASS: switch persists across screens (grades reflect selected child).
- PAR-DASH-001 PASS: stat cards per child (GPA/Standing/Credits/Attendance/Balance). PAR-DASH-002 PASS: switching Sokhna→Aïssatou flips standing 0.00 "Good Standing" → "Dean's List" (GPA 4.0). Confirms standing derivation (≥3.7 Dean's List) works.
- PAR-GRD-001 PASS: "Grades — Aïssatou Diallo", GPA 4.00, CSC 101 A, Spring 2026 == student view. PAR-GRD-002 PASS (API RBAC-022): non-linked child → 403.
- PAR-ATT-001 PASS: "Attendance — Aïssatou Diallo" per-course PRESENT/LATE/ABSENT. PAR-ATT-002: same 403 guard.
- PAR-BILL-001 PASS: "Billing — Aïssatou Diallo", installment table, SETTLED. PAR-BILL-002 PASS: **no Pay button** — guardian billing read-only (parent API has no payment route; prototype Pay button correctly omitted). PAR-BILL-003: assertGuardianOf 403 on non-linked.

## §4 FACULTY PORTAL (amadou.ba@daust.edu = Prof Ba, teaches all Fall sections)

- NAV-001 (faculty) PASS: caption "Faculty Portal"; Overview(Dashboard) + Teaching(Grade Entry, Gradebook, Attendance, Course Materials, Messages). FAC-DASH-001 PASS: "Welcome, Prof. Ba", KPIs render.
- FAC-GRD-001 PASS: Grade Entry — section picker (6 §A), roster (insights cohort DAUST-CE-24-0301..0306 + Aïssatou), letter-grade selects; set Sokhna B+, Save draft → "Draft saved", persists, status Draft.
- FAC-GRD-002 PASS: graded all 7, Submit for approval → status "Submitted" (gradeSubmission created for CE 201 Digital Systems and feeds registrar Grade Approvals). Under the current ledger contract, submission alone does **not** feed official GPA; that happens only after REG-GA-002 approval. **Historical test mutation on staging.**
- FAC-GRD-004 PASS: invalid grade "Z" → 400 enum validation.
- FAC-GRD-003/RBAC-021: grades/roster on non-owned(random) section → 404; **owned CE201 roster → 200** (positive control). True cross-instructor 403 needs a 2nd-instructor fixture (assertSectionOwner 403 path in code).
- FAC-GB-001 PASS: Gradebook — section picker, "Manage columns", assignment grid.
- FAC-ATT PASS (structure): "Take Attendance" — section+date pickers, present/late/absent toggles, "All present". FAC-ATT-004 non-owned → 404.
- FAC-MAT PASS (structure): "Course Materials", 5 category slots, upload. FAC-MAT-004 non-owned → refused (400).
- FAC-MSG PASS (structure): "Messages", section+student selects, Send/broadcast. FAC-MSG-003 broadcast non-owned → 404.

## §5 REGISTRAR/ADMIN PORTAL (registrar@daust.edu = Fatou Sow)

- NAV-001 (registrar): 17 items in correct groups (Overview / Academic structure / Policy & rules / Administration / Communication), routes match. **One label delta: "Roles & Permissions" (→/admin/staff) vs plan's "Faculty & Staff".** Badges data-driven (Admissions 5; Grade Approvals 1→0 after approval).
- NAV-003 PASS: footer "Fatou Sow · Registrar · Admin", caption "Registrar Portal". NAV-006 PASS: VIEW-AS absent (registrar not admin).
- REG-DASH-001 PASS: "Registrar Dashboard" stat tiles.
- REG-ADM-001 PASS: "Admissions", "New application", "All stages" filter, funnel data.
- REG-STU-001 PASS: "Students", "Add student", 9 rows, search.
- REG-PAR PASS: "Parents", "New parent", status badges. **REG-PAR-003 PASS (API): resend invite to activated parent → 400 "already set a password" (invite-takeover guard).**
- REG-SUC-001 PASS: "Student success", "Auto-send warnings (3)", per-student Send warning, level filter (All/At risk/Watch).
- REG-DEP-001 PASS (functional): added "QA Test Department" (QA) → appears in table. (cleaned up via API in cleanup.)
- REG-YR PASS: "Academic Years", "Add academic year" + "Set active", years 2023–2026, Active/Draft/Archived. (Active-year flip not executed — disruptive global change.)
- REG-PRG PASS: "Programs & Curriculum", "New program", programs listed.
- REG-CAT PASS: "Course Catalog", "New course", courses.
- REG-OFF PASS: "Course Enrollment", "Add course", Open(5)/Closed(0) filter, sections. (Close-section not executed — would break enroll tests.)
- REG-CAL PASS: "Academic Calendar & Terms", "Add event" + "Edit term", terms. (Add-deadline-past not executed — blocks all students.)
- REG-RUL-001 PASS (functional, reversible): set CSC 201 prereq=CSC 101(min C) → 200; drove **STU-REG-007/ENR-009 PASS**: bineta (no CSC 101) enroll CSC 201 → 400 "Missing prerequisite(s): CSC 101"; rule restored to [].
- REG-GS PASS: "Grading Scales & Schemes", schemes + rows.
- REG-STF-001 PASS: "Roles & Permissions" (/admin/staff), staff+roles. REG-STF-002 (API) bursar→403.
- REG-SET PASS: "Security & System" loads (no crash), Roles/Fee/Scholarship sections. **REG-SET-002 PASS (API): change own roles → 400 "lockout guard"; REG-SET-003 → 404; REG-SET-006 registrar getUsers → 403 (handled, no crash).**
- REG-GA-001 PASS: faculty submission appears "CE 201 Digital Systems §A · Submitted · Amadou Ba 7/7 graded". REG-GA-002 PASS: Approve → "Approved", 0 awaiting; FAC-GRD-005 PASS: Aïssatou grades now include CE 201=A, completedCredits 3→6, GPA 4.00.
- REG-MSG-001 PASS (functional): broadcast to All students → Sent list, 9 recipients, Success; **delivered to student INBOX threads** (verified in Aïssatou's threads). Note: registrar broadcasts deliver to inbox, not the announcements feed — plan STU-ANN-002 channel nuance (plan hedges "announcements/inbox").

## §6 FINANCE/BURSAR PORTAL (bursar@daust.edu = Mariama Ndiaye)

- NAV-001 (finance) PASS: caption "Finance Portal"; Overview(Dashboard) + Finance(Fee Schedule, Student Accounts). VIEW-AS absent.
- FIN-DASH-001 PASS: "Bursar Dashboard", receivables + owing list.
- FIN-FEE PASS: "Tuition & Fees", "Edit plan", money `2 975 000 FCFA` etc. FIN-FEE-002 PASS (API): fee-row negative → 400.
- FIN-ACC PASS: "Student Accounts", "New billing", tabs Billings/Account balances, 9 accounts. FIN-ACC-002 PASS (API): addCharge → balance +50k.
- **FINDING — FIN-DET standalone page MISSING**: `/finance/students/[id]` → hard 404; no `StudentAccountDetail` component/route in current build. Finance redesign consolidated account management into `/finance/accounts` (edit-billing modal via getStudentAccount + New billing). Payment-link/discount/plan-form/remove-charge/credit-memo UI not surfaced in finance portal (API endpoints exist; some in `/billing-admin`). Plan §6.4 predates the redesign.
- FIN-DET ops verified at API layer: FIN-DET-002 PASS (payment link → `/pay/<token>`, ref PLINK-, invoice-linked); FIN-DET-003/004 discount validation (negative→400) PASS; FIN-DET-008 PASS (removeCharge unpaid→200 hard-delete, credited:0); FIN-DET-011 PASS (student→admin account 403). FIN-DET-005/006 (must-total): schema 400 before must-total check — enforcement in code, not specifically driven.
- FIN-OPS-001 PASS (payments?status→200), FIN-OPS-004 PASS (cancel pending payment→201), FIN-OPS-008 PASS (cost-centers + director-overview→200).
- Money-invariant PASS: billed−paid=balance reconciles (3,550,000−3,500,000=50,000 with charge; back to 0 after remove).

## §2.9 Billing Pay-flow (revisited with live charge)

- STU-BILL-001 PASS: with 50k charge, student billing shows "Current balance 50 000 FCFA · Installment 1 of 1 due" + **"Pay 50 000 FCFA"** button (data-driven amount).
- STU-BILL-002 PASS (API): initiate → 201 `redirectUrl: https://paytech.sn/payment/checkout/...` (real PayTech redirect issued).
- STU-BILL-004 PASS: overpay (amount>balance) → 400 "Amount exceeds outstanding balance (50000 XOF)". STU-BILL-005 = RBAC-023 (403 Not your invoice).

## §7 PUBLIC SURFACES

- PUB-LNK-001 PASS: `/pay/<token>` shows "QA TEST CHARGE / Amount due 50 000 FCFA / Aïssatou Diallo / Ref PLINK-... / OM/Wave/Card/Bank / amount can't be changed".
- PUB-LNK-005 PASS: cancelled link → 404 "Link not found". PUB-LNK-006 PASS: garbage token → 404 (no enumeration).
- PUB-BILL UI PASS: "Pay my bill", Student ID + DOB fields, "View my balance", "never stored on this device", Staff-login link.
- PUB-BILL-004 PASS: wrong DOB → 404 "No account matches that ID and date of birth" (generic). **PUB-BILL-005/006 PASS: throttle → 429 after 6 attempts/5min per studentNo.**
- PUB-BILL-001/002/003/008/009 (positive lookup): BLOCKED — staging demo students have null DOB (DOB-gated flow is for prod's 298 real students). Clamp logic in checkoutBill (code + prod-verified per memory).
- PUB-ADM-001/002 PASS: `/billing-admin` own login view; student rejected "This account isn't a finance user. Sign in as a bursar or admin." "Restricted · Finance Office access only". PUB-ADM-003/004/005 = equivalent ops verified via API (addCharge/removeCharge/pay-bill?sid link).
- PUB-SET-005 PASS: `/set-password` no token → "This link is missing its invitation token." (no pw field). PUB-SET-003/004 PASS (API): bad/expired token redeem → 400. PUB-SET-002 = VAL-006 (short pw→400).
- PUB-VIT-001 PASS: vitrine home loads (title, h1, nav Admissions/Academics/Research/Campus/About resolve, Apply CTA, footer).

## §8 PAY webhook & settlement

- PAY-002 PASS: bad HMAC → 403 "IPN KO". PAY-009 PASS: missing ref/token → 403.
- PAY-007 confirmed: PLINK- ref branch (payment link created with ref PLINK-F2034AD0).
- PAY-013 = RBAC-023 PASS (non-owner initiate → 403). PAY-011 ties PUB-BILL-007 (clamp, DOB-gated).
- PAY-001/003/004/005/006/008/010/012 (valid-signature IPN settlement): BLOCKED — require the staging PayTech HMAC secret to craft a valid signature (not extracted; sandbox). Settlement logic verified in code + prod-verified per memory.

## §9 Enrollment battery status

- Live PASS: ENR-002 (404), ENR-003/STU-REG-015 (term-closed 400), ENR-005/STU-REG-011 (already-enrolled 409), ENR-009/STU-REG-007 (missing-prereq 400 via reversible rule fixture), ENR-018-equiv (MTH 210 enroll happy path).
- BLOCKED/deferred (fixture-heavy on shared staging): ENR-001/STU-REG-020 seat-lock race (2 concurrent sessions on 1-seat section), ENR-004 add-deadline, ENR-006 full, ENR-007 closed, ENR-008 hold, ENR-010 coreq, ENR-011 time-conflict, ENR-012 30-cap, ENR-013 standing, ENR-014 major, ENR-016 drop-deadline. All enforced in code (enroll() read + verified); not driven live to avoid polluting shared staging (would need section/term/hold fixtures affecting all users).

## Residual test mutations left on staging (intended, documented)

- Aïssatou enrolled in MTH 210 (STU-REG-004); CE 201 graded A via faculty-submit→registrar-approve (FAC-GRD/REG-GA), completedCredits 3→6.
- Broadcast "TEST-PLAN broadcast REG-MSG-001" + inbox reply in Aïssatou's threads.
- All money/charge/link/dept/payment artifacts CLEANED UP (balance back to 0, dept deleted, link+payment cancelled).

## UI phase (Playwright MCP)

### §1a AUTH (UI)

- AUTH-007 PASS: password toggle flips type password↔text, aria-label Show/Hide, value preserved.
- AUTH-001 PASS: student demo-chip login → redirect /student.
- AUTH-014 PASS: login layout matches — DAUST wordmark, email/password order, 6 demo chips (Registrar/Finance/Student/Faculty/Parent/Admin) present off-prod, password hint `daust-dev-2026`, navy/orange tokens.
- Minor: `/favicon.ico` 404 (cosmetic, only console error site-wide).

### §1d NAV / chrome (student)

- NAV-001 (student) PASS: sidebar groups+items+order EXACTLY match plan (Academics: Dashboard, Registration[6], My Courses, Schedule, Grades, Degree Progress, Attendance · Finance & campus: Billing, Dining, Housing · Communication: Announcements, Messages · Account: My Profile).
- NAV-002: register badge=6 shown; billing/messages badges absent (zero → hidden), consistent.
- NAV-004 PASS: header title+crumb match PAGE_META, {term}=Fall 2026.
- Caption "Student Portal"; identity line = name + program (data-driven). Plan text says footer meta "Student" — doc nuance, not a bug.

### §2.1 Dashboard STU-DASH

- STU-DASH-001 PASS: "Welcome back, Aïssatou"; cards GPA 4.00 / Enrolled 4·11cr / Balance 0 FCFA "Settled" / Attendance "—"; today's schedule + to-dos + degree 2% + announcements; no errors.
- STU-DASH-002 PASS: GPA card 4.00 == summary.
- STU-DASH-003 CORRECTED (screenshot-verified): stat-card eyebrow labels render **UPPERCASE** ("ENROLLED COURSES" etc.) and **icon is top-LEFT inline** (design note says top-right). DES-STU-01 = Close (2 minor deltas: uppercase labels, icon placement). Appendix-B polish class, not a functional defect.
- STU-DASH-004 PASS (Bineta, lightly-seeded): empty states clean — Enrolled 0, GPA 0.00, Balance 0 FCFA Settled, Attendance —, "No classes scheduled", "Nothing needs your attention". No errors.
- NAV-002 confirmed: Bineta Messages badge=1 (appears when >0), Registration badge=6.

### §2.2 Registration STU-REG

- STU-REG-001 PASS: catalogue live seats, enrolled→Unavailable, empty MTH 210→"+ Add", cart credit meter (11cr, cap 30).
- STU-REG-002 PASS: search "MTH" filters to MTH 210 only.
- STU-REG-003 PASS: +Add → "✓ Added", plan "1 selected", +4cr, total 15cr, Confirm enabled "(4 cr)".
- STU-REG-004 PASS: Confirm → "added to your schedule", MTH 210→1/30 seats & Unavailable, load 15cr. (Aïssatou now enrolled in MTH 210 — test-created.)
- STU-REG-011/ENR-005 PASS: enroll already-enrolled section → 409 "Already enrolled".
- STU-REG-015/ENR-003 PASS: enroll past-term section (CSC101 R203) → 400 "Registration is closed for this term".
- ENR-002 PASS: random-uuid section → 404 "Section not found".
- STU-REG-006/018 (prereq control): Aïssatou already enrolled in all offered sections → can't re-add cleanly; covered indirectly (MTH 210 enroll succeeded = happy path).
- STU-REG-007/010/013/016/017/018, ENR-004/006/007/008/010/011/012/013/014 (NEG: missing-prereq, full, closed, coreq, hold, standing, major, add-deadline, 30-cap, time-conflict): need admin/DB fixtures — pending admin-UI setup phase (rules, close section). Seat-lock race (020/ENR-001) needs 2 concurrent sessions on a 1-seat section.
- Minor: `my/registration` catalog includes a section whose term has ended (shown "Already enrolled" client-side); enroll guard correctly rejects it. Cosmetic catalog-scope nit.

### §2.3 My Courses STU-CRS

- STU-CRS-001 PASS: h1 "My Courses" / "Fall 2026 & past terms"; current enrollments + past courses w/ grade chips.
- STU-CRS-002 PASS: detail "CE 201 — Digital Systems" = overview + assignments.
- STU-CRS-003 (foreign section ownership): to check via API batch.

### §2.4 Schedule STU-SCH

- STU-SCH-001 PASS: "Weekly Schedule"/Fall 2026, blocks plotted.
- STU-SCH-002 PASS: newly-enrolled MTH 210 block appears.
- STU-SCH-003 DESIGN GAP: **"Export .ics" button ABSENT** (known §4 delta, still missing). DES-STU-04 = Close.

### §2.5 Grades STU-GRD

- STU-GRD-001/002 PASS: "Grades & Transcript"/"Unofficial record"; cards Cumulative GPA 4.00 / Credits Earned 3 / Credits in Progress 15; Spring 2026 term GPA 4.00 → CSC 101 A. GPA = 4×3/3 = 4.00 exact.
- STU-GRD-003: no explicit standing label ("Dean's List"/"Good Standing") rendered — Partial (design may omit).
- STU-GRD-004 DESIGN GAP: **only 3 stat cards, no 4th "Dean's List — N terms" card** (staging 3rd card is "Credits in progress"). DES-STU-05 = Close.
- Casing note: Grades stat-card labels UPPERCASE vs Dashboard sentence-case — inconsistency across screens (polish).

### §2.6 Degree Audit STU-DEG

- STU-DEG-001 PASS: 2% toward degree; 3 earned / 15 in progress / 114 remaining / 132 total (reconciles); category cards Core Engineering 0/40, Computer Science 3/36 w/ "N to go".
- STU-DEG-004 DESIGN GAP: **"· Catalog {year}" subtitle ABSENT** (subtitle = program only). DES-STU-06 = Close.

### §2.7 Attendance STU-ATT

- STU-ATT-001/003 PASS: per-course PRESENT/LATE/ABSENT/RATE; CE 201 & CSC 101 rows, RATE "—" (no sessions → null).
- STU-ATT-002: no seeded sessions for Aïssatou → ½ formula verified in code, not live.
- STU-ATT-004 DESIGN GAP: **"· Overall attendance X%" subtitle ABSENT**. DES-STU-07 = Close.

### §2.9 Billing STU-BILL

- STU-BILL-003 PASS: settled invoice → "0 FCFA / Account settled", installment table (DESCRIPTION/AMOUNT/DUE/STATUS), **no Pay button** (data-driven). Money `1 500 000 FCFA` space-grouped no decimals (global money convention PASS).
- STU-BILL-001/002 (partial invoice + Pay→PayTech redirect): Aïssatou is paid-in-full on staging → will exercise via a bursar-added charge in Finance phase.

### §2.10 Dining STU-DIN

- STU-DIN-001 PASS: "Dining & Meal Plan", full plan active, tabs Home/Pass/Weekend orders/My plan, next meal + today's menu.
- STU-DIN-006 = Divergent (intentional): real meal-plan/pass/order model, no swipe/dining-dollars fiction (Appendix B). DES-STU-09.

### §2.11 Housing STU-HOU

- STU-HOU-001 PASS: assignment card — Building Gorée Hall, Room G-214, Room Type Upper-year·Women, Roommate "None assigned", Status assigned, Note.
- DES-STU-10 = Partial: RA / move-in date / contract fields (in plan spec) NOT rendered.

### §2.12–2.16 remaining student screens

- STU-ANN-001 PASS: read-only feed (source/date/title/body), no compose.
- STU-MSG-001 PASS: thread list (Fatou Sow, Amadou Ba), first auto-opens, composer + New. STU-MSG-002 PASS: reply posts, input clears.
- STU-PRO-001/002 PASS: tabs Overview/Personal/Academic/Emergency&Health, no edit/save (read-only).
- STU-ID-001 PASS: "Student ID" + name + DAUST-CE-23-0142 + QR. STU-ID-002: pass token dot-separated `studentId.sig` (len 82); tamper-reject enforced by verifyPass (scanner endpoint out of UI scope).
- STU-DOC-001 PASS: transcript GPA 4.00 (== grades) + terms + Print. STU-DOC-002 hub links present.
- STU-ASG-001 PASS: To-do 4 / Awaiting 0 / Graded 0 / returned 0; MTH 210 & CE 201 items with due + Submit.
- STU-CRS-003 PASS (API): foreign section → 404. STU-ASG-005 PASS: foreign submit → 404. VAL-007 PASS: uploads no-file → 400.
- RBAC-024 (foreign dining order) → 404 for non-existent id (403 ownership path in code); RBAC-025 (non-participant thread) → 403 PASS.
