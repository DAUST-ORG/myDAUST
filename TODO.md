# myDAUST — Remaining Work

Synthesized 2026-06-28 from a full 9-agent completion audit of the codebase vs the approved build plan and all 7 design prototypes. **Phases 1–5 are built and verified locally** (86 deliverables confirmed with evidence; all live endpoint checks 200/201). What follows is everything that is *not* done, ordered by how much it matters.

Legend: 🔴 defect/debt in built code · 🟠 plan item not built · 🟡 design-parity gap · ⚪ decision needed

## 1 · Correctness & hygiene — ✅ FIXED 2026-06-28 (fix-pack, all verified live)

- [ ] 🔴 **`apps/api/uploads/` is committed to git** — *the one remaining item; user action (git is user-managed):* add `apps/api/uploads/` to `.gitignore` and run `git rm --cached "apps/api/uploads/c2a5d2cd-10ef-4f42-8674-957764b172e2.txt"`.
- [x] ~~Reconciliation cancels instead of polling~~ → reconciliation is now **non-destructive**: it surfaces stale pendings for bursar review; new audited `confirm` (settles allocations like an IPN) and `cancel` actions in the collections UI. Poll-PayTech upgrade still blocked on PayTech exposing a status API.
- [ ] 🔴 **PayTech key rotation** — *user action:* rotate in the PayTech dashboard, update `.env`.
- [x] ~~No add/drop window~~ → `Term.addDeadline`/`dropDeadline` added, enforced in enroll/drop (verified 400s past deadline); registrar `admin-drop` bypasses with audit.
- [x] ~~No test suite~~ → **Vitest stood up: 31 tests** (shared: scholarship tiers, XOF splits, zod input refines · api: PayTech HMAC verify incl. forged/tampered, campus pass sign/verify, computeGpa, zod filter 400+delegation). Integration tests (seat-lock, IPN idempotency vs DB) still open — next tier.
- [x] ~~Dining settlement display-only~~ → director overview now aggregates paid dining orders into **3600** and paid application fees into **4200** (verified live: 3600=1,000 / 4200=30,000 after signed IPNs).
- [x] ~~Dining payOrder skips the rail~~ → routes through `PaymentProvider` checkout (ref `DINE-<orderId>`); the verified IPN marks the order paid (proven end-to-end with a real-signed webhook; forged IPN → 403). Direct settle only when no gateway keys (dev).
- [x] ~~Expenses create+list only~~ → PATCH/DELETE endpoints + edit/delete UI, audit-logged.

## 2 · Missing write-paths & role surfaces — ✅ FIXED 2026-06-28 (all verified live)

- [x] **Announcement compose** — `POST /comms/announcements` (admin/registrar/bursar/SA/HR/faculty) + composer UI on `/admin/announcements`; student compose correctly 403.
- [x] **Role management** — `PATCH /users/:id/roles` (it_admin/admin), APP_ROLES-validated, **audit-logged**, self-edit lockout guard (400); role-editor UI in admin Settings.
- [x] **Registrar surfaces** — `/admin/schedule` master week-grid + sections table; audited admin-drop.
- [x] **Admin student detail** — `/admin/students/[id]`: profile, GPA/credits, balance, enrollments with admin-drop.
- [x] **Innovation team/advisor** — add/remove member (by email) + set-advisor endpoints and UI on project detail.
- [x] **Housing money on the rail** — room assignment can bill a housing fee as an Invoice tagged **3700**, riding the existing billing/payment rail (verified: invoice lands in A/R).
- [x] **Application fee in Apply flow** — public `POST /applications/:id/fee-checkout` → PayTech; IPN ref `APPFEE-<id>` flips `feePaid` (verified end-to-end); "Pay application fee" button on the vitrine success screen; fee status column in the admissions funnel.
- [x] **Payment-plan templates** — `PLAN_TEMPLATES` + exact-sum `splitEvenXof` in shared; template picker prefills the plan form (unit-tested).

## 3 · Track P platform services (remaining)

- [ ] 🟠 **Real-time layer** — no polling/WebSocket anywhere; dining live feed and inbox only update on manual interaction. Cheapest: `setInterval` polling on scanner feed + inbox; proper: WS gateway (needs sticky sessions at deploy).
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
- [ ] 🟡 Dining console settings tab
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
- [ ] 🟠 **prod** environment (same modules; t4g.small, deletion protection, private RDS, NAT decision)
- [ ] 🟠 CI/CD: GitHub Actions + OIDC (repo isn't on GitHub yet — ⚪ decide org/repo)
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
