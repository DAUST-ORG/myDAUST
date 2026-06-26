# myDAUST — Architecture & Build Plan

> Working document. Consolidates the architecture decisions, rationale, stack, and structure agreed so far. Living doc — update as decisions evolve.
>
> _Last updated: 26 June 2026_

---

## 1. Overview & Scope

myDAUST is an internal campus management platform (Student Information System) for DAUST. It unifies students, faculty, staff, registration, academics, finance, and related operations into one system.

- **Type:** Internal tool, single institution (single-tenant). Also serves as a student developer project — which makes maintainability, documentation, and boring/proven tech first-class requirements, since contributors rotate.
- **Primary users:** Students, faculty, and administrative staff (all on DAUST Google Workspace).
- **Scale:** Small — a few hundred students plus faculty/staff (~500–1,000 total accounts); bursty load around registration. Correctness matters more than raw scale. Do not over-engineer for scale we do not have (no microservices, no Kubernetes).

## 2. Decisions at a Glance

| Area | Decision |
|---|---|
| Language | TypeScript end-to-end |
| Backend | NestJS (modular monolith) |
| ORM | Prisma (Drizzle as alternative) |
| Database | PostgreSQL (managed) |
| API style | REST + OpenAPI (tRPC only if all clients are first-party TS) |
| Frontend | Next.js + React + TypeScript, shadcn/ui |
| Monorepo | pnpm workspaces + Turborepo |
| Tests | Vitest |
| Object storage | Cloudflare R2 / S3 (file uploads — photos, documents) |
| Background jobs | BullMQ on Redis (add when needed) |
| Email / SMS | Resend (transactional); SMS provider for OTP |
| Observability | Sentry (errors) + metrics/traces + uptime monitor |
| Auth (authN) | Google Workspace SSO (direct Google OIDC) |
| Auth (authZ) | Own RBAC in Postgres + ownership checks |
| Tenancy | Single-tenant (internal, one institution) |

## 5. Monorepo Structure

pnpm workspaces + Turborepo. `apps/` = deployables; `packages/` = shared libraries.

```
mydaust/
├── apps/
│   ├── api/         # NestJS backend
│   ├── portal/      # authenticated web app (students, faculty, staff)
│   └── vitrine/     # public site (marketing/admissions, no login)
├── packages/
│   ├── db/          # Prisma schema, client, migrations, seed
│   ├── shared/      # Zod schemas + inferred types (the API contract)
│   ├── ui/          # shared React components (shadcn-based)
│   ├── eslint-config/
│   └── tsconfig/
├── turbo.json           # Turbo 2.x "tasks" pipeline + caching
├── pnpm-workspace.yaml
├── package.json
└── docker-compose.yml   # local Postgres
```

## 6. The Apps

**Day one:**

- **api** — the single NestJS backend. The real security boundary (authorizes every request by role).
- **portal** — the entire authenticated experience: students, faculty, and all staff as role-gated route groups in one app.
- **vitrine** — public, no-login marketing/admissions site. Separate because the only hard frontend boundary is who can even log in. Build it when marketing needs it; it is not the SIS core.

**Later, only if justified:**

- **admin** — split the heavy internal staff back-office out of `portal` if it diverges hard from the student/faculty experience. Most likely future addition; decide on evidence, not speculation.
- **mobile** — native student app, only if genuinely needed. The responsive `portal` likely covers phones; probably never.

**Principle:** org chart → roles + feature modules; audience/platform → apps. The only free frontend split is public-vs-authenticated. Different roles do not mean different apps — they mean different permissions and views inside one app.

- **Why not more apps (e.g. one per role):** separate frontend bundles add zero security — the real boundary is the API authorizing every request server-side. Splitting into N apps multiplies deploys, auth integrations, and maintenance with no benefit; route-based code-splitting already keeps each role's bundle small.
- **No free admin:** unlike batteries-included frameworks (Django/Frappe), this stack ships no automatic admin UI. The registrar/bursar/staff back-office is built as role areas in `portal` (and possibly the future `admin` app). Budget for it.

## 7. Inside the Portal App

```
apps/portal/src/
├── app/                 # ROUTING ONLY — thin pages
│   ├── (auth)/          # login, OAuth callback (no app shell)
│   └── (app)/           # authenticated shell
│       ├── layout.tsx   # gate 1: logged in? + renders nav
│       ├── page.tsx     # / -> redirect to role home
│       ├── student/     # /student/...  (layout.tsx = gate 2: role check)
│       ├── faculty/
│       ├── registrar/
│       ├── bursar/
│       ├── housing/
│       ├── dining/
│       └── innovation/
├── features/            # DOMAIN LOGIC by feature (enrollment, grades, billing)
│   └── <feature>/{components,hooks,api.ts}
├── components/          # portal-specific shell (nav, sidebar, breadcrumbs)
├── lib/                 # api-client, auth helpers, query-client (TanStack Query)
└── middleware.ts        # edge auth gate
```

- **Route groups vs segments:** `(auth)` / `(app)` are route groups (no URL effect; layout-only). Role names are real segments → `/student/grades`, meaningful URLs, no path collisions, and multi-role users simply get access to multiple areas.
- **Layered layouts = layered authorization:** `(app)/layout` checks login; each role's `layout.tsx` checks the role. The layout tree expresses authorization structurally — no per-page auth checks.
- **Thin pages, fat features:** `app/` decides which URL renders what; `features/` holds the actual logic, organized by domain not route, so multiple routes reuse a feature and a dev finds all of grades in one folder.
- **Data flow:** component → feature hook → `lib/api-client` → `apps/api`, typed end-to-end via `@mydaust/shared`.
- **Three component tiers:** `@mydaust/ui` (design system, shared with vitrine) / `apps/portal/src/components` (portal-only shell) / `features/*/components` (feature-specific).

## 8. Backend Structure (NestJS)

Modular monolith — one deploy, hard internal seams. Modules mirror the domain:

```
apps/api/src/
├── modules/
│   ├── auth/        # Google OIDC, sessions, guards
│   ├── people/      # students, faculty, staff
│   ├── academics/   # programs, courses, sections, enrollment, grades
│   ├── finance/     # invoicing, payments
│   └── comms/       # notifications (email, SMS)
├── common/          # guards, interceptors, filters, pipes
├── app.module.ts
└── main.ts
```

## 9. Domain Model & Core Business Logic

The heart of the SIS. Critical distinction: **Course is not Section.**

- **Course** — the abstract catalog entity (CS101, 3 credits). Exists regardless of term.
- **Section (Offering)** — a specific instance of a course in a term (CS101, Fall 2026, Section A, Prof X, MWF 10:00, Room 203, capacity 30).
- **Enrollment** — the join between Student and Section; carries enrollment status + grade. This is the beating heart: a transcript is enrollments grouped by student; a roster is enrollments by section; GPA is a weighted average over enrollments.

**Entities & relationships:**

- Person (base) → Student, Faculty (role profiles)
- Department → many Programs, Courses, and Faculty (one-to-many each)
- Program → many Students (admits)
- Course → many Sections
- Term → many Sections
- Faculty → many Sections (teaches)
- Room → many Sections (hosts)
- Student → many Enrollments → one Section (Student–Section is many-to-many through Enrollment)

Students enroll in **Sections**, never Courses. Do not simplify by merging the two — it rots the entire system.

### Key business logic & operations

The entities are the easy part; these operations carry the real complexity and are exactly why the logic lives in a real backend (not RLS/BaaS):

- **Enrollment with capacity + seat-locking:** registering into a full-or-nearly-full section must run inside a DB transaction with row-level locking (e.g. `SELECT ... FOR UPDATE` / a Prisma interactive transaction) so two concurrent enrollments cannot oversell the last seat.
- **Prerequisite validation:** enrollment checks the student's completed courses against the section's course prerequisites before allowing registration.
- **Add/drop:** enrollment status transitions within the add/drop window; outside it, locked.
- **Grade submission workflow:** faculty submit grades for their own sections (ownership-checked), with the change audit-logged.
- **GPA / transcript:** derived by aggregating enrollments (grade × credits) — never stored as a duplicated source of truth.
- **Tuition invoicing:** generated from enrollment (credits / section count) into the `finance` module.

## 10. Authentication & Authorization

**Principle: buy authN, build authZ.** Identity is a solved, high-stakes commodity (delegate it). Authorization is your domain logic (own it).

### Authentication — full Google Workspace SSO

All institutional users (students, faculty, staff):

- Direct Google OIDC (NestJS + Passport Google strategy). No managed auth vendor (Clerk/Auth0) needed, since there is exactly one identity source. Trade-off: you own session management yourself.
- **Domain-restrict** — verify the `hd` / email-verified claim on the server-side verified token (never trust the request param):

```ts
if (profile._json.hd !== 'daust.edu' || !profile._json.email_verified) {
  throw new UnauthorizedException('DAUST accounts only');
}
```

- Benefits: no password infrastructure, central MFA via Workspace, automatic deprovisioning when IT disables an account.

### Authorization — own RBAC in Postgres

Roles are your data, not Google's.

- Roles in a `user_roles` table (users can hold multiple). Map Google Workspace Groups → app roles (requires Admin SDK Directory API + a service account with domain-wide delegation), or assign roles manually in the back-office as a fallback.
- **Coarse role** — NestJS `@Roles('registrar')` decorator + `RolesGuard` on every protected endpoint.
- **Ownership / attribute** — in the service layer: faculty edit grades only for sections they teach; students see only their own records. (CASL for complex ability rules.) This is the correct, reviewable replacement for what would have been risky RLS.

### Sessions & security

- httpOnly + Secure + SameSite cookies; CSRF protection if cookie-based; never store tokens in localStorage.
- HTTPS only; short-lived access tokens + refresh.
- Role + ownership checks server-side on every endpoint — frontend gates are UX only, never the real boundary.
- Audit-log sensitive mutations (grade changes, financial transactions, role assignments).

**Gate layers (top to bottom):** `middleware.ts` (edge) → Next layouts (UX) → `RolesGuard` (real authN+authZ) → services (ownership) → audit log.

## 11. Org Structure → Roles & Modules

DAUST divisions and their departments map to roles + feature modules (not separate apps):

- **Academic Affairs:** Academic Programs & Faculty, Curriculum & Quality, Registrar → `academics` module; roles e.g. `registrar`, `faculty`.
- **Student Affairs:** Residential Life & Housing, Conduct & Disputes, Counseling & Wellness, Student Engagement → roles `housing`, `student_affairs`, `counseling`, etc.
- **Finance & Admin:** Finance & Accounting, Student Accounts / Bursar, Procurement, HR, Facilities, Dining / Auxiliary, IT / Information Systems → `finance` module; roles `bursar`, `finance`, `hr`, `facilities`, `dining`, `it_admin`.
- **Growth:** Marketing & Comms, Admissions.
- **Innovation:** Innovation Studio → role `innovation`.

The 7 designed portal experiences (student, teacher, student-affairs, dining, innovation, admin, vitrine) collapse to: route groups inside `portal` + `vitrine` as its own app. The designs map 1:1 onto role areas — design work is preserved, app count is not multiplied.

## 12. Deployment & Infrastructure

- **Containers** (AWS ECS Fargate) + **managed PostgreSQL** (RDS). For a lean start, a PaaS (Render / Railway) + managed Postgres is also fine and lower-ops.
- **Object storage** (S3) for file uploads — student photos, documents, transcripts. Do not store binaries in Postgres.
- **Background jobs** (BullMQ on Redis) for async work — bulk emails, report/transcript generation, payment reconciliation. Add only when a task actually needs it (Phase 1 may not).
- **Transactional email / SMS** (Amazon SES, or Resend/Postmark; an SMS provider for OTP) — driven by the `comms` module.
- **IaC** (Terraform / Pulumi), **CI/CD** (GitHub Actions).
- **Observability** — Sentry for errors, plus metrics/traces (Datadog, or self-hosted Grafana/Prometheus) and an uptime monitor (UptimeRobot). Wire in from day one.
- **Secrets** — in the platform's env-var store, never in git; validated at boot via `@t3-oss/env`.
- **Environments:** prod + staging minimum. Contributors test on staging, never deploy straight to prod.
- **Backups — non-negotiable.** Managed Postgres with automated daily backups + point-in-time recovery. We store grades and financial records; losing them is unrecoverable, technically and reputationally.

## 13. Conventions & Non-Negotiables

- PostgreSQL (relational + transactional) for the core — no document store.
- Managed DB with tested, off-box backups.
- Identity delegated to Google Workspace; never hand-roll passwords.
- Server-side authorization on every endpoint; the client is never trusted.
- Thin routes; domain logic in `features/` (frontend) and modules/services (backend).
- Shared types via Zod in `packages/shared`; the frontend never imports the DB package.
- One API paradigm (REST); no speculative flexibility.
- Audit logging on sensitive actions.

## 14. Open Questions / Pending Decisions

- **Applicants / admissions auth:** Google Workspace cannot cover prospective students (no account before admission). Decide: admissions out of scope for v1, or a separate auth path (personal email/Google) on `vitrine`.
- **Payments / mobile money:** if tuition is collected in-app, integrate Wave / Orange Money (Senegal). Scope TBD — confirm whether DAUST collects tuition through the system or externally.
- **Workspace Groups → roles:** confirm IT will grant Admin SDK Directory API access (service account + domain-wide delegation); otherwise fall back to manual role assignment in the back-office.
- **Admin app split:** decide later, based on whether internal staff tooling diverges enough from the student/faculty experience to warrant its own (`apps/admin`) app.
- **Mobile:** revisit only if a native student experience is genuinely required.
- **Multi-tenancy (only if productized):** myDAUST is single-tenant. If it ever becomes a product sold to other institutions, multi-tenancy (shared DB + `tenant_id` + RLS as defense-in-depth) must be designed in from the start — retrofitting tenant isolation later is one of the most painful refactors in software.

## 15. Next Steps

1. Scaffold the monorepo (pnpm + Turbo); create `packages/db` (Prisma schema for the ERD) and `packages/shared` (Zod schemas).
2. Stand up `apps/api` with the `academics` module + `auth` (Google OIDC, domain-locked).
3. Build the `RolesGuard` + `@Roles` decorator + a sample protected endpoint with an ownership check.
4. Implement the enrollment operation with transactional seat-locking as the first real piece of business logic.
5. Scaffold `apps/portal` with the `(app)` shell + one role area (e.g. `student`) as an end-to-end vertical slice.
6. Resolve the applicants/admissions auth question before building `vitrine`'s apply flow.
